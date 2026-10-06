// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockNFT
 * @notice Basic ERC-721 contract for testing NFT batch transfers.
 */
contract MockNFT is ERC721, Ownable {
    uint256 public nextTokenId = 1;

    constructor() ERC721("Test NFT", "TNFT") Ownable(msg.sender) {}

    /**
     * @notice Mints `count` sequential NFTs to the specified recipient.
     * @param to The recipient address.
     * @param count The number of NFTs to mint.
     */
    function mintBatch(address to, uint256 count) external onlyOwner {
        require(to != address(0), "Cannot mint to zero address");
        require(count > 0, "Count must be greater than zero");

        for (uint256 i = 0; i < count; i++) {
            uint256 tokenId = nextTokenId;
            nextTokenId++;
            _safeMint(to, tokenId);
        }
    }
}
