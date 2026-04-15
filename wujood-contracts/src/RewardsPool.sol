// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMatchTickets {
    function ticketsSold() external view returns (uint256);
    function tickets(uint256 id) external view returns (
        uint256 id_,
        address buyer,
        string memory holderName,
        bytes32 cnicHash,
        uint8 category,
        string memory seat,
        bool used
    );
}

/**
 * @title RewardsPool
 * @notice Seasonal rewards draw.
 *         Pool = one entry per ticket (weighted). Same person can win multiple slots.
 *         admin   = deployer wallet
 *         factory = TicketFactory (only it can call addMatch)
 *
 * FIX [weak randomness]: commit-reveal scheme.
 *   1. Admin calls commitDraw(keccak256(abi.encode(secret))) at least COMMIT_DELAY
 *      blocks before the draw. The secret is not yet known to validators.
 *   2. Admin calls drawWinners(secret) — the on-chain hash check verifies the
 *      pre-image. block.prevrandao is mixed in at reveal time, which validators
 *      cannot meaningfully bias across the COMMIT_DELAY window.
 *   drawWinners(uint256) signature is UNCHANGED — seed parameter is now the
 *   secret pre-image that must match the committed hash.
 *
 * FIX [gas bomb]: snapshot pattern.
 *   drawWinners must not call getPool() live (O(n) cross-contract reads → gas limit).
 *   Admin calls takeSnapshot() before drawWinners; this materialises the pool into
 *   contract storage. drawWinners then works from poolSnapshot — a single storage
 *   read per pick, no external calls at draw time.
 *   drawWinners(uint256) signature is UNCHANGED.
 */
