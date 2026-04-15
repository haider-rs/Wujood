// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMatchTickets {
    function ticketsSold() external view returns (uint256);
    function tickets(uint256 id) external view returns (
        uint256, address, string memory, bytes32, uint8, string memory, bool
    );
}

contract RewardsPool {
    address public admin;       // wallet owner — can drawWinners
    address public factory;     // TicketFactory — can addMatch
    address[] public registeredMatches;
    address[3] public winners;
    bool public drawn;

    event MatchRegistered(address indexed matchContract);
    event WinnersDrawn(address[3] winners);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    modifier onlyFactory() {
        require(msg.sender == factory, "Not factory");
        _;
    }

    /// @param _admin  The wallet owner (draws winners, reads data)
    /// @param _factory The TicketFactory contract (auto-registers matches)
    constructor(address _admin, address _factory) {
        require(_admin != address(0) && _factory != address(0), "Zero address");
        admin = _admin;
        factory = _factory;
    }

    /// @notice Called automatically by TicketFactory.createMatch()
    function addMatch(address matchAddr) external onlyFactory {
        registeredMatches.push(matchAddr);
        emit MatchRegistered(matchAddr);
    }

    /// @notice Get all unique buyer addresses across all registered matches
    function getAllBuyers() public view returns (address[] memory) {
        uint256 total = 0;
        for (uint256 m = 0; m < registeredMatches.length; m++) {
            total += IMatchTickets(registeredMatches[m]).ticketsSold();
        }

        address[] memory allBuyers = new address[](total);
        uint256 idx = 0;
        for (uint256 m = 0; m < registeredMatches.length; m++) {
            IMatchTickets mt = IMatchTickets(registeredMatches[m]);
            uint256 sold = mt.ticketsSold();
            for (uint256 t = 0; t < sold; t++) {
                (, address buyer,,,,,) = mt.tickets(t);
                allBuyers[idx++] = buyer;
            }
        }

        // Deduplicate
        address[] memory unique = new address[](total);
        uint256 uniqueCount = 0;
        for (uint256 i = 0; i < total; i++) {
            bool dup = false;
            for (uint256 j = 0; j < uniqueCount; j++) {
                if (unique[j] == allBuyers[i]) { dup = true; break; }
            }
            if (!dup) {
                unique[uniqueCount++] = allBuyers[i];
            }
        }

        address[] memory result = new address[](uniqueCount);
        for (uint256 i = 0; i < uniqueCount; i++) {
            result[i] = unique[i];
        }
        return result;
    }

    /// @notice Draw 3 random winners — called by admin from /admin portal
    function drawWinners(uint256 seed) external onlyAdmin {
        require(!drawn, "Already drawn");

        address[] memory buyers = getAllBuyers();
        require(buyers.length >= 3, "Need at least 3 unique buyers");

        address[3] memory selected;
        uint256 poolSize = buyers.length;

        for (uint256 i = 0; i < 3; i++) {
            uint256 rand = uint256(keccak256(abi.encodePacked(seed, blockhash(block.number - 1), i))) % poolSize;
            selected[i] = buyers[rand];
            buyers[rand] = buyers[poolSize - 1];
            poolSize--;
        }

        winners = selected;
        drawn = true;
        emit WinnersDrawn(selected);
    }

    function getWinners() external view returns (address[3] memory) {
        return winners;
    }

    function getRegisteredMatches() external view returns (address[] memory) {
        return registeredMatches;
    }
}
