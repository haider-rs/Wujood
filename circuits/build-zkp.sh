#!/bin/bash
set -euo pipefail

# ── Config ─────────────────────────────────────────────────────────────────────
CIRCUIT_NAME="ticket_verify"
BUILD_DIR="./build"
CIRCUIT_DIR="./"
PTAU_SIZE=14  # 2^14 = 16384 constraints (plenty for Poseidon)

echo "═══════════════════════════════════════════"
echo "  Wujood ZKP Build Pipeline (Groth16)"
echo "═══════════════════════════════════════════"

# ── Prerequisites check ────────────────────────────────────────────────────────
command -v circom >/dev/null 2>&1 || { echo "❌ circom not found. Install: npm i -g circom"; exit 1; }
command -v snarkjs >/dev/null 2>&1 || { echo "❌ snarkjs not found. Install: npm i -g snarkjs"; exit 1; }

# Ensure circomlib is installed (for Poseidon)
if [ ! -d "node_modules/circomlib" ]; then
  echo "📦 Installing circomlib..."
  npm install circomlib
fi

mkdir -p "$BUILD_DIR"

# ── Step 1: Compile circuit ───────────────────────────────────────────────────
echo ""
echo "🔨 [1/5] Compiling circuit..."
circom "$CIRCUIT_DIR/$CIRCUIT_NAME.circom" \
  --r1cs --wasm --sym \
  -o "$BUILD_DIR"

echo "   ✓ R1CS:  $BUILD_DIR/$CIRCUIT_NAME.r1cs"
echo "   ✓ WASM:  $BUILD_DIR/${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm"

# ── Step 2: Powers of Tau ─────────────────────────────────────────────────────
echo ""
echo "🔑 [2/5] Powers of Tau ceremony..."

PTAU_FILE="$BUILD_DIR/pot${PTAU_SIZE}_final.ptau"

if [ -f "$PTAU_FILE" ]; then
  echo "   ✓ Reusing existing ptau file"
else
  snarkjs powersoftau new bn128 "$PTAU_SIZE" "$BUILD_DIR/pot${PTAU_SIZE}_0000.ptau" -v
  # Single contribution (hackathon — not production!)
  snarkjs powersoftau contribute "$BUILD_DIR/pot${PTAU_SIZE}_0000.ptau" "$BUILD_DIR/pot${PTAU_SIZE}_0001.ptau" \
    --name="WuJuD Hackathon" -v -e="$(head -c 32 /dev/urandom | xxd -p)"
  snarkjs powersoftau prepare phase2 "$BUILD_DIR/pot${PTAU_SIZE}_0001.ptau" "$PTAU_FILE" -v
  rm -f "$BUILD_DIR/pot${PTAU_SIZE}_0000.ptau" "$BUILD_DIR/pot${PTAU_SIZE}_0001.ptau"
  echo "   ✓ ptau ceremony complete"
fi

# ── Step 3: Groth16 setup ────────────────────────────────────────────────────
echo ""
echo "⚙️  [3/5] Groth16 circuit-specific setup..."
snarkjs groth16 setup "$BUILD_DIR/$CIRCUIT_NAME.r1cs" "$PTAU_FILE" "$BUILD_DIR/${CIRCUIT_NAME}_0000.zkey"

# Single contribution
snarkjs zkey contribute "$BUILD_DIR/${CIRCUIT_NAME}_0000.zkey" "$BUILD_DIR/${CIRCUIT_NAME}_final.zkey" \
  --name="WuJuD" -v -e="$(head -c 32 /dev/urandom | xxd -p)"

rm -f "$BUILD_DIR/${CIRCUIT_NAME}_0000.zkey"
echo "   ✓ Final zkey: $BUILD_DIR/${CIRCUIT_NAME}_final.zkey"

# Export verification key (JSON — used by snarkjs.groth16.verify in browser)
snarkjs zkey export verificationkey "$BUILD_DIR/${CIRCUIT_NAME}_final.zkey" "$BUILD_DIR/verification_key.json"
echo "   ✓ Verification key exported"

# ── Step 4: Export Solidity verifier ─────────────────────────────────────────
echo ""
echo "📜 [4/5] Exporting Groth16Verifier.sol..."
snarkjs zkey export solidityverifier "$BUILD_DIR/${CIRCUIT_NAME}_final.zkey" "$BUILD_DIR/Groth16Verifier.sol"
echo "   ✓ Solidity verifier: $BUILD_DIR/Groth16Verifier.sol"

# ── Step 5: Copy artifacts to frontend public dir ────────────────────────────
echo ""
echo "📂 [5/5] Copying artifacts to frontend..."
FRONTEND_CIRCUITS="./frontend/public/circuits"
mkdir -p "$FRONTEND_CIRCUITS"

cp "$BUILD_DIR/${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm" "$FRONTEND_CIRCUITS/"
cp "$BUILD_DIR/${CIRCUIT_NAME}_final.zkey"              "$FRONTEND_CIRCUITS/"
cp "$BUILD_DIR/verification_key.json"                   "$FRONTEND_CIRCUITS/"

echo "   ✓ WASM + zkey + vkey copied to $FRONTEND_CIRCUITS/"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
echo "  ✅ Build complete!"
echo ""
echo "  Artifacts:"
echo "    Circuit WASM:   $FRONTEND_CIRCUITS/${CIRCUIT_NAME}.wasm"
echo "    Proving key:    $FRONTEND_CIRCUITS/${CIRCUIT_NAME}_final.zkey"
echo "    Verifier sol:   $BUILD_DIR/Groth16Verifier.sol"
echo ""
echo "  Next steps:"
echo "    1. Copy Groth16Verifier.sol to contracts/src/"
echo "    2. Deploy Groth16Verifier + updated MatchTickets"
echo "    3. Test generateProof() in browser console"
echo "═══════════════════════════════════════════"
