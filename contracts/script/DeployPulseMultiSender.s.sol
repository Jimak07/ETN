// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Script, console2 } from "forge-std/Script.sol";

import { PulseMultiSender } from "../src/PulseMultiSender.sol";

/**
 * @title DeployPulseMultiSender
 * @notice Deploys the batch sender to whichever chain `--rpc-url` points at.
 *
 * The private key is read from the environment and never hard-coded, so a
 * deployment cannot accidentally leak a signer into git history. Use a
 * throwaway deployer key: the contract has no owner, no constructor arguments
 * and no privileged functions, so the deployer retains no power afterwards.
 *
 *   forge script script/DeployPulseMultiSender.s.sol \
 *     --rpc-url electroneum --broadcast --slow
 *
 * Add `--verify` (and the explorer flags in contracts/README.md) to publish the
 * source in the same run.
 */
contract DeployPulseMultiSender is Script {
    function run() external returns (PulseMultiSender sender) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);
        sender = new PulseMultiSender();
        vm.stopBroadcast();

        console2.log("PulseMultiSender deployed at", address(sender));
        console2.log("Set NEXT_PUBLIC_MULTISENDER_ADDRESS to that address.");
    }
}
