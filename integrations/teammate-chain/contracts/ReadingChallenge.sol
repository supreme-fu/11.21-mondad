// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ReadingBadge} from "./ReadingBadge.sol";

/// @notice Sponsor-funded reading challenges. The attestor is trusted for off-chain facts.
contract ReadingChallenge is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum RewardKind { Reading, Review }

    struct CampaignConfig {
        bytes32 bookHash;
        bytes32 rulesHash;
        uint64 startsAt;
        uint64 endsAt;
        uint64 claimDeadline;
        uint32 capacity;
        uint256 readingReward;
        uint256 reviewReward;
    }

    struct Campaign {
        address sponsor;
        CampaignConfig config;
        uint32 joined;
        uint256 remainingBudget;
    }

    struct Enrollment {
        uint256 campaignId;
        address reader;
        bytes32 subject;
        bool alreadyCompleted;
        uint64 deadline;
    }

    struct Participation {
        bytes32 subject;
        uint64 joinedAt;
        bool alreadyCompleted;
    }

    struct Achievement {
        uint256 campaignId;
        address reader;
        bytes32 subject;
        RewardKind kind;
        uint16 coverageBps;
        bool lastChapterCompleted;
        bytes32 evidenceHash;
        uint64 occurredAt;
        uint64 deadline;
    }

    bytes32 public constant ENROLLMENT_TYPEHASH = keccak256(
        "Enrollment(uint256 campaignId,address reader,bytes32 subject,bool alreadyCompleted,uint64 deadline)"
    );
    bytes32 public constant ACHIEVEMENT_TYPEHASH = keccak256(
        "Achievement(uint256 campaignId,address reader,bytes32 subject,uint8 kind,uint16 coverageBps,bool lastChapterCompleted,bytes32 evidenceHash,uint64 occurredAt,uint64 deadline)"
    );
    uint16 public constant REQUIRED_COVERAGE_BPS = 8000;

    IERC20 public immutable rewardToken;
    address public immutable attestor;
    ReadingBadge public immutable badge;
    uint256 public campaignCount;

    mapping(uint256 => Campaign) private campaigns;
    mapping(uint256 => mapping(address => Participation)) public participants;
    mapping(uint256 => mapping(bytes32 => address)) public subjectWallet;
    mapping(uint256 => mapping(address => mapping(RewardKind => bool))) public claimed;

    error InvalidConfiguration();
    error UnknownCampaign();
    error InvalidSignature();
    error Expired();
    error InvalidEnrollment();
    error CapacityReached();
    error InvalidAchievement();
    error AlreadyClaimed();
    error ReadingIncomplete();
    error AlreadyCompletedBeforeJoining();
    error UnsupportedToken();
    error WithdrawalUnavailable();

    event CampaignCreated(uint256 indexed campaignId, address indexed sponsor, bytes32 indexed bookHash, bytes32 rulesHash, uint256 budget);
    event Joined(uint256 indexed campaignId, address indexed reader);
    event RewardClaimed(uint256 indexed campaignId, address indexed reader, RewardKind indexed kind, uint256 amount, bytes32 evidenceHash);
    event BadgeIssued(uint256 indexed campaignId, address indexed reader, uint256 indexed tokenId);
    event BudgetReturned(uint256 indexed campaignId, address indexed sponsor, uint256 amount);

    constructor(IERC20 token_, address attestor_) EIP712("DoSomethingReading", "1") {
        if (address(token_).code.length == 0 || attestor_ == address(0)) revert InvalidConfiguration();
        rewardToken = token_;
        attestor = attestor_;
        badge = new ReadingBadge(address(this));
    }

    function getCampaign(uint256 campaignId) external view returns (Campaign memory) {
        return _campaign(campaignId);
    }

    /// @dev Fully fund the worst-case payout before publishing immutable campaign terms.
    function createCampaign(CampaignConfig calldata config) external nonReentrant returns (uint256 campaignId) {
        if (
            config.bookHash == bytes32(0) || config.rulesHash == bytes32(0) || config.capacity == 0 ||
            config.startsAt < block.timestamp || config.endsAt <= config.startsAt ||
            config.claimDeadline <= config.endsAt || config.readingReward == 0 || config.reviewReward == 0
        ) revert InvalidConfiguration();

        uint256 budget = uint256(config.capacity) * (config.readingReward + config.reviewReward);
        uint256 balanceBefore = rewardToken.balanceOf(address(this));
        rewardToken.safeTransferFrom(msg.sender, address(this), budget);
        if (rewardToken.balanceOf(address(this)) - balanceBefore != budget) revert UnsupportedToken();

        campaignId = ++campaignCount;
        Campaign storage campaign = campaigns[campaignId];
        campaign.sponsor = msg.sender;
        campaign.config = config;
        campaign.remainingBudget = budget;
        emit CampaignCreated(campaignId, msg.sender, config.bookHash, config.rulesHash, budget);
    }

    /// @dev The attestor binds one campaign-scoped pseudonymous reading identity to one wallet.
    function join(Enrollment calldata enrollment, bytes calldata signature) external {
        Campaign storage campaign = _campaign(enrollment.campaignId);
        if (block.timestamp > enrollment.deadline || block.timestamp >= campaign.config.endsAt) revert Expired();
        if (
            enrollment.reader != msg.sender || enrollment.subject == bytes32(0) ||
            participants[enrollment.campaignId][msg.sender].subject != bytes32(0) ||
            subjectWallet[enrollment.campaignId][enrollment.subject] != address(0)
        ) revert InvalidEnrollment();
        if (campaign.joined >= campaign.config.capacity) revert CapacityReached();
        bytes32 structHash = keccak256(abi.encode(
            ENROLLMENT_TYPEHASH, enrollment.campaignId, enrollment.reader, enrollment.subject,
            enrollment.alreadyCompleted, enrollment.deadline
        ));
        _verify(structHash, signature);
        participants[enrollment.campaignId][msg.sender] = Participation(
            enrollment.subject, uint64(block.timestamp), enrollment.alreadyCompleted
        );
        subjectWallet[enrollment.campaignId][enrollment.subject] = msg.sender;
        campaign.joined++;
        emit Joined(enrollment.campaignId, msg.sender);
    }

    function claim(Achievement calldata achievement, bytes calldata signature) external nonReentrant {
        Campaign storage campaign = _campaign(achievement.campaignId);
        Participation memory participation = participants[achievement.campaignId][msg.sender];
        if (block.timestamp > achievement.deadline || block.timestamp > campaign.config.claimDeadline) revert Expired();
        if (
            achievement.reader != msg.sender || participation.subject == bytes32(0) ||
            achievement.subject != participation.subject || achievement.evidenceHash == bytes32(0) ||
            achievement.coverageBps > 10000 || achievement.occurredAt < campaign.config.startsAt ||
            achievement.occurredAt < participation.joinedAt || achievement.occurredAt > campaign.config.endsAt ||
            achievement.occurredAt > block.timestamp
        ) revert InvalidAchievement();
        if (claimed[achievement.campaignId][msg.sender][achievement.kind]) revert AlreadyClaimed();
        bytes32 structHash = keccak256(abi.encode(
            ACHIEVEMENT_TYPEHASH, achievement.campaignId, achievement.reader, achievement.subject,
            achievement.kind, achievement.coverageBps, achievement.lastChapterCompleted,
            achievement.evidenceHash, achievement.occurredAt, achievement.deadline
        ));
        _verify(structHash, signature);

        uint256 reward = campaign.config.reviewReward;
        if (achievement.kind == RewardKind.Reading) {
            if (participation.alreadyCompleted) revert AlreadyCompletedBeforeJoining();
            if (achievement.coverageBps < REQUIRED_COVERAGE_BPS || !achievement.lastChapterCompleted) revert ReadingIncomplete();
            reward = campaign.config.readingReward;
        }

        claimed[achievement.campaignId][msg.sender][achievement.kind] = true;
        campaign.remainingBudget -= reward;
        if (achievement.kind == RewardKind.Reading) {
            uint256 tokenId = badge.mint(msg.sender, ReadingBadge.Completion(
                achievement.campaignId, campaign.config.bookHash, achievement.evidenceHash,
                achievement.occurredAt, achievement.coverageBps
            ));
            emit BadgeIssued(achievement.campaignId, msg.sender, tokenId);
        }
        rewardToken.safeTransfer(msg.sender, reward);
        emit RewardClaimed(achievement.campaignId, msg.sender, achievement.kind, reward, achievement.evidenceHash);
    }

    /// @notice Only the sponsoring account can recover this campaign's unclaimed funds, after claims close.
    function withdrawRemainder(uint256 campaignId) external nonReentrant {
        Campaign storage campaign = _campaign(campaignId);
        if (msg.sender != campaign.sponsor || block.timestamp <= campaign.config.claimDeadline) revert WithdrawalUnavailable();
        uint256 amount = campaign.remainingBudget;
        if (amount == 0) revert WithdrawalUnavailable();
        campaign.remainingBudget = 0;
        rewardToken.safeTransfer(msg.sender, amount);
        emit BudgetReturned(campaignId, msg.sender, amount);
    }

    function _campaign(uint256 campaignId) private view returns (Campaign storage campaign) {
        campaign = campaigns[campaignId];
        if (campaign.sponsor == address(0)) revert UnknownCampaign();
    }

    function _verify(bytes32 structHash, bytes calldata signature) private view {
        if (!SignatureChecker.isValidSignatureNow(attestor, _hashTypedDataV4(structHash), signature)) revert InvalidSignature();
    }
}
