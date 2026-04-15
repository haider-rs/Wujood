#!/bin/bash

# forge script script/DeployAll.s.sol:DeployAll \
#   --rpc-url base_sepolia \
#   --account eth_wallet \
#   --sender 0x38850b8F890ea10B4767E6f29Ad12E00784BdC10 \
#   --verify \
#   --etherscan-api-key $eth_scan \
#   --broadcast \
#   -vvvv


forge script script/DeployAll.s.sol:DeployAll \
  --rpc-url wirefluid \
  --private-key 0x8835d55eba934280920c931b58978f17277214e92e4d8c4f86c569cb4c327090 \
  --broadcast \
  -vvvv
