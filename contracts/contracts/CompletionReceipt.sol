// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice 最小完成声明登记。链上只保存随机凭证编号，不保存用户、活动或正文。
contract CompletionReceipt {
    address public immutable submitter;
    mapping(bytes32 => bool) private _receipts;

    event ReceiptRegistered(bytes32 indexed receiptId);

    error NotSubmitter();
    error ZeroReceipt();
    error ReceiptAlreadyRegistered();

    constructor(address initialSubmitter) {
        require(initialSubmitter != address(0), "submitter is zero address");
        submitter = initialSubmitter;
    }

    function registerReceipt(bytes32 receiptId) external {
        if (msg.sender != submitter) revert NotSubmitter();
        if (receiptId == bytes32(0)) revert ZeroReceipt();
        if (_receipts[receiptId]) revert ReceiptAlreadyRegistered();

        _receipts[receiptId] = true;
        emit ReceiptRegistered(receiptId);
    }

    function exists(bytes32 receiptId) external view returns (bool) {
        return _receipts[receiptId];
    }
}
