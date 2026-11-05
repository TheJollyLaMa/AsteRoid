// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract VoyagerPilots is AccessControl, Pausable {
    bytes32 public constant PILOT_MANAGER_ROLE = keccak256("PILOT_MANAGER_ROLE");
    bytes32 public constant GAME_MANAGER_ROLE = keccak256("GAME_MANAGER_ROLE");

    uint256 public constant MAX_PILOT_BATCH = 5;

    mapping(address => bool) private _pilots;
    mapping(bytes32 => address) public refereeForGame;

    event PilotStatusChanged(address indexed pilot, bool isPilot);
    event GameRegistered(bytes32 indexed gameId, address indexed referee, address indexed registrar);

    error InvalidPilot();
    error InvalidGame();

    constructor(address admin) {
        if (admin == address(0)) revert InvalidPilot();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PILOT_MANAGER_ROLE, admin);
        _grantRole(GAME_MANAGER_ROLE, admin);
    }

    function setPilots(address[] calldata accounts, bool enabled) external onlyRole(PILOT_MANAGER_ROLE) whenNotPaused {
        if (accounts.length == 0 || accounts.length > MAX_PILOT_BATCH) revert InvalidPilot();
        for (uint256 i; i < accounts.length; ++i) {
            if (accounts[i] == address(0)) revert InvalidPilot();
            _pilots[accounts[i]] = enabled;
            emit PilotStatusChanged(accounts[i], enabled);
        }
    }

    function isPilot(address account) external view returns (bool) {
        return _pilots[account];
    }

    function registerGame(bytes32 gameId, address referee) external onlyRole(GAME_MANAGER_ROLE) whenNotPaused {
        if (gameId == bytes32(0) || referee == address(0)) revert InvalidGame();
        refereeForGame[gameId] = referee;
        emit GameRegistered(gameId, referee, msg.sender);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }
}
