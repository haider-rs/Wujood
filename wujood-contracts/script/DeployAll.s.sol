// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/Groth16Verifier.sol";
import "../src/TicketFactory.sol";

contract DeployAll is Script {
    function run() external {
        vm.startBroadcast();

        // 1. Deploy verifier
        Groth16Verifier verifier = new Groth16Verifier();

        // 2. Deploy factory — auto-deploys RewardsPool inside constructor
        TicketFactory factory = new TicketFactory(address(verifier));

        vm.stopBroadcast();

        // That's it. Everything is wired.
        console.log("Groth16Verifier:", address(verifier));
        console.log("TicketFactory:  ", address(factory));
        console.log("RewardsPool:    ", address(factory.rewardsPool()));
        console.log("");
        console.log(".env.local:");
        console.log("  NEXT_PUBLIC_FACTORY_ADDRESS=", address(factory));
        console.log("  NEXT_PUBLIC_REWARDS_POOL=", address(factory.rewardsPool()));
        console.log("  NEXT_PUBLIC_ZK_VERIFIER=", address(verifier));
    }
}
