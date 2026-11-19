// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice Non-transferable completion badges with fully on-chain, immutable metadata.
contract ReadingBadge is ERC721 {
    using Strings for uint256;

    struct Completion {
        uint256 campaignId;
        bytes32 bookHash;
        bytes32 evidenceHash;
        uint64 completedAt;
        uint16 coverageBps;
    }

    address public immutable issuer;
    uint256 public totalSupply;
    mapping(uint256 => Completion) public completions;

    error OnlyIssuer();
    error Soulbound();

    constructor(address issuer_) ERC721("Do Something Reading Badge", "DSREAD") {
        issuer = issuer_;
    }

    function mint(address reader, Completion calldata completion) external returns (uint256 tokenId) {
        if (msg.sender != issuer) revert OnlyIssuer();
        tokenId = ++totalSupply;
        completions[tokenId] = completion;
        _safeMint(reader, tokenId);
    }

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (_ownerOf(tokenId) != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        Completion memory completion = completions[tokenId];
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">',
            '<rect width="600" height="600" rx="40" fill="#0b1114"/>',
            '<circle cx="300" cy="260" r="155" fill="#142a27" stroke="#b6dfca" stroke-width="2"/>',
            '<path d="M210 205 Q255 190 300 215 Q345 190 390 205 V320 Q345 305 300 330 Q255 305 210 320 Z M300 215 V330" fill="none" stroke="#e7ce8c" stroke-width="8"/>',
            '<g fill="#f1eee4" text-anchor="middle" font-family="sans-serif">',
            '<text x="300" y="70" font-size="22">do something</text>',
            '<text x="300" y="460" font-size="30">READ TOGETHER</text>',
            '<text x="300" y="510" font-size="18">Campaign ', completion.campaignId.toString(),
            ' / Badge ', tokenId.toString(), '</text></g></svg>'
        );
        string memory attributes = string.concat(
            '[{"trait_type":"Campaign","value":', completion.campaignId.toString(),
            '},{"trait_type":"Coverage basis points","value":', uint256(completion.coverageBps).toString(),
            '},{"trait_type":"Completed at","value":', uint256(completion.completedAt).toString(),
            '},{"trait_type":"Last chapter completed","value":"Yes"}',
            ',{"trait_type":"Book hash","value":"', uint256(completion.bookHash).toHexString(32),
            '"},{"trait_type":"Evidence hash","value":"', uint256(completion.evidenceHash).toHexString(32), '"}]'
        );
        return string.concat('data:application/json;base64,', Base64.encode(bytes(string.concat(
            '{"name":"Read Together #', tokenId.toString(),
            '","description":"An account-bound record of meeting the campaign reading criteria. Issued from an authorized attestation.",',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(svg)),
            '","attributes":', attributes, '}'
        ))));
    }
}
