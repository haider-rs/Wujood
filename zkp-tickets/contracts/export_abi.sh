#!/bin/bash

set -e

FRONTEND_DIR="../../zkp-tickets-fe/src/config/"
mkdir -p "$FRONTEND_DIR"

echo "Exporting ABIs..."

# Extract just the ABI array from each artifact
jq '.abi' out/TicketFactory.sol/TicketFactory.json > "$FRONTEND_DIR/TicketFactoryABI.json"
jq '.abi' out/MatchTickets.sol/MatchTickets.json > "$FRONTEND_DIR/MatchTicketsABI.json"

echo "ABIs exported to $FRONTEND_DIR/"
echo "  - TicketFactoryABI.json"
echo "  - MatchTicketsABI.json"



