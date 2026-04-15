#!/bin/bash

forge script script/DeployAll.s.sol:DeployAll \
  --rpc-url wirefluid \
  --private-key $eth_wallet \
  --broadcast \
  -vvvv
