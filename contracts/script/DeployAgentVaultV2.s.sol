// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {AgentVaultV2} from "../src/AgentVaultV2.sol";

contract DeployAgentVaultV2 is Script {
    function run() external returns (AgentVaultV2 deployed) {
        vm.startBroadcast();
        deployed = new AgentVaultV2();
        vm.stopBroadcast();
    }
}
