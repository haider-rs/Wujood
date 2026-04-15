// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {TicketFactory} from "../src/TicketFactory.sol";
import {MatchTickets} from "../src/MatchTickets.sol";

// Minimal mock — tests don't need real proof verification
contract MockVerifier {
    function verifyProof(uint256[2] calldata, uint256[2][2] calldata, uint256[2] calldata, uint256[2] calldata)
        external
        pure
        returns (bool)
    {
        return true;
    }
}

contract TicketFactoryTest is Test {
    TicketFactory factory;
    MockVerifier verifier;
    address owner = address(this);
    address fan1 = makeAddr("fan1");
    address fan2 = makeAddr("fan2");

    uint256 constant GENERAL_PRICE = 0.005 ether;
    uint256 constant ENCLOSURE_PRICE = 0.01 ether;
    uint256 constant VIP_PRICE = 0.02 ether;
    uint256 constant TOTAL_TICKETS = 100;

    function setUp() public {
        verifier = new MockVerifier();
        factory = new TicketFactory(address(verifier));
    }

    function test_FactoryOwnerIsDeployer() public view {
        assertEq(factory.owner(), owner);
    }

    function test_ZkVerifierIsSet() public view {
        assertEq(factory.zkVerifier(), address(verifier));
    }

    function test_RewardsPoolAutoDeployed() public view {
        assertTrue(address(factory.rewardsPool()) != address(0));
    }

    function test_CreateMatch() public {
        address matchAddr = factory.createMatch(
            "LQ vs KK", "Gaddafi Stadium", "2026-04-14", TOTAL_TICKETS, GENERAL_PRICE, ENCLOSURE_PRICE, VIP_PRICE
        );

        assertTrue(matchAddr != address(0));

        TicketFactory.MatchInfo memory info = factory.getMatchInfo(matchAddr);
        assertEq(info.name, "LQ vs KK");
        assertEq(info.venue, "Gaddafi Stadium");
        assertEq(info.dateString, "2026-04-14");
        assertEq(info.generalPrice, GENERAL_PRICE);
        assertEq(info.enclosurePrice, ENCLOSURE_PRICE);
        assertEq(info.vipPrice, VIP_PRICE);
        assertEq(info.totalTickets, TOTAL_TICKETS);
        assertEq(info.contractAddr, matchAddr);
        assertTrue(info.active);
    }

    function test_CreateMatchAutoWiresZkVerifier() public {
        address matchAddr =
            factory.createMatch("Test", "Venue", "2026-04-14", 10, GENERAL_PRICE, ENCLOSURE_PRICE, VIP_PRICE);
        assertEq(MatchTickets(matchAddr).zkVerifier(), address(verifier));
    }

    function test_CreateMatchAutoRegistersInRewardsPool() public {
        address matchAddr =
            factory.createMatch("Test", "Venue", "2026-04-14", 10, GENERAL_PRICE, ENCLOSURE_PRICE, VIP_PRICE);
        address[] memory registered = factory.rewardsPool().getRegisteredMatches();
        assertEq(registered.length, 1);
        assertEq(registered[0], matchAddr);
    }

    function test_GetAllMatches() public {
        factory.createMatch("Match A", "V1", "2026-04-14", 50, GENERAL_PRICE, ENCLOSURE_PRICE, VIP_PRICE);
        factory.createMatch("Match B", "V2", "2026-04-15", 50, GENERAL_PRICE, ENCLOSURE_PRICE, VIP_PRICE);

        address[] memory matches = factory.getAllMatches();
        assertEq(matches.length, 2);

        // Both auto-registered in rewards pool
        assertEq(factory.rewardsPool().getRegisteredMatches().length, 2);
    }

    function test_CreateMatchOnlyOwner() public {
        vm.prank(fan1);
        vm.expectRevert("Not owner");
        factory.createMatch("X", "Y", "Z", 10, GENERAL_PRICE, ENCLOSURE_PRICE, VIP_PRICE);
    }

    function test_ToggleMatchActive() public {
        address matchAddr =
            factory.createMatch("LQ vs KK", "Gaddafi", "2026-04-14", 10, GENERAL_PRICE, ENCLOSURE_PRICE, VIP_PRICE);

        assertTrue(factory.getMatchInfo(matchAddr).active);
        factory.toggleMatchActive(matchAddr);
        assertFalse(factory.getMatchInfo(matchAddr).active);
        factory.toggleMatchActive(matchAddr);
        assertTrue(factory.getMatchInfo(matchAddr).active);
    }

    function test_ToggleMatchActiveOnlyOwner() public {
        address matchAddr =
            factory.createMatch("LQ vs KK", "Gaddafi", "2026-04-14", 10, GENERAL_PRICE, ENCLOSURE_PRICE, VIP_PRICE);
        vm.prank(fan1);
        vm.expectRevert("Not owner");
        factory.toggleMatchActive(matchAddr);
    }

    function test_ToggleMatchActiveNonExistent() public {
        vm.expectRevert("Match not found");
        factory.toggleMatchActive(address(0xdead));
    }

    // ── Mod management ────────────────────────────────────────────────────────

    function test_AddMod() public {
        address mod = makeAddr("mod1");
        factory.addMod(mod);
        assertTrue(factory.mods(mod));
        assertTrue(factory.isMod(mod));
        assertEq(factory.getMods().length, 1);
        assertEq(factory.getMods()[0], mod);
    }

    function test_RemoveMod() public {
        address mod1 = makeAddr("mod1");
        address mod2 = makeAddr("mod2");
        factory.addMod(mod1);
        factory.addMod(mod2);
        assertEq(factory.getMods().length, 2);

        factory.removeMod(mod1);
        assertFalse(factory.mods(mod1));
        assertEq(factory.getMods().length, 1);
    }

    function test_AddModOnlyOwner() public {
        vm.prank(fan1);
        vm.expectRevert("Not owner");
        factory.addMod(makeAddr("mod1"));
    }

    function test_RemoveModOnlyOwner() public {
        address mod = makeAddr("mod1");
        factory.addMod(mod);
        vm.prank(fan1);
        vm.expectRevert("Not owner");
        factory.removeMod(mod);
    }

    function test_AddModDuplicateReverts() public {
        address mod = makeAddr("mod1");
        factory.addMod(mod);
        vm.expectRevert("Already a mod");
        factory.addMod(mod);
    }

    function test_RemoveNonModReverts() public {
        vm.expectRevert("Not a mod");
        factory.removeMod(makeAddr("mod1"));
    }

    function test_ModAddedEventEmitted() public {
        address mod = makeAddr("mod1");
        vm.expectEmit(true, false, false, false);
        emit TicketFactory.ModAdded(mod);
        factory.addMod(mod);
    }

    function test_ModRemovedEventEmitted() public {
        address mod = makeAddr("mod1");
        factory.addMod(mod);
        vm.expectEmit(true, false, false, false);
        emit TicketFactory.ModRemoved(mod);
        factory.removeMod(mod);
    }
}

