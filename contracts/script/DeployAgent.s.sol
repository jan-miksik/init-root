// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Agent} from "../src/Agent.sol";

contract DeployAgent is Script {
    function run() external returns (address deployed) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerPrivateKey);
        Agent agent = new Agent();
        vm.stopBroadcast();

        deployed = address(agent);
        console.log("Agent deployed at:", deployed);

        // Write address to .env.contracts for frontend consumption
        string memory envLine = string.concat("VITE_AGENT_CONTRACT_ADDRESS=", vm.toString(deployed));
        console.log(envLine);
    }
}
