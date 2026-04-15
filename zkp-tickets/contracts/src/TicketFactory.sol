// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MatchTickets} from "./MatchTickets.sol";
import {RewardsPool} from "./RewardsPool.sol";

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