contract MatchTicketsTest is Test {
    TicketFactory factory;
    MockVerifier verifier;
    MatchTickets matchContract;
    address owner = address(this);
    address fan1 = makeAddr("fan1");
    address fan2 = makeAddr("fan2");
    address mod1 = makeAddr("mod1");
    address mod2 = makeAddr("mod2");

    uint256 constant GENERAL_PRICE = 0.005 ether;
    uint256 constant ENCLOSURE_PRICE = 0.01 ether;
    uint256 constant VIP_PRICE = 0.02 ether;
    uint256 constant TOTAL_TICKETS = 10;

    function setUp() public {
        verifier = new MockVerifier();
        factory = new TicketFactory(address(verifier));
        address matchAddr = factory.createMatch(
            "LQ vs KK", "Gaddafi Stadium", "2026-04-14", TOTAL_TICKETS, GENERAL_PRICE, ENCLOSURE_PRICE, VIP_PRICE
        );
        matchContract = MatchTickets(matchAddr);

        vm.deal(fan1, 1 ether);
        vm.deal(fan2, 1 ether);
    }

    receive() external payable {}

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _buyOne(address buyer, string memory name, string memory seat, MatchTickets.TicketCategory category)
        internal
    {
        string[] memory names = new string[](1);
        bytes32[] memory cnics = new bytes32[](1);
        MatchTickets.TicketCategory[] memory cats = new MatchTickets.TicketCategory[](1);
        string[] memory seats = new string[](1);

        names[0] = name;
        cnics[0] = keccak256(abi.encodePacked("3520212345678"));
        cats[0] = category;
        seats[0] = seat;

        uint256 price = _getPrice(category);
        vm.prank(buyer);
        matchContract.buyTickets{value: price}(names, cnics, cats, seats);
    }

    function _getPrice(MatchTickets.TicketCategory category) internal view returns (uint256) {
        if (category == MatchTickets.TicketCategory.General) return GENERAL_PRICE;
        if (category == MatchTickets.TicketCategory.Enclosure) return ENCLOSURE_PRICE;
        return VIP_PRICE;
    }

    function _buyMultiple(address buyer, uint256 qty, MatchTickets.TicketCategory category) internal {
        string[] memory names = new string[](qty);
        bytes32[] memory cnics = new bytes32[](qty);
        MatchTickets.TicketCategory[] memory cats = new MatchTickets.TicketCategory[](qty);
        string[] memory seats = new string[](qty);

        for (uint256 i = 0; i < qty; i++) {
            names[i] = "Holder";
            cnics[i] = keccak256(abi.encodePacked(i));
            cats[i] = category;
            seats[i] = string(abi.encodePacked("GEN-A-", _toStr(i + 1)));
        }

        uint256 totalCost = _getPrice(category) * qty;
        vm.prank(buyer);
        matchContract.buyTickets{value: totalCost}(names, cnics, cats, seats);
    }

    function _toStr(uint256 n) internal pure returns (string memory) {
        if (n == 0) return "0";
        bytes memory b;
        while (n > 0) b = abi.encodePacked(uint8(48 + n % 10), b);
        n /= 10;
        return string(b);
    }

    // ── Basic purchase tests ──────────────────────────────────────────────────

    function test_BuySingleTicket() public {
        _buyOne(fan1, "Ali Khan", "ENC-A-1", MatchTickets.TicketCategory.Enclosure);

        assertEq(matchContract.ticketsSold(), 1);
        assertEq(matchContract.ticketsRemaining(), TOTAL_TICKETS - 1);

        MatchTickets.Ticket[] memory tix = matchContract.getPurchaserTickets(fan1);
        assertEq(tix.length, 1);
        assertEq(tix[0].holderName, "Ali Khan");
        assertEq(tix[0].seat, "ENC-A-1");
        assertFalse(tix[0].used);
    }

    function test_BuyMultipleTickets() public {
        _buyMultiple(fan1, 3, MatchTickets.TicketCategory.General);

        assertEq(matchContract.ticketsSold(), 3);
        MatchTickets.Ticket[] memory tix = matchContract.getPurchaserTickets(fan1);
        assertEq(tix.length, 3);
    }

    function test_InsufficientPaymentReverts() public {
        string[] memory names = new string[](1);
        bytes32[] memory cnics = new bytes32[](1);
        MatchTickets.TicketCategory[] memory cats = new MatchTickets.TicketCategory[](1);
        string[] memory seats = new string[](1);
        names[0] = "Ali";
        cnics[0] = bytes32(0);
        cats[0] = MatchTickets.TicketCategory.VIP;
        seats[0] = "VIP-A-1";

        vm.prank(fan1);
        vm.expectRevert("Insufficient payment");
        matchContract.buyTickets{value: 0.001 ether}(names, cnics, cats, seats);
    }

    function test_ExcessPaymentRefunded() public {
        uint256 before = fan1.balance;
        _buyOne(fan1, "Ali", "ENC-A-1", MatchTickets.TicketCategory.Enclosure);
        assertEq(fan1.balance, before - ENCLOSURE_PRICE);
    }

    function test_SoldOutReverts() public {
        _buyMultiple(fan1, TOTAL_TICKETS, MatchTickets.TicketCategory.General);

        vm.expectRevert("Not enough tickets left");
        _buyOne(fan2, "Extra", "GEN-Z-1", MatchTickets.TicketCategory.General);
    }

    // ── Seat tests ────────────────────────────────────────────────────────────

    function test_SeatMarkedTaken() public {
        _buyOne(fan1, "Ali", "ENC-A-1", MatchTickets.TicketCategory.Enclosure);
        assertTrue(matchContract.isSeatTaken("ENC-A-1"));
        assertFalse(matchContract.isSeatTaken("ENC-A-2"));
    }

    function test_DuplicateSeatReverts() public {
        _buyOne(fan1, "Ali", "ENC-A-1", MatchTickets.TicketCategory.Enclosure);
        vm.expectRevert("Seat already taken");
        _buyOne(fan2, "Sara", "ENC-A-1", MatchTickets.TicketCategory.Enclosure);
    }

    function test_GetSeatsStatus() public {
        _buyOne(fan1, "Ali", "ENC-A-1", MatchTickets.TicketCategory.Enclosure);
        _buyOne(fan2, "Sara", "ENC-A-3", MatchTickets.TicketCategory.Enclosure);

        string[] memory labels = new string[](4);
        labels[0] = "ENC-A-1";
        labels[1] = "ENC-A-2";
        labels[2] = "ENC-A-3";
        labels[3] = "ENC-A-4";

        bool[] memory status = matchContract.getSeatsStatus(labels);
        assertTrue(status[0]);
        assertFalse(status[1]);
        assertTrue(status[2]);
        assertFalse(status[3]);
    }

    function test_DifferentSeatsSucceed() public {
        _buyOne(fan1, "Ali", "ENC-A-1", MatchTickets.TicketCategory.Enclosure);
        _buyOne(fan2, "Sara", "ENC-A-2", MatchTickets.TicketCategory.Enclosure);
        assertEq(matchContract.ticketsSold(), 2);
    }

    // ── Mod role ──────────────────────────────────────────────────────────────

    function test_ModCanUseTicket() public {
        _buyOne(fan1, "Ali", "ENC-A-1", MatchTickets.TicketCategory.Enclosure);
        factory.addMod(mod1);

        vm.prank(mod1);
        matchContract.useTicket(0);

        assertTrue(matchContract.getPurchaserTickets(fan1)[0].used);
    }

    function test_NonModCannotUseTicket() public {
        _buyOne(fan1, "Ali", "ENC-A-1", MatchTickets.TicketCategory.Enclosure);
        vm.prank(fan1);
        vm.expectRevert("Not owner or mod");
        matchContract.useTicket(0);
    }

    function test_OwnerIsAlwaysMod() public view {
        assertTrue(factory.isMod(owner));
    }

    // ── useTicket ─────────────────────────────────────────────────────────────

    function test_UseTicketSucceeds() public {
        _buyOne(fan1, "Ali", "ENC-A-1", MatchTickets.TicketCategory.Enclosure);
        matchContract.useTicket(0);
        assertTrue(matchContract.getPurchaserTickets(fan1)[0].used);
    }

    function test_UseTicketAlreadyUsedReverts() public {
        _buyOne(fan1, "Ali", "ENC-A-1", MatchTickets.TicketCategory.Enclosure);
        matchContract.useTicket(0);
        vm.expectRevert("Ticket already used");
        matchContract.useTicket(0);
    }

    function test_UseTicketNonExistentReverts() public {
        vm.expectRevert("Ticket does not exist");
        matchContract.useTicket(999);
    }

    // ── withdrawFunds ─────────────────────────────────────────────────────────

    function test_WithdrawFunds() public {
        _buyMultiple(fan1, 3, MatchTickets.TicketCategory.General);
        uint256 expected = GENERAL_PRICE * 3;
        assertEq(address(matchContract).balance, expected);

        uint256 ownerBefore = owner.balance;
        matchContract.withdrawFunds();
        assertEq(address(matchContract).balance, 0);
        assertEq(owner.balance, ownerBefore + expected);
    }

    function test_WithdrawFundsOnlyOwner() public {
        _buyOne(fan1, "Ali", "ENC-A-1", MatchTickets.TicketCategory.Enclosure);
        vm.prank(fan1);
        vm.expectRevert("Not owner");
        matchContract.withdrawFunds();
    }

    function test_WithdrawFundsEmptyReverts() public {
        vm.expectRevert("No funds to withdraw");
        matchContract.withdrawFunds();
    }

    // ── getPurchaserTickets ───────────────────────────────────────────────────

    function test_GetPurchaserTicketsBatchFetch() public {
        _buyMultiple(fan1, 3, MatchTickets.TicketCategory.General);
        _buyOne(fan2, "Separate Fan", "PAV-F-1", MatchTickets.TicketCategory.VIP);

        assertEq(matchContract.getPurchaserTickets(fan1).length, 3);
        assertEq(matchContract.getPurchaserTickets(fan2).length, 1);
        assertEq(matchContract.getPurchaserTickets(fan2)[0].holderName, "Separate Fan");
    }

    function test_GetPurchaserTicketsEmptyAddress() public {
        assertEq(matchContract.getPurchaserTickets(makeAddr("nobody")).length, 0);
    }

    // ── Events ────────────────────────────────────────────────────────────────

    function test_TicketPurchasedEventEmitted() public {
        string[] memory names = new string[](1);
        bytes32[] memory cnics = new bytes32[](1);
        MatchTickets.TicketCategory[] memory cats = new MatchTickets.TicketCategory[](1);
        string[] memory seats = new string[](1);
        names[0] = "Ali";
        cnics[0] = bytes32(0);
        cats[0] = MatchTickets.TicketCategory.VIP;
        seats[0] = "ENC-A-1";

        vm.prank(fan1);
        vm.expectEmit(true, true, false, true);
        emit MatchTickets.TicketPurchased(0, fan1, "Ali", MatchTickets.TicketCategory.VIP, "ENC-A-1");
        matchContract.buyTickets{value: VIP_PRICE}(names, cnics, cats, seats);
    }

    function test_TicketUsedEventEmitted() public {
        _buyOne(fan1, "Ali", "ENC-A-1", MatchTickets.TicketCategory.Enclosure);
        vm.expectEmit(true, false, false, false);
        emit MatchTickets.TicketUsed(0);
        matchContract.useTicket(0);
    }

    function test_FundsWithdrawnEventEmitted() public {
        _buyOne(fan1, "Ali", "ENC-A-1", MatchTickets.TicketCategory.Enclosure);
        vm.expectEmit(true, false, false, true);
        emit MatchTickets.FundsWithdrawn(owner, ENCLOSURE_PRICE);
        matchContract.withdrawFunds();
    }

    // ── Full Day 2 integration ────────────────────────────────────────────────

    function test_FullDay2Flow() public {
        assertEq(factory.getMatchCount(), 1);

        factory.addMod(mod1);
        assertTrue(factory.isMod(mod1));

        string[] memory names = new string[](2);
        bytes32[] memory cnics = new bytes32[](2);
        MatchTickets.TicketCategory[] memory cats = new MatchTickets.TicketCategory[](2);
        string[] memory seats = new string[](2);
        names[0] = "Ali Khan";
        names[1] = "Sara Khan";
        cnics[0] = keccak256(abi.encodePacked("35201-1234567-8"));
        cnics[1] = keccak256(abi.encodePacked("35201-7654321-0"));
        cats[0] = MatchTickets.TicketCategory.Enclosure;
        cats[1] = MatchTickets.TicketCategory.VIP;
        seats[0] = "ENC-A-5";
        seats[1] = "VIP-F-10";

        uint256 totalCost = ENCLOSURE_PRICE + VIP_PRICE;
        vm.prank(fan1);
        matchContract.buyTickets{value: totalCost}(names, cnics, cats, seats);

        MatchTickets.Ticket[] memory tix = matchContract.getPurchaserTickets(fan1);
        assertEq(tix[0].seat, "ENC-A-5");
        assertEq(tix[1].seat, "VIP-F-10");
        assertTrue(matchContract.isSeatTaken("ENC-A-5"));

        vm.expectRevert("Seat already taken");
        _buyOne(fan2, "Scalper", "ENC-A-5", MatchTickets.TicketCategory.Enclosure);

        vm.prank(mod1);
        matchContract.useTicket(0);
        assertTrue(matchContract.getPurchaserTickets(fan1)[0].used);
        assertFalse(matchContract.getPurchaserTickets(fan1)[1].used);

        vm.prank(mod1);
        vm.expectRevert("Ticket already used");
        matchContract.useTicket(0);

        vm.prank(fan2);
        vm.expectRevert("Not owner or mod");
        matchContract.useTicket(1);

        factory.removeMod(mod1);
        assertFalse(factory.mods(mod1));

        uint256 ownerBal = owner.balance;
        matchContract.withdrawFunds();
        assertEq(owner.balance, ownerBal + totalCost);
    }
}