contract RewardsPool {
    address public admin;
    address public factory;

    address[] public registeredMatches;
    address[3] public winners;
    bool public drawn;

    // FIX [weak randomness]: commit-reveal state.
    // NEW storage — no existing slot changed.
    bytes32 public pendingCommit;
    uint256 public commitBlock;
    uint256 public constant COMMIT_DELAY = 5; // reveal only after this many blocks

    // FIX [gas bomb]: snapshot stored in contract storage.
    // NEW storage — no existing slot changed.
    address[] private poolSnapshot;
    bool public snapshotTaken;

    event WinnersDrawn(address[3] winners);
    event MatchRegistered(address indexed matchContract);
    // FIX [weak randomness]: new events — no existing event changed.
    event DrawCommitted(bytes32 indexed commitHash, uint256 atBlock);
    event SnapshotTaken(uint256 poolSize);

    modifier onlyAdmin()   { require(msg.sender == admin,   "Not admin");   _; }
    modifier onlyFactory() { require(msg.sender == factory, "Not factory"); _; }

    constructor(address _admin, address _factory) {
        admin   = _admin;
        factory = _factory;
    }

    // ── Match registration ─────────────────────────────────────────────────
    // Signatures unchanged.

    function addMatch(address matchAddr) external onlyFactory {
        registeredMatches.push(matchAddr);
        emit MatchRegistered(matchAddr);
    }

    function getRegisteredMatches() external view returns (address[] memory) {
        return registeredMatches;
    }

    // ── Pool: one entry per ticket sold (weighted by ticket count) ──────────
    // Signature unchanged.
    // NOTE: getPool() remains a view — safe to call from frontend.
    // It is NOT called inside drawWinners anymore (gas fix).

    function getPool() public view returns (address[] memory) {
        uint256 totalSold;
        for (uint256 i = 0; i < registeredMatches.length; i++) {
            totalSold += IMatchTickets(registeredMatches[i]).ticketsSold();
        }
        if (totalSold == 0) return new address[](0);

        address[] memory pool = new address[](totalSold);
        uint256 idx;
        for (uint256 i = 0; i < registeredMatches.length; i++) {
            IMatchTickets m = IMatchTickets(registeredMatches[i]);
            uint256 sold = m.ticketsSold();
            for (uint256 j = 0; j < sold; j++) {
                (, address buyer,,,,,) = m.tickets(j);
                pool[idx++] = buyer;
            }
        }
        return pool;
    }

    // ── Unique buyers list (for frontend display only) ──────────────────────
    // Signature unchanged. Still O(n²) — intentionally left as view-only,
    // never called from a state-writing function.

    function getAllBuyers() public view returns (address[] memory) {
        address[] memory pool = getPool();
        if (pool.length == 0) return new address[](0);

        address[] memory temp = new address[](pool.length);
        uint256 unique;
        for (uint256 i = 0; i < pool.length; i++) {
            bool found = false;
            for (uint256 k = 0; k < unique; k++) {
                if (temp[k] == pool[i]) { found = true; break; }
            }
            if (!found) temp[unique++] = pool[i];
        }
        address[] memory result = new address[](unique);
        for (uint256 i = 0; i < unique; i++) result[i] = temp[i];
        return result;
    }

    // ── FIX [weak randomness]: Step 1 — commit ────────────────────────────
    // NEW function. Admin calls this first:
    //   commitDraw(keccak256(abi.encode(secret)))
    // The actual secret stays off-chain until drawWinners is called.

    function commitDraw(bytes32 _hash) external onlyAdmin {
        require(!drawn, "Already drawn");
        require(_hash != bytes32(0), "Empty commit");
        pendingCommit = _hash;
        commitBlock   = block.number;
        snapshotTaken = false; // reset snapshot on new commit cycle
        emit DrawCommitted(_hash, block.number);
    }

    // ── FIX [gas bomb]: Step 2 — snapshot ────────────────────────────────
    // NEW function. Admin calls this after commitDraw and before drawWinners.
    // Materialises the pool into poolSnapshot[] so drawWinners pays no
    // external calls at reveal time.

    function takeSnapshot() external onlyAdmin {
        require(!drawn, "Already drawn");
        require(pendingCommit != bytes32(0), "Commit first");

        address[] memory pool = getPool();
        require(pool.length >= 3, "Need at least 3 tickets sold");

        // Overwrite any previous snapshot.
        delete poolSnapshot;
        for (uint256 i = 0; i < pool.length; i++) {
            poolSnapshot.push(pool[i]);
        }
        snapshotTaken = true;
        emit SnapshotTaken(pool.length);
    }

    // ── FIX [weak randomness + gas bomb]: Step 3 — reveal / draw ──────────
    // drawWinners(uint256 seed) signature UNCHANGED.
    //   seed  = the secret pre-image of pendingCommit
    //   FIX 1: keccak256(abi.encode(seed)) must match pendingCommit (commit-reveal).
    //          block.number > commitBlock + COMMIT_DELAY ensures the seed was
    //          fixed before current block data was known to the admin.
    //   FIX 2: uses poolSnapshot — zero external calls, bounded gas.

    function drawWinners(uint256 seed) external onlyAdmin {
        require(!drawn, "Already drawn");
        require(pendingCommit != bytes32(0), "No commit found - call commitDraw first");
        require(block.number > commitBlock + COMMIT_DELAY, "Commit delay not elapsed");
        require(keccak256(abi.encode(seed)) == pendingCommit, "Seed does not match commit");
        require(snapshotTaken, "Snapshot not taken - call takeSnapshot first");
        require(poolSnapshot.length >= 3, "Pool snapshot too small");

        // Mix committed seed with prevrandao (post-Merge RANDAO — not admin-controlled)
        // and block data. Admin cannot predict prevrandao before block proposal.
        uint256 rand = uint256(keccak256(abi.encodePacked(
            seed, block.prevrandao, block.timestamp, block.number
        )));

        uint256 snapLen = poolSnapshot.length;
        for (uint256 i = 0; i < 3; i++) {
            uint256 idx = uint256(keccak256(abi.encodePacked(rand, i))) % snapLen;
            winners[i] = poolSnapshot[idx];
        }

        drawn = true;
        emit WinnersDrawn(winners);
    }

    function getWinners() external view returns (address[3] memory) {
        return winners;
    }

    // ── Helper: current snapshot size (frontend/testing) ──────────────────
    // NEW view — no existing signature changed.

    function getSnapshotSize() external view returns (uint256) {
        return poolSnapshot.length;
    }
}
