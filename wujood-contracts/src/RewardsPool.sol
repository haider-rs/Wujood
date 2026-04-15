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
 */
contract RewardsPool {
    address public admin;
    address public factory;

    address[] public registeredMatches;
    address[3] public winners;
    bool public drawn;

    event WinnersDrawn(address[3] winners);
    event MatchRegistered(address indexed matchContract);

    modifier onlyAdmin()   { require(msg.sender == admin,   "Not admin");   _; }
    modifier onlyFactory() { require(msg.sender == factory, "Not factory"); _; }

    constructor(address _admin, address _factory) {
        admin   = _admin;
        factory = _factory;
    }

    // ── Match registration ─────────────────────────────────────────────────

    function addMatch(address matchAddr) external onlyFactory {
        registeredMatches.push(matchAddr);
        emit MatchRegistered(matchAddr);
    }

    function getRegisteredMatches() external view returns (address[] memory) {
        return registeredMatches;
    }

    // ── Pool: one entry per ticket sold (weighted by ticket count) ──────────

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

    // ── Draw: 3 picks from ticket pool, same person can win multiple slots ──

    function drawWinners(uint256 seed) external onlyAdmin {
        require(!drawn, "Already drawn");

        address[] memory pool = getPool();
        require(pool.length >= 3, "Need at least 3 tickets sold");

        uint256 rand = uint256(keccak256(abi.encodePacked(
            seed, block.prevrandao, block.timestamp, block.number
        )));

        for (uint256 i = 0; i < 3; i++) {
            uint256 idx = uint256(keccak256(abi.encodePacked(rand, i))) % pool.length;
            winners[i] = pool[idx];
        }

        drawn = true;
        emit WinnersDrawn(winners);
    }

    function getWinners() external view returns (address[3] memory) {
        return winners;
    }
}
