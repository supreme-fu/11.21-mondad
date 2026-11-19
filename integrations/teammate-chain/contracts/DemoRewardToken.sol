// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fixed-supply demonstration tokens. Real reading benefits need a separate agreement.
contract DemoRewardToken is ERC20 {
    constructor(address sponsor, uint256 supply) ERC20("Do Something Demo", "DSDEMO") {
        _mint(sponsor, supply);
    }
}
