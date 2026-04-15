// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MatchTickets} from "./MatchTickets.sol";
import {RewardsPool} from "./RewardsPool.sol";

// FIX [toggleMatchActive enforcement]: factory needs to call setPaused on MatchTickets.
// Interface is additive — no existing interface changed.
interface IMatchTicketsPausable {
    function setPaused(bool _paused) external;
}

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
    address public zkVerifier; // Groth16Verifier — shared by all matches
    RewardsPool public rewardsPool; // Deployed in constructor — auto-registered
    address[] public matchAddresses;
    mapping(address => MatchInfo) public matchInfo;

    mapping(address => bool) public mods;
    address[] private modList;

    event MatchCreated(
        address indexed matchContract,
        string name,
        string venue,
        uint256 generalPrice,
        uint256 enclosurePrice,
        uint256 vipPrice,
        uint256 totalTickets
    );
    event MatchToggled(address indexed matchContract, bool active);
    event ModAdded(address indexed mod);
    event ModRemoved(address indexed mod);
    // FIX [no ownership transfer]: new events — no existing event changed.
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ZkVerifierUpdated(address indexed previousVerifier, address indexed newVerifier);

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
    // Signatures unchanged.

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
    // Signatures unchanged.

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
            zkVerifier,
            _name,
            _venue,
            _dateString,
            _totalTickets,
            _generalPrice,
            _enclosurePrice,
            _vipPrice
        );

        address addr = address(mt);

        rewardsPool.addMatch(addr);

        matchAddresses.push(addr);
        matchInfo[addr] = MatchInfo({
            name: _name,
            venue: _venue,
            dateString: _dateString,
            totalTickets: _totalTickets,
            generalPrice: _generalPrice,
            enclosurePrice: _enclosurePrice,
            vipPrice: _vipPrice,
            contractAddr: addr,
            active: true
        });

        emit MatchCreated(addr, _name, _venue, _generalPrice, _enclosurePrice, _vipPrice, _totalTickets);
        return addr;
    }

    // FIX [toggleMatchActive enforcement]: now calls setPaused on the MatchTickets
    // contract so the pause is actually enforced on-chain.
    // Signature UNCHANGED — toggleMatchActive(address) stays the same.

    function toggleMatchActive(address matchAddr) external onlyOwner {
        require(matchInfo[matchAddr].contractAddr != address(0), "Match not found");
        matchInfo[matchAddr].active = !matchInfo[matchAddr].active;
        // Push the pause state into the MatchTickets contract itself.
        IMatchTicketsPausable(matchAddr).setPaused(!matchInfo[matchAddr].active);
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

    // ── New: ownership transfer ───────────────────────────────────────────────
    // FIX [no ownership transfer]: NEW function — no existing signature changed.
    // Allows key rotation without redeployment. Two-step (transfer → accept)
    // pattern prevents accidentally locking to a wrong address.

    address public pendingOwner;

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        pendingOwner = newOwner;
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Not pending owner");
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    // ── New: ZK verifier update ───────────────────────────────────────────────
    // FIX [no zkVerifier update]: NEW function — no existing signature changed.
    // Only affects newly created matches; existing matches keep their verifier.
    // To migrate an existing match, redeploy that match.

    function updateZkVerifier(address newVerifier) external onlyOwner {
        require(newVerifier != address(0), "Zero address");
        emit ZkVerifierUpdated(zkVerifier, newVerifier);
        zkVerifier = newVerifier;
    }
}
