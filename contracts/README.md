# PulseMultiSender

Solidity batch sender for the ETN Pulse Multi-Sender module: one transaction
that pays many recipients at once, either in native ETN or in any ERC-20.

```
contracts/
  foundry.toml                       solc 0.8.24, paris, optimizer 1_000_000 runs
  remappings.txt                     @openzeppelin/contracts -> lib/, forge-std -> lib/
  src/PulseMultiSender.sol           the contract
  script/DeployPulseMultiSender.s.sol deployment script
  test/PulseMultiSender.t.sol        forge test suite
```

## Setup

Foundry is not installed by this repository. Install it once, then pull the two
dependencies into `lib/`:

```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup   # or: winget install foundry

cd contracts
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2
forge install foundry-rs/forge-std
```

Both land in `lib/` as git submodules, which is what `remappings.txt` points at.
Without them `forge build` fails on the `@openzeppelin/contracts/...` imports.

## Build and test

```bash
forge build
forge test -vvv
forge test --gas-report            # per-function gas, useful before a fee change
forge fmt --check
```

## Deploy

The script reads the signer from the environment and never hard-codes it. Use a
throwaway key: the contract has no constructor arguments, no owner and no
privileged functions, so the deployer keeps no power afterwards.

```bash
export PRIVATE_KEY=0x...                                  # deployer, holds only gas
forge script script/DeployPulseMultiSender.s.sol \
  --rpc-url electroneum --broadcast --slow
```

Both networks are defined under `[rpc_endpoints]` in `foundry.toml`, so no URL has
to be remembered:

```bash
forge script script/DeployPulseMultiSender.s.sol --rpc-url electroneum --broadcast --slow
forge script script/DeployPulseMultiSender.s.sol --rpc-url electroneum-testnet --broadcast --slow
```

The contract has no constructor arguments and no owner, so the same source deploys
unchanged to both; only the resulting address differs, and each address is valid only
on the chain it was deployed to.

Publish the source in the same run:

```bash
forge script script/DeployPulseMultiSender.s.sol \
  --rpc-url electroneum --broadcast --slow \
  --verify --verifier blockscout \
  --verifier-url https://blockexplorer.electroneum.com/api
```

If that explorer is Etherscan-derived rather than Blockscout, swap the verifier
for `--verifier etherscan` and set `ETN_EXPLORER_API_KEY` (the `[etherscan]`
entry in `foundry.toml` reads it).

Finally, point the dashboard at the deployment:

```bash
# frontend/.env.local
NEXT_PUBLIC_MULTISENDER_MAINNET=0x...   # used when chainId === 52014
NEXT_PUBLIC_MULTISENDER_TESTNET=0x...   # used when chainId === 5201420
```

Until the matching variable is set, `/multi-sender` on that network still parses and
validates lists but refuses to send, and the UI says why. `NEXT_PUBLIC_MULTISENDER_ADDRESS`
is still read as the mainnet value for deployments predating testnet support.

## Contract notes

**Non-custodial.** Native value must arrive in the same call that spends it
(`msg.value` must equal the batch total, to the wei) and tokens are pulled
straight from the caller to each recipient. The contract holds nothing between
transactions, which is also why there is no `withdraw`/`rescue` function: there
is no balance to rescue, and an admin key would be a liability rather than a
safety net. ERC-20s sent to the contract outside a batch cannot be recovered -
send only through the UI.

**Atomic.** Either every transfer lands or the whole transaction reverts. A
mistyped row cannot half-pay a list.

**Fail-fast.** The batch is validated and summed before the first transfer, so a
bad row costs a revert reason rather than a partially executed loop.

**Gas.** `SafeERC20` + `ReentrancyGuard` from OpenZeppelin, `unchecked` loop
increments, one event per batch rather than one per recipient, and no per-item
storage. Expect roughly 21k gas per native transfer and 30-50k per ERC-20
transfer (token-dependent), so cost is dominated by the recipient count rather
than by this contract.

**`MAX_BATCH_SIZE = 200`.** A rail rather than an optimisation: an unbounded
loop either runs out of gas mid-batch or is sized by whatever was pasted into
the UI. The dashboard reads the constant from chain and splits longer lists into
sequential transactions, so the limit is invisible in normal use. Raise the
constant in `src/` and redeploy if the block gas limit allows more.

**No fees, and `msg.value` is exact.** Excess native value is rejected instead
of refunded: silently keeping it would make the contract custodial, and
returning it would charge the sender an extra transfer for a mistake the UI
already prevents.

**Known limits.** Fee-on-transfer, rebasing and other non-standard ERC-20s are
unsupported - each recipient receives whatever the token actually moves, so the
batch total is not a guarantee of the amount received. Native transfers use a
full-gas `call` rather than `transfer`, so smart-contract wallets work, but a
recipient contract that reverts on receive fails the whole batch (by design:
partial success was judged the worse outcome).

## Verification status

`src/` and `test/` were compiled with solc 0.8.24 (`evm_version = paris`,
optimizer 1,000,000 runs) against the pinned dependencies in `lib/`
(OpenZeppelin 5.0.2, forge-std 1.16.2), resolving through `remappings.txt`:
**0 errors, 0 warnings**. `PulseMultiSender` produces 3,276 bytes of runtime
bytecode against the 24,576-byte EIP-170 limit, and the suite exposes 10 test
functions.

What that does and does not prove. It proves the sources and the tests are valid
Solidity against the versions this repo pins - a typo in an OpenZeppelin import,
a wrong forge-std signature or a broken mock would all fail here. It does **not**
execute the tests, so the assertions themselves are unverified. `forge` is not
installable in the environment these were written in, so run `forge test -vv`
once before deploying:

| Requirement | Status |
| --- | --- |
| `src/PulseMultiSender.sol` + `test/` compile (solc 0.8.24) | verified |
| Runtime bytecode under the EIP-170 limit | verified (3,276 / 24,576) |
| Script and test sources resolve against pinned deps | verified |
| Tests pass under `forge test` | **not run** |
| Deployment to ETN mainnet / testnet | **not run** |
