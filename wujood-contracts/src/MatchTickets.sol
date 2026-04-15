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

    // FIX [TicketUsed(0) bug]: maps commitment → ticketId so verifyAndEnter
    // can find and mark the correct ticket as used.
    mapping(bytes32 => uint256) public commitmentToTicketId;

    // FIX [toggleMatchActive enforcement]: paused flag controlled by factory/owner.
    // New storage slot — no existing slot affected.
    bool public paused;

    // FIX [reentrancy]: inline guard (equivalent to OZ ReentrancyGuard).
    // Using 1/2 instead of 0/1 to avoid cold-storage cost on first call.
    uint256 private _reentrancyStatus = 1;

    event TicketPurchased(uint256 indexed ticketId, address indexed buyer, string holderName, TicketCategory category, string seat);
    event TicketUsed(uint256 indexed ticketId);
    event ZKTicketPurchased(bytes32 indexed commitment, string seat);
    event ZKEntryVerified(bytes32 indexed nullifierHash);
    event FundsWithdrawn(address indexed to, uint256 amount);
    event CategoryPriceUpdated(TicketCategory category, uint256 price);
    // FIX [toggleMatchActive enforcement]: new event, no existing event changed.
    event MatchPaused(bool paused);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyOwnerOrMod() {
        require(ITicketFactory(factory).isMod(msg.sender), "Not owner or mod");
        _;
    }

    // FIX [toggleMatchActive enforcement]: applied to buyTickets and buyTicketZK only.
    // Gate functions do NOT check paused — staff can still verify/enter while sales are off.
    modifier whenNotPaused() {
        require(!paused, "Match is paused");
        _;
    }

    // FIX [reentrancy]: modifier for payable state-changing functions.
    modifier nonReentrant() {
        require(_reentrancyStatus == 1, "Reentrant call");
        _reentrancyStatus = 2;
        _;
        _reentrancyStatus = 1;
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
    // Signatures unchanged.

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
    // Signatures unchanged.

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
    // Signature unchanged.
    // FIX [reentrancy]: added nonReentrant.
    // FIX [toggleMatchActive]: added whenNotPaused.

    function buyTickets(
        string[]         calldata names,
        bytes32[]        calldata cnicHashes,
        TicketCategory[] calldata categories,
        string[]         calldata seatLabels
    ) external payable nonReentrant whenNotPaused {
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
            // nonReentrant guard above makes this safe.
            (bool ok,) = msg.sender.call{value: refund}("");
            require(ok, "Refund failed");
        }
    }

    // ── ZKP Purchase ──────────────────────────────────────────────────────────
    // Signature unchanged.
    // FIX [reentrancy]: added nonReentrant.
    // FIX [toggleMatchActive]: added whenNotPaused.
    // FIX [TicketUsed(0) bug]: stores commitmentToTicketId so verifyAndEnter
    //      can resolve the correct ticket ID at entry time.

    function buyTicketZK(
        bytes32 commitment,
        string calldata name,
        bytes32 cnicHash,
        TicketCategory category,
        string calldata seatLabel
    ) external payable nonReentrant whenNotPaused {
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

        // FIX [TicketUsed(0) bug]: record which ticketId this commitment maps to.
        commitmentToTicketId[commitment] = ticketId;

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
    // Signature unchanged.
    // FIX [TicketUsed(0) bug]:
    //   - Resolves ticketId from commitmentToTicketId instead of hardcoding 0.
    //   - Marks tickets[ticketId].used = true so CNIC and ZK tickets both have
    //     a consistent on-chain audit trail.
    //   - Emits TicketUsed(ticketId) with the real ID.

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

        // FIX [TicketUsed(0) bug]: look up and mark the actual ticket.
        uint256 ticketId = commitmentToTicketId[_commitment];
        tickets[ticketId].used = true;

        emit TicketUsed(ticketId);
        emit ZKEntryVerified(_nullifierHash);
    }

    // ── Standard Entry (CNIC) ─────────────────────────────────────────────────
    // Signature unchanged.

    function useTicket(uint256 ticketId) external onlyOwnerOrMod {
        require(ticketId < ticketsSold, "Ticket does not exist");
        require(!tickets[ticketId].used, "Ticket already used");
        tickets[ticketId].used = true;
        emit TicketUsed(ticketId);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────
    // Signatures unchanged.
    // FIX [reentrancy]: added nonReentrant to withdrawFunds.

    function withdrawFunds() external onlyOwner nonReentrant {
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

    // ── New: pause control ────────────────────────────────────────────────────
    // FIX [toggleMatchActive enforcement]: called by TicketFactory.toggleMatchActive.
    // Must use onlyFactory — when TicketFactory calls this, msg.sender is the
    // factory contract address, not the owner EOA, so onlyOwnerOrMod would fail.
    // NEW function — no existing signature changed.

    modifier onlyFactory() {
        require(msg.sender == factory, "Not factory");
        _;
    }

    function setPaused(bool _paused) external onlyFactory {
        paused = _paused;
        emit MatchPaused(_paused);
    }
}
