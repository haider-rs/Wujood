# /public/circuits/

Place your compiled circom artifacts here:

- `ticket_verify.wasm`   — compiled circuit for browser-side proving
- `ticket_verify_final.zkey` — Groth16 proving key (~50 MB)

These are generated during the Day 3 ZKP build pipeline:
```
circom circuits/ticket_verify.circom --r1cs --wasm --sym -o circuits/build
snarkjs groth16 setup circuits/build/ticket_verify.r1cs pot14_final.ptau ticket_verify_0000.zkey
snarkjs zkey beacon ticket_verify_0000.zkey ticket_verify_final.zkey ...
```

Copy the resulting files here so the frontend can load them at:
  GET /circuits/ticket_verify.wasm
  GET /circuits/ticket_verify_final.zkey
