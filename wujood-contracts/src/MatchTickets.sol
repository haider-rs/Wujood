// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

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
