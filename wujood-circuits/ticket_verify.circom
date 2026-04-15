pragma circom 2.1.6;

include "node_modules/circomlib/circuits/poseidon.circom";

// Proves: "I know (secret, nullifier) such that
//   commitment == Poseidon(secret, nullifier)"
// Reveals: commitment (public), nullifierHash (public)
// Hides:   secret, nullifier, ticketId, seat, identity

template TicketVerify() {
    signal input secret;
    signal input nullifier;

    signal output commitment;
    signal output nullifierHash;

    component commitHasher = Poseidon(2);
    commitHasher.inputs[0] <== secret;
    commitHasher.inputs[1] <== nullifier;
    commitment <== commitHasher.out;

    component nullHasher = Poseidon(2);
    nullHasher.inputs[0] <== nullifier;
    nullHasher.inputs[1] <== nullifier;
    nullifierHash <== nullHasher.out;
}

component main = TicketVerify();
