#!/usr/bin/env bash
set -e
export PATH="$HOME/.foundry/bin:$PATH"
cd "$(dirname "$0")"
source .env
forge script script/DeployMockNFT.s.sol --rpc-url $MAINNET_RPC_URL --broadcast --with-gas-price 2000000000 --priority-gas-price 2000000000
