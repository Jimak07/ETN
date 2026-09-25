import type { Abi } from "viem";

/**
 * ABI of `contracts/src/PulseMultiSender.sol`, copied verbatim from the solc
 * artifact (solc 0.8.24, paris, optimizer 1_000_000 runs).
 *
 * Kept as a literal rather than read from `contracts/out/` at build time: the
 * frontend deploys independently of the contract workspace, so a build that
 * depended on Foundry artifacts would break the moment the two are separated.
 * Re-export it if the contract changes - `npm run export:abi` in `contracts/`
 * prints this shape.
 */
export const pulseMultiSenderAbi = [
  {
    inputs: [],
    name: "ReentrancyGuardReentrantCall",
    type: "error",
  },
  {
    inputs: [{ internalType: "address", name: "token", type: "address" }],
    name: "SafeERC20FailedOperation",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "sender", type: "address" },
      { indexed: false, internalType: "uint256", name: "recipientCount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "totalAmount", type: "uint256" },
    ],
    name: "NativeBatchSent",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "sender", type: "address" },
      { indexed: true, internalType: "address", name: "token", type: "address" },
      { indexed: false, internalType: "uint256", name: "recipientCount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "totalAmount", type: "uint256" },
    ],
    name: "TokenBatchSent",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "sender", type: "address" },
      { indexed: true, internalType: "address", name: "token", type: "address" },
      { indexed: false, internalType: "uint256", name: "recipientCount", type: "uint256" },
    ],
    name: "ERC721BatchSent",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "sender", type: "address" },
      { indexed: true, internalType: "address", name: "token", type: "address" },
      { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "recipientCount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "totalAmount", type: "uint256" },
    ],
    name: "ERC1155BatchSent",
    type: "event",
  },
  {
    inputs: [],
    name: "MAX_BATCH_SIZE",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "MAX_NFT_BATCH_SIZE",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "address[]", name: "recipients", type: "address[]" },
      { internalType: "uint256[]", name: "amounts", type: "uint256[]" },
    ],
    name: "batchSendERC20",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "tokenContract", type: "address" },
      { internalType: "address[]", name: "recipients", type: "address[]" },
      { internalType: "uint256[]", name: "tokenIds", type: "uint256[]" },
    ],
    name: "batchSendERC721",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "tokenContract", type: "address" },
      { internalType: "uint256", name: "tokenId", type: "uint256" },
      { internalType: "address[]", name: "recipients", type: "address[]" },
      { internalType: "uint256[]", name: "amounts", type: "uint256[]" },
    ],
    name: "batchSendERC1155",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address[]", name: "recipients", type: "address[]" },
      { internalType: "uint256[]", name: "amounts", type: "uint256[]" },
    ],
    name: "batchSendNative",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const satisfies Abi;
