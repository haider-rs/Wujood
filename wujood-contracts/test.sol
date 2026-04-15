// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// src/MatchTickets.sol

interface ITicketFactory {
    function isMod(address addr) external view returns (bool);
}

interface IGroth16Verifier {
    function verifyProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[2] calldata _pubSignals
    ) external view returns (bool);
}

contract MatchTickets {
    enum TicketCategory { General, Enclosure, VIP }

    struct Ticket {
        uint256 id;
        address buyer;
        string holderName;
        bytes32 cnicHash;
        TicketCategory category;
        string seat;
        bool used;
    }

    address public owner;
    address public factory;
    address public zkVerifier;
    string public matchName;
    string public venue;
    string public dateString;
    uint256 public totalTickets;
    uint256 public ticketsSold;

    mapping(uint256 => Ticket) public tickets;
    mapping(address => uint256[]) private purchaserTickets;
    mapping(bytes32 => bool) public seatTaken;
    mapping(TicketCategory => uint256) public categoryPrices;

    mapping(bytes32 => bool) public commitments;
    mapping(bytes32 => bool) public usedNullifiers;
    uint256 public zkTicketCount;

    event TicketPurchased(uint256 indexed ticketId, address indexed buyer, string holderName, TicketCategory category, string seat);
    event TicketUsed(uint256 indexed ticketId);
    event ZKTicketPurchased(bytes32 indexed commitment, string seat);
    event ZKEntryVerified(bytes32 indexed nullifierHash);
    event FundsWithdrawn(address indexed to, uint256 amount);
    event CategoryPriceUpdated(TicketCategory category, uint256 price);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyOwnerOrMod() {
        require(ITicketFactory(factory).isMod(msg.sender), "Not owner or mod");
        _;
    }

    constructor(
        address _owner,
        address _factory,
        address _zkVerifier,
        string memory _matchName,
        string memory _venue,
        string memory _dateString,
        uint256 _totalTickets,
        uint256 _generalPrice,
        uint256 _enclosurePrice,
        uint256 _vipPrice
    ) {
        require(_generalPrice > 0 && _enclosurePrice > 0 && _vipPrice > 0, "Prices must be > 0");
        owner        = _owner;
        factory      = _factory;
        zkVerifier   = _zkVerifier;
        matchName    = _matchName;
        venue        = _venue;
        dateString   = _dateString;
        totalTickets = _totalTickets;
        categoryPrices[TicketCategory.General]   = _generalPrice;
        categoryPrices[TicketCategory.Enclosure] = _enclosurePrice;
        categoryPrices[TicketCategory.VIP]       = _vipPrice;
    }

    // ── Pricing ───────────────────────────────────────────────────────────────

    function setCategoryPrice(TicketCategory category, uint256 price) external onlyOwner {
        require(price > 0, "Price must be > 0");
        categoryPrices[category] = price;
        emit CategoryPriceUpdated(category, price);
    }

    function getCategoryPrice(TicketCategory category) public view returns (uint256) {
        return categoryPrices[category];
    }

    function getAllPrices() external view returns (uint256 general, uint256 enclosure, uint256 vip) {
        return (
            categoryPrices[TicketCategory.General],
            categoryPrices[TicketCategory.Enclosure],
            categoryPrices[TicketCategory.VIP]
        );
    }

    // ── Seats ─────────────────────────────────────────────────────────────────

    function isSeatTaken(string calldata seatLabel) external view returns (bool) {
        return seatTaken[keccak256(abi.encodePacked(seatLabel))];
    }

    function getSeatsStatus(string[] calldata seatLabels) external view returns (bool[] memory) {
        bool[] memory result = new bool[](seatLabels.length);
        for (uint256 i = 0; i < seatLabels.length; i++) {
            result[i] = seatTaken[keccak256(abi.encodePacked(seatLabels[i]))];
        }
        return result;
    }

    // ── Standard Purchase (CNIC) ──────────────────────────────────────────────

    function buyTickets(
        string[]         calldata names,
        bytes32[]        calldata cnicHashes,
        TicketCategory[] calldata categories,
        string[]         calldata seatLabels
    ) external payable {
        uint256 qty = names.length;
        require(qty > 0, "Must buy at least 1 ticket");
        require(qty == cnicHashes.length && qty == categories.length && qty == seatLabels.length, "Array length mismatch");
        require(ticketsSold + qty <= totalTickets, "Not enough tickets left");

        uint256 totalCost;
        for (uint256 i = 0; i < qty; i++) {
            totalCost += getCategoryPrice(categories[i]);
        }
        require(msg.value >= totalCost, "Insufficient payment");

        for (uint256 i = 0; i < qty; i++) {
            bytes32 seatKey = keccak256(abi.encodePacked(seatLabels[i]));
            require(!seatTaken[seatKey], "Seat already taken");
            seatTaken[seatKey] = true;

            uint256 ticketId = ticketsSold + i;
            tickets[ticketId] = Ticket({
                id: ticketId, buyer: msg.sender, holderName: names[i],
                cnicHash: cnicHashes[i], category: categories[i], seat: seatLabels[i], used: false
            });
            purchaserTickets[msg.sender].push(ticketId);
            emit TicketPurchased(ticketId, msg.sender, names[i], categories[i], seatLabels[i]);
        }
        ticketsSold += qty;

        uint256 refund = msg.value - totalCost;
        if (refund > 0) {
            (bool ok,) = msg.sender.call{value: refund}("");
            require(ok, "Refund failed");
        }
    }

    // ── ZKP Purchase ──────────────────────────────────────────────────────────

    function buyTicketZK(
        bytes32 commitment,
        string calldata name,
        bytes32 cnicHash,
        TicketCategory category,
        string calldata seatLabel
    ) external payable {
        require(!commitments[commitment], "Commitment already exists");
        require(ticketsSold < totalTickets, "Sold out");

        bytes32 seatKey = keccak256(abi.encodePacked(seatLabel));
        require(!seatTaken[seatKey], "Seat already taken");

        uint256 price = getCategoryPrice(category);
        require(msg.value >= price, "Insufficient payment");

        seatTaken[seatKey] = true;
        commitments[commitment] = true;

        uint256 ticketId = ticketsSold;
        tickets[ticketId] = Ticket({
            id: ticketId, buyer: msg.sender, holderName: name,
            cnicHash: cnicHash, category: category, seat: seatLabel, used: false
        });
        purchaserTickets[msg.sender].push(ticketId);
        ticketsSold++;
        zkTicketCount++;

        emit TicketPurchased(ticketId, msg.sender, name, category, seatLabel);
        emit ZKTicketPurchased(commitment, seatLabel);

        uint256 refund = msg.value - price;
        if (refund > 0) {
            (bool ok,) = msg.sender.call{value: refund}("");
            require(ok, "Refund failed");
        }
    }

    // ── ZKP Entry ─────────────────────────────────────────────────────────────

    function verifyAndEnter(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        bytes32 _commitment,
        bytes32 _nullifierHash
    ) external onlyOwnerOrMod {
        require(zkVerifier != address(0), "ZK verifier not set");
        require(commitments[_commitment], "Unknown commitment");
        require(!usedNullifiers[_nullifierHash], "Nullifier already used");

        bool valid = IGroth16Verifier(zkVerifier).verifyProof(
            _pA, _pB, _pC,
            [uint256(_commitment), uint256(_nullifierHash)]
        );
        require(valid, "Invalid ZK proof");

        usedNullifiers[_nullifierHash] = true;
        emit TicketUsed(0);
        emit ZKEntryVerified(_nullifierHash);
    }

    // ── Standard Entry (CNIC) ─────────────────────────────────────────────────

    function useTicket(uint256 ticketId) external onlyOwnerOrMod {
        require(ticketId < ticketsSold, "Ticket does not exist");
        require(!tickets[ticketId].used, "Ticket already used");
        tickets[ticketId].used = true;
        emit TicketUsed(ticketId);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function withdrawFunds() external onlyOwner {
        uint256 bal = address(this).balance;
        require(bal > 0, "No funds to withdraw");
        (bool ok,) = owner.call{value: bal}("");
        require(ok, "Withdraw failed");
        emit FundsWithdrawn(owner, bal);
    }

    function getPurchaserTickets(address buyer) external view returns (Ticket[] memory) {
        uint256[] memory ids = purchaserTickets[buyer];
        Ticket[] memory result = new Ticket[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            result[i] = tickets[ids[i]];
        }
        return result;
    }

    function ticketsRemaining() external view returns (uint256) {
        return totalTickets - ticketsSold;
    }
}

// src/RewardsPool.sol

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

// src/TicketFactory.sol

contract TicketFactory {
    struct MatchInfo {
        string name;
        string venue;
        string dateString;
        uint256 totalTickets;
        uint256 generalPrice;
        uint256 enclosurePrice;
        uint256 vipPrice;
        address contractAddr;
        bool active;
    }

    address public owner;
    address public zkVerifier;          // Groth16Verifier — shared by all matches
    RewardsPool public rewardsPool;     // Deployed in constructor — auto-registered
    address[] public matchAddresses;
    mapping(address => MatchInfo) public matchInfo;

    mapping(address => bool) public mods;
    address[] private modList;

    event MatchCreated(address indexed matchContract, string name, string venue, uint256 generalPrice, uint256 enclosurePrice, uint256 vipPrice, uint256 totalTickets);
    event MatchToggled(address indexed matchContract, bool active);
    event ModAdded(address indexed mod);
    event ModRemoved(address indexed mod);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    /// @param _zkVerifier Address of deployed Groth16Verifier contract
    constructor(address _zkVerifier) {
        require(_zkVerifier != address(0), "Zero verifier address");
        owner = msg.sender;
        zkVerifier = _zkVerifier;
        // Deploy RewardsPool: admin = wallet owner, factory = this contract
        rewardsPool = new RewardsPool(msg.sender, address(this));
    }

    // ── Mod management ────────────────────────────────────────────────────────

    function addMod(address mod) external onlyOwner {
        require(!mods[mod], "Already a mod");
        mods[mod] = true;
        modList.push(mod);
        emit ModAdded(mod);
    }

    function removeMod(address mod) external onlyOwner {
        require(mods[mod], "Not a mod");
        mods[mod] = false;
        for (uint256 i = 0; i < modList.length; i++) {
            if (modList[i] == mod) {
                modList[i] = modList[modList.length - 1];
                modList.pop();
                break;
            }
        }
        emit ModRemoved(mod);
    }

    function getMods() external view returns (address[] memory) {
        return modList;
    }

    function isMod(address addr) external view returns (bool) {
        return addr == owner || mods[addr];
    }

    // ── Match management ──────────────────────────────────────────────────────

    /// Creates match with ZK verifier auto-wired + auto-registered in RewardsPool
    function createMatch(
        string calldata _name,
        string calldata _venue,
        string calldata _dateString,
        uint256 _totalTickets,
        uint256 _generalPrice,
        uint256 _enclosurePrice,
        uint256 _vipPrice
    ) external onlyOwner returns (address) {
        MatchTickets mt = new MatchTickets(
            owner,
            address(this),
            zkVerifier,         // ZK verifier auto-wired
            _name,
            _venue,
            _dateString,
            _totalTickets,
            _generalPrice,
            _enclosurePrice,
            _vipPrice
        );

        address addr = address(mt);

        // Auto-register in RewardsPool — no manual step
        rewardsPool.addMatch(addr);

        matchAddresses.push(addr);
        matchInfo[addr] = MatchInfo({
            name:           _name,
            venue:          _venue,
            dateString:     _dateString,
            totalTickets:   _totalTickets,
            generalPrice:   _generalPrice,
            enclosurePrice: _enclosurePrice,
            vipPrice:       _vipPrice,
            contractAddr:   addr,
            active:         true
        });

        emit MatchCreated(addr, _name, _venue, _generalPrice, _enclosurePrice, _vipPrice, _totalTickets);
        return addr;
    }

    function toggleMatchActive(address matchAddr) external onlyOwner {
        require(matchInfo[matchAddr].contractAddr != address(0), "Match not found");
        matchInfo[matchAddr].active = !matchInfo[matchAddr].active;
        emit MatchToggled(matchAddr, matchInfo[matchAddr].active);
    }

    function getAllMatches() external view returns (address[] memory) {
        return matchAddresses;
    }

    function getMatchInfo(address matchAddr) external view returns (MatchInfo memory) {
        return matchInfo[matchAddr];
    }

    function getMatchCount() external view returns (uint256) {
        return matchAddresses.length;
    }
}

