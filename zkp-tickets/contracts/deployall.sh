#!/bin/bash

forge script script/DeployAll.s.sol:DeployAll \
  --rpc-url base_sepolia \
  --account eth_wallet \
  --sender 0x38850b8F890ea10B4767E6f29Ad12E00784BdC10 \
  --verify \
  --etherscan-api-key $eth_scan \
  --broadcast \
  -vvvv
