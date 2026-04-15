# PSL Tickets — WireFluid Hackathon Frontend

Privacy-preserving event ticketing dApp built on WireFluid Testnet (Cosmos SDK / EVM).

## Stack

| Layer | Tool |
|-------|------|
| Framework | Next.js 14 (App Router, TypeScript) |
| Styling | Tailwind CSS |
| Wallet | wagmi v2 + viem + RainbowKit |
| QR Generate | qrcode.react |
| QR Scan | html5-qrcode |
| ZKP | circom + snarkjs (Groth16) |

## Project Structure

```
src/
├── app/
│   ├── page.tsx                  # / — Match listing
│   ├── match/[address]/page.tsx  # Buy tickets
│   ├── my-tickets/page.tsx       # Dashboard + QR codes
│   └── verify/page.tsx           # Venue scanner
├── components/
│   ├── Navbar.tsx
│   ├── MatchCard.tsx
│   ├── TicketCard.tsx
│   ├── QRScanner.tsx
│   └── providers.tsx
├── config/
│   ├── chains.ts      # WireFluid chain definition
│   ├── wagmi.ts       # wagmi config + FACTORY_ADDRESS
│   └── abis.ts        # Contract ABIs
└── lib/
    └── zkp.ts         # Poseidon commitment + Groth16 proof helpers
```

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.local.example .env.local
# Edit .env.local with your deployed factory address + WalletConnect ID

# 3. Run development server
npm run dev
```

## Environment Variables

```env
NEXT_PUBLIC_FACTORY_ADDRESS=0x...
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
NEXT_PUBLIC_CHAIN_ID=12345
NEXT_PUBLIC_RPC_URL=https://rpc.wirefluid.com
NEXT_PUBLIC_CHAIN_NAME=WireFluid Testnet
NEXT_PUBLIC_BLOCK_EXPLORER=https://wirefluidscan.com
```

## Day 3 — ZKP Build Pipeline

```bash
chmod +x build-zkp.sh
./build-zkp.sh
```

This compiles `circuits/ticket_verify.circom` and outputs:
- `circuits/build/ticket_verify.wasm`
- `circuits/build/ticket_verify_final.zkey`
- `contracts/src/Groth16Verifier.sol`
- Artifacts copied to `public/circuits/`

## Pages

| Route | Description |
|-------|-------------|
| `/` | Browse active matches from TicketFactory |
| `/match/[address]` | Buy tickets for a specific match |
| `/my-tickets` | View purchased tickets, generate QR codes |
| `/verify` | Venue staff scanner — verify + mark tickets used |

## Privacy Properties

- Raw CNIC **never** leaves the browser or touches the chain
- Only `keccak256(CNIC)` is stored on-chain
- Day 3 ZKP: QR code encodes a Groth16 proof, not the ticket ID
- Nullifier prevents double-entry without revealing identity
- All signing via MetaMask — private keys never exposed
