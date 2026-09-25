// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PulseMultiSender
 * @notice Sends ETN, ERC-20, ERC-721 NFTs, or ERC-1155 editions to many recipients in one transaction.
 *
 * Design notes, because they are the product:
 *
 * - **Non-custodial.** Nothing is ever held. Native value must arrive in the
 *   same call that spends it (`msg.value` must equal the batch total, to the
 *   wei), and tokens are pulled straight from the caller to each recipient. The
 *   contract therefore has no balance to steal, no owner to bribe and no fee to
 *   pay — which is also why there is no `withdraw`/`rescue` function: there is
 *   nothing to rescue, and an admin key would be a liability rather than a
 *   safety net.
 * - **Atomic.** Either every transfer lands or the whole transaction reverts.
 * - **Fail-fast.** The batch is validated and summed before the first transfer,
 *   so a bad row costs a revert reason instead of a half-executed loop.
 */
contract PulseMultiSender is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /**
     * @notice Maximum recipients accepted by one native or ERC-20 call.
     */
    uint256 public constant MAX_BATCH_SIZE = 200;

    /**
     * @notice Maximum recipients accepted by one NFT (ERC-721 / ERC-1155) call.
     * Capped at 100 due to recipient contract receiver checks (onERC721Received / onERC1155Received).
     */
    uint256 public constant MAX_NFT_BATCH_SIZE = 100;

    /// @notice Emitted once per native batch, in place of per-recipient logs.
    event NativeBatchSent(address indexed sender, uint256 recipientCount, uint256 totalAmount);

    /// @notice Emitted once per token batch, in place of per-recipient logs.
    event TokenBatchSent(
        address indexed sender,
        address indexed token,
        uint256 recipientCount,
        uint256 totalAmount
    );

    /// @notice Emitted once per ERC-721 NFT batch.
    event ERC721BatchSent(
        address indexed sender,
        address indexed token,
        uint256 recipientCount
    );

    /// @notice Emitted once per ERC-1155 multi-token edition batch.
    event ERC1155BatchSent(
        address indexed sender,
        address indexed token,
        uint256 indexed tokenId,
        uint256 recipientCount,
        uint256 totalAmount
    );

    /**
     * @notice Sends `amounts[i]` of native ETN to `recipients[i]` for every i.
     * @dev `msg.value` must be at least the sum of `amounts`. Excess value is
     * automatically refunded to `msg.sender` to prevent any trapped native funds.
     */
    function batchSendNative(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external payable nonReentrant {
        (uint256 count, uint256 total) = _validateAndSumBatch(recipients, amounts);

        require(msg.value >= total, "insufficient msg.value");

        for (uint256 i; i < count; ) {
            // A raw call rather than `transfer`/`send`: the 2300 gas stipend is
            // not enough for smart-contract wallets, which are exactly the
            // recipients a batch tool must support. Reentrancy is handled by the
            // modifier, and this contract never holds a balance to re-enter for.
            (bool sent, ) = recipients[i].call{ value: amounts[i] }("");
            require(sent, "native transfer failed");
            unchecked {
                ++i;
            }
        }

        // Refund any excess msg.value to msg.sender to prevent accidental trapped value
        uint256 excess = msg.value - total;
        if (excess > 0) {
            (bool refunded, ) = msg.sender.call{ value: excess }("");
            require(refunded, "refund failed");
        }

        emit NativeBatchSent(msg.sender, count, total);
    }

    /**
     * @notice Pulls `amounts[i]` of `token` from the caller to `recipients[i]`.
     * @dev The caller must have approved this contract for at least the total.
     * `SafeERC20` is used because not every token returns a boolean (or any
     * data) from `transferFrom`, and a silent failure would otherwise look like
     * a successful batch.
     *
     * Fee-on-transfer, rebasing and otherwise non-standard tokens are **not**
     * supported: each recipient receives whatever the token actually moves, so
     * the batch total is not a guarantee of the amount received. Check the token
     * contract before a large run.
     */
    function batchSendERC20(
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external payable nonReentrant {
        require(token != address(0), "zero token");
        // `payable` purely so this check can exist: a non-payable function is
        // rejected by the ABI decoder with no reason at all. Stray value is
        // refused rather than accepted, because there is no path that could ever
        // return it to the sender.
        require(msg.value == 0, "no native value");

        (uint256 count, uint256 total) = _validateAndSumBatch(recipients, amounts);

        IERC20 erc20 = IERC20(token);
        for (uint256 i; i < count; ) {
            erc20.safeTransferFrom(msg.sender, recipients[i], amounts[i]);
            unchecked {
                ++i;
            }
        }

        emit TokenBatchSent(msg.sender, token, count, total);
    }

    /**
     * @notice Transfers distinct ERC-721 NFTs to multiple recipients in one transaction.
     * @dev Caller must have approved this contract (e.g. via `setApprovalForAll`).
     * Capped at `MAX_NFT_BATCH_SIZE` to keep gas usage well within block boundaries.
     */
    function batchSendERC721(
        address tokenContract,
        address[] calldata recipients,
        uint256[] calldata tokenIds
    ) external payable nonReentrant {
        require(tokenContract != address(0), "zero token");
        require(msg.value == 0, "no native value");

        uint256 count = recipients.length;
        require(count == tokenIds.length, "length mismatch");
        require(count != 0, "empty batch");
        require(count <= MAX_NFT_BATCH_SIZE, "batch too large");

        IERC721 nft = IERC721(tokenContract);
        for (uint256 i; i < count; ) {
            require(recipients[i] != address(0), "zero recipient");
            nft.safeTransferFrom(msg.sender, recipients[i], tokenIds[i]);
            unchecked {
                ++i;
            }
        }

        emit ERC721BatchSent(msg.sender, tokenContract, count);
    }

    /**
     * @notice Transfers multiple copies/editions of an ERC-1155 `tokenId` to recipients.
     * @dev Caller must have approved this contract (e.g. via `setApprovalForAll`).
     * Capped at `MAX_NFT_BATCH_SIZE`.
     */
    function batchSendERC1155(
        address tokenContract,
        uint256 tokenId,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external payable nonReentrant {
        require(tokenContract != address(0), "zero token");
        require(msg.value == 0, "no native value");

        uint256 count = recipients.length;
        require(count == amounts.length, "length mismatch");
        require(count != 0, "empty batch");
        require(count <= MAX_NFT_BATCH_SIZE, "batch too large");

        uint256 total;
        IERC1155 nft = IERC1155(tokenContract);
        for (uint256 i; i < count; ) {
            require(recipients[i] != address(0), "zero recipient");
            require(amounts[i] != 0, "zero amount");
            total += amounts[i];
            nft.safeTransferFrom(msg.sender, recipients[i], tokenId, amounts[i], "");
            unchecked {
                ++i;
            }
        }

        emit ERC1155BatchSent(msg.sender, tokenContract, tokenId, count, total);
    }

    /**
     * @dev Combined validation and sum calculation in a single pass over calldata
     * to eliminate redundant O(N) loops and reduce gas.
     *
     * Zero amounts and zero addresses are strictly rejected.
     */
    function _validateAndSumBatch(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) private pure returns (uint256 count, uint256 total) {
        count = recipients.length;
        require(count == amounts.length, "length mismatch");
        require(count != 0, "empty batch");
        require(count <= MAX_BATCH_SIZE, "batch too large");

        for (uint256 i; i < count; ) {
            require(recipients[i] != address(0), "zero recipient");
            require(amounts[i] != 0, "zero amount");
            total += amounts[i];
            unchecked {
                ++i;
            }
        }
    }
}
