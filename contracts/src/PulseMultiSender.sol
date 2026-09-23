// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PulseMultiSender
 * @notice Sends ETN (or an ERC-20) to many recipients in one transaction.
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
     * @notice Maximum recipients accepted by one call.
     *
     * A rail, not a gas optimisation: an unbounded loop either runs out of gas
     * mid-batch (reverting everything, after the signer has already paid for the
     * signature) or, worse, is sized by whatever the caller pasted in. 200 token
     * transfers is roughly 6-9M gas, which stays inside a conservative block gas
     * limit; the UI splits larger lists into sequential batches.
     */
    uint256 public constant MAX_BATCH_SIZE = 200;

    /// @notice Emitted once per native batch, in place of per-recipient logs.
    event NativeBatchSent(address indexed sender, uint256 recipientCount, uint256 totalAmount);

    /// @notice Emitted once per token batch, in place of per-recipient logs.
    event TokenBatchSent(
        address indexed sender,
        address indexed token,
        uint256 recipientCount,
        uint256 totalAmount
    );

    /**
     * @notice Sends `amounts[i]` of native ETN to `recipients[i]` for every i.
     * @dev `msg.value` must equal the sum of `amounts` exactly. Excess value is
     * rejected rather than refunded: silently keeping the difference would make
     * the contract custodial, and refunding it would cost the sender an extra
     * transfer for a mistake the UI already prevents.
     */
    function batchSendNative(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external payable nonReentrant {
        uint256 count = _validateBatch(recipients, amounts);

        uint256 total;
        for (uint256 i; i < count; ) {
            total += amounts[i];
            unchecked {
                ++i;
            }
        }

        require(msg.value == total, "msg.value != total");

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

        uint256 count = _validateBatch(recipients, amounts);

        uint256 total;
        for (uint256 i; i < count; ) {
            total += amounts[i];
            unchecked {
                ++i;
            }
        }

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
     * @dev Shared validation for both entry points. Returns the recipient count
     * so callers do not re-read `recipients.length` from calldata.
     *
     * Zero amounts are rejected as well as zero addresses. An empty amount is
     * almost always a parsing mistake in a pasted list, and a zero-value
     * transfer still costs the sender gas, so failing the whole batch is the
     * kinder outcome. Both checks are single `ISZERO`/`JUMPI` pairs.
     */
    function _validateBatch(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) private pure returns (uint256 count) {
        count = recipients.length;
        require(count == amounts.length, "length mismatch");
        require(count != 0, "empty batch");
        require(count <= MAX_BATCH_SIZE, "batch too large");

        for (uint256 i; i < count; ) {
            require(recipients[i] != address(0), "zero recipient");
            require(amounts[i] != 0, "zero amount");
            unchecked {
                ++i;
            }
        }
    }
}
