# وجود (Wujood) — ZK Ticketing System

> **Zero-knowledge proof-based ticketing infrastructure** — generate, verify, and trade tickets with on-chain privacy guarantees using Groth16 proofs.

---

## Repository Structure

```
wujood/
├── wujood-circuit/       # ZKP circuit — proof generation & verification
├── wujood-contracts/     # Smart contracts — ticket factory & ZK verifier
└── wujood-fe/            # Next.js frontend — wallet integration & ticket UX
```

### `wujood-circuit`
Circom-based ZKP circuits implementing the commitment-nullifier scheme for tickets. Uses **Groth16** for proof generation and on-chain verification. Handles CNIC hashing, nullifier derivation, and witness computation.

### `wujood-contracts / zkp-tickets`
Solidity contracts for:
- `TicketFactory` — match ticket creation and RBAC-controlled issuance
- `MatchTickets` — per-match ERC ticket logic
- ZK Verifier contract — on-chain Groth16 proof verification

### `wujood-fe`
Next.js frontend with wagmi + RainbowKit wallet integration. Connects to the deployed contracts, triggers proof generation client-side, and handles ticket QR code verification flows.

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- Go (for any tooling scripts)
- [Foundry](https://book.getfoundry.sh/) (`forge`, `cast`)
- `snarkjs` + `circom` (for circuit work)

---

## Contracts

### Deployment

Set your private key as an environment variable, then run the deploy script from the repo root:

```bash
export PRIVATE_KEY=0xyour_key_here
./deployall.sh
```

### Updating ABIs

After modifying a contract, rebuild and copy the new ABI into the frontend config:

```bash
# 1. Build contracts
cd wujood-contracts
forge build

# 2. Copy ABI to frontend
cp out/YourContract.sol/YourContract.json ../../wujood-fe/src/config/
```

---

## Frontend

### Environment Variables

Create a `.env.local` file in `wujood-fe/` with the following:

```env
# Upstash Redis (rate limiting / session state)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Chain config
NEXT_PUBLIC_CHAIN_ID=
NEXT_PUBLIC_RPC_URL=
NEXT_PUBLIC_CHAIN_NAME=
NEXT_PUBLIC_BLOCK_EXPLORER=

# WalletConnect
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# Contract addresses
NEXT_PUBLIC_FACTORY_ADDRESS=
NEXT_PUBLIC_REWARDS_POOL=
NEXT_PUBLIC_ZK_VERIFIER=
```

### Running the Dev Server

```bash
cd wujood-fe
npm install
npm run dev
```

---

## ZKP Circuit

The circuit implements a **commitment-nullifier scheme**:

- **Commitment** — `H(secret, CNIC_hash)` stored on-chain at ticket issuance
- **Nullifier** — `H(secret)` revealed at redemption to prevent double-spending
- **Proof** — Groth16 proof that the holder knows the secret behind the commitment, without revealing it

---

## Tech Stack

| Layer | Stack |
|---|---|
| ZK Circuits | Circom · snarkjs · Groth16 |
| Contracts | Solidity · Foundry |
| Frontend | Next.js · wagmi · RainbowKit · ethers.js |
| State / Rate Limiting | Upstash Redis |
| Wallet Support | WalletConnect v2 |

---
