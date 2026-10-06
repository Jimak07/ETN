// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { MockNFT } from "../src/MockNFT.sol";

/**
 * @title DeployMockNFT
 * @notice Deploys MockNFT and mints Token IDs 1 to 5 to the deployer.
 */
contract DeployMockNFT is Script {
    function run() external returns (MockNFT nft) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployerAddress = vm.addr(deployerPrivateKey);

        console2.log("Deployer address:", deployerAddress);

        vm.startBroadcast(deployerPrivateKey);

        nft = new MockNFT();
        console2.log("MockNFT deployed at:", address(nft));

        nft.mintBatch(deployerAddress, 5);
        console2.log("Minted 5 NFTs (IDs 1-5) to deployer:", deployerAddress);

        vm.stopBroadcast();
    }
}
