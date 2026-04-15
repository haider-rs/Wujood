// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/TicketFactory.sol";
import "../src/MatchTickets.sol";
import "../src/RewardsPool.sol";

contract MockVerifier {
    function verifyProof(uint[2] calldata, uint[2][2] calldata, uint[2] calldata, uint[2] calldata)
        external pure returns (bool)
    { return true; }
}

contract RejectVerifier {
    function verifyProof(uint[2] calldata, uint[2][2] calldata, uint[2] calldata, uint[2] calldata)
        external pure returns (bool)
    { return false; }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ZKP Tests
// ═══════════════════════════════════════════════════════════════════════════════

contract ZKPTest is Test {
    TicketFactory factory;
    address owner = address(this);
    address fan = makeAddr("fan");
    address mod1 = makeAddr("mod1");
    address matchAddr;

    function setUp() public {
        MockVerifier verifier = new MockVerifier();
        factory = new TicketFactory(address(verifier));
        matchAddr = factory.createMatch(
            "LQ vs KK", "Gaddafi Stadium", "April 15, 2026",
            100, 0.001 ether, 0.005 ether, 0.01 ether
        );
        factory.addMod(mod1);
        vm.deal(fan, 10 ether);
    }

    function test_matchHasZkVerifierSet() public view {
        assertTrue(MatchTickets(matchAddr).zkVerifier() != address(0));
        assertEq(MatchTickets(matchAddr).zkVerifier(), factory.zkVerifier());
    }

    function test_matchAutoRegisteredInRewardsPool() public view {
        address[] memory registered = factory.rewardsPool().getRegisteredMatches();
        assertEq(registered.length, 1);
        assertEq(registered[0], matchAddr);
    }

    function test_buyTicketZK() public {
        bytes32 commitment = keccak256("test_commitment");
        vm.prank(fan);
        MatchTickets(matchAddr).buyTicketZK{value: 0.001 ether}(
            commitment, "Ali", keccak256("1234567890123"),
            MatchTickets.TicketCategory.General, "GEN-A-1"
        );
        assertTrue(MatchTickets(matchAddr).commitments(commitment));
        assertEq(MatchTickets(matchAddr).ticketsSold(), 1);
        assertEq(MatchTickets(matchAddr).zkTicketCount(), 1);
        assertTrue(MatchTickets(matchAddr).isSeatTaken("GEN-A-1"));
    }

    function test_buyTicketZK_duplicateCommitmentReverts() public {
        bytes32 commitment = keccak256("dup");
        vm.startPrank(fan);
        MatchTickets(matchAddr).buyTicketZK{value: 0.001 ether}(
            commitment, "A", bytes32(0), MatchTickets.TicketCategory.General, "GEN-A-1"
        );
        vm.expectRevert("Commitment already exists");
        MatchTickets(matchAddr).buyTicketZK{value: 0.001 ether}(
            commitment, "B", bytes32(0), MatchTickets.TicketCategory.General, "GEN-A-2"
        );
        vm.stopPrank();
    }

    function test_buyTicketZK_seatConflictReverts() public {
        vm.startPrank(fan);
        MatchTickets(matchAddr).buyTicketZK{value: 0.001 ether}(
            keccak256("c1"), "A", bytes32(0), MatchTickets.TicketCategory.General, "GEN-A-1"
        );
        vm.expectRevert("Seat already taken");
        MatchTickets(matchAddr).buyTicketZK{value: 0.001 ether}(
            keccak256("c2"), "B", bytes32(0), MatchTickets.TicketCategory.General, "GEN-A-1"
        );
        vm.stopPrank();
    }

    function test_buyTicketZK_insufficientPaymentReverts() public {
        vm.prank(fan);
        vm.expectRevert("Insufficient payment");
        MatchTickets(matchAddr).buyTicketZK{value: 0.0001 ether}(
            keccak256("c"), "A", bytes32(0), MatchTickets.TicketCategory.General, "GEN-A-1"
        );
    }

    function test_verifyAndEnter() public {
        bytes32 commitment = keccak256("zk_commit");
        bytes32 nullifierHash = keccak256("zk_null");

        vm.prank(fan);
        MatchTickets(matchAddr).buyTicketZK{value: 0.01 ether}(
            commitment, "Fan", bytes32(0), MatchTickets.TicketCategory.VIP, "VIP-A-1"
        );

        uint[2] memory pA; uint[2][2] memory pB; uint[2] memory pC;
        vm.prank(mod1);
        MatchTickets(matchAddr).verifyAndEnter(pA, pB, pC, commitment, nullifierHash);
        assertTrue(MatchTickets(matchAddr).usedNullifiers(nullifierHash));
    }

    function test_verifyAndEnter_doubleEntryReverts() public {
        bytes32 commitment = keccak256("c");
        bytes32 nullifierHash = keccak256("n");

        vm.prank(fan);
        MatchTickets(matchAddr).buyTicketZK{value: 0.001 ether}(
            commitment, "X", bytes32(0), MatchTickets.TicketCategory.General, "GEN-B-1"
        );

        uint[2] memory pA; uint[2][2] memory pB; uint[2] memory pC;
        vm.prank(mod1);
        MatchTickets(matchAddr).verifyAndEnter(pA, pB, pC, commitment, nullifierHash);

        vm.expectRevert("Nullifier already used");
        vm.prank(mod1);
        MatchTickets(matchAddr).verifyAndEnter(pA, pB, pC, commitment, nullifierHash);
    }

    function test_verifyAndEnter_unknownCommitmentReverts() public {
        uint[2] memory pA; uint[2][2] memory pB; uint[2] memory pC;
        vm.expectRevert("Unknown commitment");
        MatchTickets(matchAddr).verifyAndEnter(pA, pB, pC, keccak256("fake"), keccak256("n"));
    }

    function test_verifyAndEnter_invalidProofReverts() public {
        // Separate factory with RejectVerifier
        RejectVerifier rv = new RejectVerifier();
        TicketFactory rejectFactory = new TicketFactory(address(rv));
        address rejectMatch = rejectFactory.createMatch(
            "Reject Test", "V", "D", 100, 0.001 ether, 0.005 ether, 0.01 ether
        );

        bytes32 commitment = keccak256("c3");
        vm.prank(fan);
        MatchTickets(rejectMatch).buyTicketZK{value: 0.001 ether}(
            commitment, "X", bytes32(0), MatchTickets.TicketCategory.General, "GEN-C-1"
        );

        uint[2] memory pA; uint[2][2] memory pB; uint[2] memory pC;
        vm.expectRevert("Invalid ZK proof");
        MatchTickets(rejectMatch).verifyAndEnter(pA, pB, pC, commitment, keccak256("n"));
    }

    function test_verifyAndEnter_nonModReverts() public {
        bytes32 commitment = keccak256("c4");
        vm.prank(fan);
        MatchTickets(matchAddr).buyTicketZK{value: 0.001 ether}(
            commitment, "X", bytes32(0), MatchTickets.TicketCategory.General, "GEN-D-1"
        );

        uint[2] memory pA; uint[2][2] memory pB; uint[2] memory pC;
        vm.expectRevert("Not owner or mod");
        vm.prank(fan);
        MatchTickets(matchAddr).verifyAndEnter(pA, pB, pC, commitment, keccak256("n"));
    }

    function test_verifyAndEnter_ownerCanVerify() public {
        bytes32 commitment = keccak256("owner_c");
        bytes32 nullifierHash = keccak256("owner_n");

        vm.prank(fan);
        MatchTickets(matchAddr).buyTicketZK{value: 0.001 ether}(
            commitment, "X", bytes32(0), MatchTickets.TicketCategory.General, "GEN-E-1"
        );

        uint[2] memory pA; uint[2][2] memory pB; uint[2] memory pC;
        MatchTickets(matchAddr).verifyAndEnter(pA, pB, pC, commitment, nullifierHash);
        assertTrue(MatchTickets(matchAddr).usedNullifiers(nullifierHash));
    }

    function test_zkTicketPurchasedEventEmitted() public {
        bytes32 commitment = keccak256("evt");
        vm.expectEmit(true, false, false, true);
        emit MatchTickets.ZKTicketPurchased(commitment, "GEN-A-1");
        vm.prank(fan);
        MatchTickets(matchAddr).buyTicketZK{value: 0.001 ether}(
            commitment, "Ali", bytes32(0), MatchTickets.TicketCategory.General, "GEN-A-1"
        );
    }

    function test_zkEntryVerifiedEventEmitted() public {
        bytes32 commitment = keccak256("ec");
        bytes32 nullifierHash = keccak256("en");

        vm.prank(fan);
        MatchTickets(matchAddr).buyTicketZK{value: 0.001 ether}(
            commitment, "X", bytes32(0), MatchTickets.TicketCategory.General, "GEN-F-1"
        );

        uint[2] memory pA; uint[2][2] memory pB; uint[2] memory pC;
        vm.expectEmit(true, false, false, false);
        emit MatchTickets.ZKEntryVerified(nullifierHash);
        vm.prank(mod1);
        MatchTickets(matchAddr).verifyAndEnter(pA, pB, pC, commitment, nullifierHash);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  RewardsPool Tests
// ═══════════════════════════════════════════════════════════════════════════════

contract RewardsPoolTest is Test {
    TicketFactory factory;
    RewardsPool rewards;
    address owner = address(this);
    address fan1 = makeAddr("fan1");
    address fan2 = makeAddr("fan2");
    address fan3 = makeAddr("fan3");
    address m1;
    address m2;

    function setUp() public {
        MockVerifier verifier = new MockVerifier();
        factory = new TicketFactory(address(verifier));
        rewards = factory.rewardsPool();

        m1 = factory.createMatch("M1", "V1", "D1", 50, 0.001 ether, 0.005 ether, 0.01 ether);
        m2 = factory.createMatch("M2", "V2", "D2", 50, 0.001 ether, 0.005 ether, 0.01 ether);

        _buy(m1, fan1, "A", "GEN-A-1");
        _buy(m1, fan2, "B", "GEN-A-2");
        _buy(m2, fan3, "C", "GEN-A-1");
        _buy(m2, fan1, "D", "GEN-A-2");
    }

    function _buy(address m, address fan, string memory name, string memory seat) internal {
        string[] memory names = new string[](1);
        bytes32[] memory hashes = new bytes32[](1);
        MatchTickets.TicketCategory[] memory cats = new MatchTickets.TicketCategory[](1);
        string[] memory seats = new string[](1);
        names[0] = name; hashes[0] = bytes32(0);
        cats[0] = MatchTickets.TicketCategory.General; seats[0] = seat;

        vm.deal(fan, 1 ether);
        vm.prank(fan);
        MatchTickets(m).buyTickets{value: 0.001 ether}(names, hashes, cats, seats);
    }

    function test_matchesAutoRegistered() public view {
        assertEq(rewards.getRegisteredMatches().length, 2);
        assertEq(rewards.getRegisteredMatches()[0], m1);
        assertEq(rewards.getRegisteredMatches()[1], m2);
    }

    function test_rewardsPoolAdminIsWalletOwner() public view {
        assertEq(rewards.admin(), owner);
    }

    function test_rewardsPoolFactoryIsFactory() public view {
        assertEq(rewards.factory(), address(factory));
    }

    function test_onlyFactoryCanAddMatch() public {
        vm.prank(fan1);
        vm.expectRevert("Not factory");
        rewards.addMatch(address(0x123));
    }

    function test_getAllBuyers_deduplicates() public view {
        address[] memory buyers = rewards.getAllBuyers();
        assertEq(buyers.length, 3);
    }

    function test_drawWinners() public {
        rewards.drawWinners(42);
        assertTrue(rewards.drawn());
        address[3] memory w = rewards.getWinners();
        for (uint256 i = 0; i < 3; i++) {
            assertTrue(w[i] == fan1 || w[i] == fan2 || w[i] == fan3);
        }
    }

    function test_drawWinners_cannotDrawTwice() public {
        rewards.drawWinners(42);
        vm.expectRevert("Already drawn");
        rewards.drawWinners(99);
    }

    function test_drawWinners_onlyAdmin() public {
        vm.prank(fan1);
        vm.expectRevert("Not admin");
        rewards.drawWinners(42);
    }

    function test_drawWinners_needsMinTickets() public {
        MockVerifier v2 = new MockVerifier();
        TicketFactory f2 = new TicketFactory(address(v2));
        RewardsPool rp2 = f2.rewardsPool();
        address m = f2.createMatch("M3", "V", "D", 50, 0.001 ether, 0.005 ether, 0.01 ether);

        // Only 2 tickets sold — need at least 3
        _buy(m, fan1, "X", "GEN-B-1");
        _buy(m, fan2, "Y", "GEN-B-2");

        vm.expectRevert("Need at least 3 tickets sold");
        rp2.drawWinners(1);
    }

    function test_fullDay3Flow() public {
        assertEq(rewards.getRegisteredMatches().length, 2);
        assertEq(MatchTickets(m1).zkVerifier(), factory.zkVerifier());

        bytes32 commitment = keccak256("full_flow_commit");
        vm.deal(fan1, 5 ether);
        vm.prank(fan1);
        MatchTickets(m1).buyTicketZK{value: 0.01 ether}(
            commitment, "ZKP Fan", bytes32(0), MatchTickets.TicketCategory.VIP, "VIP-A-1"
        );
        assertTrue(MatchTickets(m1).commitments(commitment));

        factory.addMod(makeAddr("mod"));
        bytes32 nullifierHash = keccak256("full_flow_null");
        uint[2] memory pA; uint[2][2] memory pB; uint[2] memory pC;

        vm.prank(makeAddr("mod"));
        MatchTickets(m1).verifyAndEnter(pA, pB, pC, commitment, nullifierHash);
        assertTrue(MatchTickets(m1).usedNullifiers(nullifierHash));

        vm.expectRevert("Nullifier already used");
        vm.prank(makeAddr("mod"));
        MatchTickets(m1).verifyAndEnter(pA, pB, pC, commitment, nullifierHash);

        rewards.drawWinners(12345);
        assertTrue(rewards.drawn());
        address[3] memory w = rewards.getWinners();
        for (uint256 i = 0; i < 3; i++) {
            assertTrue(w[i] == fan1 || w[i] == fan2 || w[i] == fan3);
        }
    }
}
