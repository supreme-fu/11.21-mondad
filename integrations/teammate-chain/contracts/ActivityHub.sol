// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice One reward pool per activity, with independent completion and contribution claims.
contract ActivityHub is ERC721, EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Strings for uint256;

    struct Terms {
        bytes32 rulesHash;
        uint64 endsAt;
        uint64 claimDeadline;
        uint32 capacity;
        uint16 minScore;
        bool requiresFinalCheck;
        uint128 completionReward;
        uint128 contributionReward;
    }

    struct Activity {
        address host;
        Terms terms;
        uint32 joined;
        uint256 remaining;
    }

    struct Proof {
        uint256 activityId;
        address member;
        uint8 kind;
        uint16 score;
        bool finalCheck;
        uint64 occurredAt;
        uint64 deadline;
        bytes32 evidenceHash;
    }

    IERC20 public immutable rewardToken;
    address public immutable attestor;
    uint256 public activityCount;
    uint256 public badgeCount;
    mapping(uint256 => Activity) public activities;
    mapping(uint256 => mapping(address => uint64)) public joinedAt;
    mapping(uint256 => mapping(address => mapping(uint8 => bool))) public claimed;
    mapping(uint256 => uint256) public badgeActivity;

    bytes32 private constant JOIN = keccak256("Join(uint256 activityId,address member,uint64 deadline)");
    bytes32 private constant PROOF = keccak256("Proof(uint256 activityId,address member,uint8 kind,uint16 score,bool finalCheck,uint64 occurredAt,uint64 deadline,bytes32 evidenceHash)");

    error InvalidTerms();
    error Closed();
    error InvalidMember();
    error InvalidProof();
    error AlreadyClaimed();
    error Incomplete();
    error LockedBadge();

    event ActivityPublished(uint256 indexed activityId, address indexed host, bytes32 indexed rulesHash, uint256 budget);
    event MemberJoined(uint256 indexed activityId, address indexed member);
    event RewardPaid(uint256 indexed activityId, address indexed member, uint8 indexed kind, uint256 amount, bytes32 evidenceHash);
    event CompletionBadge(uint256 indexed activityId, address indexed member, uint256 indexed badgeId);
    event PoolReturned(uint256 indexed activityId, address indexed host, uint256 amount);

    constructor(IERC20 token, address authority) ERC721("Do Something Activity Badge", "DSBADGE") EIP712("DoSomethingActivities", "1") {
        if (address(token).code.length == 0 || authority == address(0)) revert InvalidTerms();
        rewardToken = token;
        attestor = authority;
    }

    function publish(Terms calldata terms) external nonReentrant returns (uint256 activityId) {
        if (
            terms.rulesHash == bytes32(0) || terms.endsAt <= block.timestamp || terms.claimDeadline <= terms.endsAt ||
            terms.capacity == 0 || terms.minScore == 0 || terms.minScore > 10000 || terms.completionReward == 0
        ) revert InvalidTerms();
        uint256 budget = uint256(terms.capacity) * (uint256(terms.completionReward) + terms.contributionReward);
        uint256 beforeBalance = rewardToken.balanceOf(address(this));
        rewardToken.safeTransferFrom(msg.sender, address(this), budget);
        if (rewardToken.balanceOf(address(this)) - beforeBalance != budget) revert InvalidTerms();
        activityId = ++activityCount;
        activities[activityId] = Activity(msg.sender, terms, 0, budget);
        emit ActivityPublished(activityId, msg.sender, terms.rulesHash, budget);
    }

    function join(uint256 activityId, uint64 deadline, bytes calldata signature) external {
        Activity storage activity = activities[activityId];
        if (block.timestamp >= activity.terms.endsAt || block.timestamp > deadline) revert Closed();
        if (activity.joined >= activity.terms.capacity || joinedAt[activityId][msg.sender] != 0) revert InvalidMember();
        _verify(keccak256(abi.encode(JOIN, activityId, msg.sender, deadline)), signature);
        joinedAt[activityId][msg.sender] = uint64(block.timestamp);
        activity.joined++;
        emit MemberJoined(activityId, msg.sender);
    }

    function claim(Proof calldata proof, bytes calldata signature) external nonReentrant {
        Activity storage activity = activities[proof.activityId];
        uint64 enrollment = joinedAt[proof.activityId][msg.sender];
        if (block.timestamp > activity.terms.claimDeadline || block.timestamp > proof.deadline) revert Closed();
        if (proof.member != msg.sender || enrollment == 0) revert InvalidMember();
        if (claimed[proof.activityId][msg.sender][proof.kind]) revert AlreadyClaimed();
        if (
            proof.kind > 1 || proof.score > 10000 || proof.evidenceHash == bytes32(0) ||
            proof.occurredAt < enrollment || proof.occurredAt > activity.terms.endsAt || proof.occurredAt > block.timestamp
        ) revert InvalidProof();
        _verify(keccak256(abi.encode(PROOF, proof.activityId, proof.member, proof.kind, proof.score, proof.finalCheck,
            proof.occurredAt, proof.deadline, proof.evidenceHash)), signature);
        uint256 amount = activity.terms.contributionReward;
        if (proof.kind == 0) {
            if (proof.score < activity.terms.minScore || (activity.terms.requiresFinalCheck && !proof.finalCheck)) revert Incomplete();
            amount = activity.terms.completionReward;
        }
        if (amount == 0) revert Incomplete();
        claimed[proof.activityId][msg.sender][proof.kind] = true;
        activity.remaining -= amount;
        if (proof.kind == 0) {
            uint256 badgeId = ++badgeCount;
            badgeActivity[badgeId] = proof.activityId;
            _safeMint(msg.sender, badgeId);
            emit CompletionBadge(proof.activityId, msg.sender, badgeId);
        }
        rewardToken.safeTransfer(msg.sender, amount);
        emit RewardPaid(proof.activityId, msg.sender, proof.kind, amount, proof.evidenceHash);
    }

    function returnPool(uint256 activityId) external nonReentrant {
        Activity storage activity = activities[activityId];
        if (msg.sender != activity.host) revert InvalidMember();
        if (block.timestamp <= activity.terms.claimDeadline || activity.remaining == 0) revert Closed();
        uint256 amount = activity.remaining;
        activity.remaining = 0;
        rewardToken.safeTransfer(msg.sender, amount);
        emit PoolReturned(activityId, msg.sender, amount);
    }

    function approve(address, uint256) public pure override { revert LockedBadge(); }
    function setApprovalForAll(address, bool) public pure override { revert LockedBadge(); }

    function _update(address to, uint256 badgeId, address auth) internal override returns (address) {
        if (_ownerOf(badgeId) != address(0)) revert LockedBadge();
        return super._update(to, badgeId, auth);
    }

    function tokenURI(uint256 badgeId) public view override returns (string memory) {
        _requireOwned(badgeId);
        return string.concat('data:application/json;base64,', Base64.encode(bytes(string.concat(
            '{"name":"Do Something #', badgeId.toString(), '","description":"Non-transferable activity completion badge",',
            '"attributes":[{"trait_type":"Activity","value":', badgeActivity[badgeId].toString(), '}]}'
        ))));
    }

    function _verify(bytes32 payload, bytes calldata signature) private view {
        if (!SignatureChecker.isValidSignatureNow(attestor, _hashTypedDataV4(payload), signature)) revert InvalidProof();
    }
}
