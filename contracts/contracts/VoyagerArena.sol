// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./VoyagerPilots.sol";

contract VoyagerArena is AccessControl, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");
    bytes32 private constant SETTLE_TYPEHASH = keccak256("Settle(uint256 roundId,bytes32 survivorsHash,uint256 nonce,uint256 deadline)");
    uint256 public constant MAX_PLAYERS = 5;
    uint256 public constant REFUND_TIMEOUT = 7 days;

    enum RoundState { None, Open, Settled, Cancelled }
    struct Round {
        bytes32 gameId;
        address referee;
        uint8 mode;
        uint8 maxPlayers;
        uint256 entryFee;
        uint256 joinDeadline;
        RoundState state;
        uint256 participantCount;
    }

    VoyagerPilots public immutable pilots;
    IERC20 public immutable usdc;
    uint256 public nextRoundId = 1;
    uint16 public protocolFeeBps;
    address public treasury;
    mapping(uint256 => Round) public rounds;
    mapping(uint256 => address[]) private _players;
    mapping(uint256 => mapping(address => bool)) public hasJoined;
    mapping(uint256 => mapping(address => uint256)) public claimable;
    mapping(uint256 => mapping(uint256 => bool)) public usedNonce;
    mapping(uint256 => uint256) public totalPot;
    uint256 public treasuryAccrued;

    event RoundCreated(uint256 indexed roundId, bytes32 indexed gameId, address indexed referee, uint8 mode, uint256 entryFee, uint8 maxPlayers, uint256 joinDeadline);
    event PlayerJoined(uint256 indexed roundId, address indexed player, uint256 entryFee);
    event RoundSettled(uint256 indexed roundId, bytes32 survivorsHash, uint256 survivorCount, uint256 distributable, uint256 treasuryDust);
    event RefundCredited(uint256 indexed roundId, address indexed player, uint256 amount);
    event Claimed(uint256 indexed roundId, address indexed player, uint256 amount);
    event ExpiredRoundCancelled(uint256 indexed roundId);
    event ProtocolFeeChanged(uint16 oldFeeBps, uint16 newFeeBps);
    event TreasuryChanged(address indexed oldTreasury, address indexed newTreasury);
    event TreasuryClaimed(address indexed treasury, uint256 amount);

    error InvalidAddress();
    error InvalidRound();
    error InvalidRoundState();
    error InvalidRoundConfig();
    error NotPilot();
    error JoinClosed();
    error RoundFull();
    error AlreadyJoined();
    error InvalidSettlement();
    error InvalidSignature();
    error DeadlineExpired();
    error NothingToClaim();
    error TooEarly();
    error FeeTooHigh();

    constructor(address admin, VoyagerPilots pilots_, IERC20 usdc_, address treasury_)
        EIP712("DecentVoyager", "1")
    {
        if (admin == address(0) || address(pilots_) == address(0) || address(usdc_) == address(0) || treasury_ == address(0)) revert InvalidAddress();
        pilots = pilots_;
        usdc = usdc_;
        treasury = treasury_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(TREASURY_ROLE, admin);
    }

    function createRound(bytes32 gameId, uint8 mode, uint256 entryFee, uint8 maxPlayers, uint256 joinDeadline)
        external whenNotPaused returns (uint256 roundId)
    {
        address referee = pilots.refereeForGame(gameId);
        if (gameId == bytes32(0) || referee == address(0) || mode > 1 || entryFee == 0 || maxPlayers == 0 || maxPlayers > MAX_PLAYERS || joinDeadline <= block.timestamp) revert InvalidRoundConfig();
        roundId = nextRoundId++;
        rounds[roundId] = Round(gameId, referee, mode, maxPlayers, entryFee, joinDeadline, RoundState.Open, 0);
        emit RoundCreated(roundId, gameId, referee, mode, entryFee, maxPlayers, joinDeadline);
    }

    function join(uint256 roundId) external whenNotPaused nonReentrant {
        Round storage round = rounds[roundId];
        if (round.state != RoundState.Open) revert InvalidRoundState();
        if (block.timestamp >= round.joinDeadline) revert JoinClosed();
        if (!pilots.isPilot(msg.sender)) revert NotPilot();
        if (hasJoined[roundId][msg.sender]) revert AlreadyJoined();
        if (round.participantCount >= round.maxPlayers) revert RoundFull();
        hasJoined[roundId][msg.sender] = true;
        ++round.participantCount;
        _players[roundId].push(msg.sender);
        totalPot[roundId] += round.entryFee;
        usdc.safeTransferFrom(msg.sender, address(this), round.entryFee);
        emit PlayerJoined(roundId, msg.sender, round.entryFee);
    }

    function settle(uint256 roundId, address[] calldata survivors, uint256 nonce, uint256 deadline, bytes calldata signature)
        external whenNotPaused nonReentrant
    {
        Round storage round = rounds[roundId];
        if (round.state != RoundState.Open) revert InvalidRoundState();
        if (block.timestamp > deadline || deadline > round.joinDeadline + REFUND_TIMEOUT) revert DeadlineExpired();
        if (survivors.length > round.participantCount) revert InvalidSettlement();
        address[] memory sorted = survivors;
        _sort(sorted);
        for (uint256 i; i < sorted.length; ++i) {
            if (!hasJoined[roundId][sorted[i]] || (i != 0 && sorted[i] == sorted[i - 1])) revert InvalidSettlement();
        }
        bytes32 survivorsHash = keccak256(abi.encodePacked(sorted));
        if (usedNonce[roundId][nonce]) revert InvalidSettlement();
        bytes32 structHash = keccak256(abi.encode(SETTLE_TYPEHASH, roundId, survivorsHash, nonce, deadline));
        if (ECDSA.recover(_hashTypedDataV4(structHash), signature) != round.referee) revert InvalidSignature();
        usedNonce[roundId][nonce] = true;
        round.state = RoundState.Settled;
        uint256 pot = totalPot[roundId];
        uint256 fee = (pot * protocolFeeBps) / 10_000;
        uint256 distributable = pot - fee;
        treasuryAccrued += fee;
        if (sorted.length == 0) {
            address[] storage participants = _players[roundId];
            for (uint256 i; i < participants.length; ++i) {
                claimable[roundId][participants[i]] += round.entryFee;
                emit RefundCredited(roundId, participants[i], round.entryFee);
            }
            treasuryAccrued -= fee;
            distributable = pot;
            fee = 0;
        } else {
            uint256 share = distributable / sorted.length;
            uint256 paid = share * sorted.length;
            for (uint256 i; i < sorted.length; ++i) claimable[roundId][sorted[i]] += share;
            fee += distributable - paid;
            treasuryAccrued += distributable - paid;
        }
        emit RoundSettled(roundId, survivorsHash, sorted.length, distributable, fee);
    }

    function cancelExpiredRound(uint256 roundId) external whenNotPaused {
        Round storage round = rounds[roundId];
        if (round.state != RoundState.Open) revert InvalidRoundState();
        if (block.timestamp <= round.joinDeadline + REFUND_TIMEOUT) revert TooEarly();
        round.state = RoundState.Cancelled;
        address[] storage participants = _players[roundId];
        for (uint256 i; i < participants.length; ++i) {
            claimable[roundId][participants[i]] += round.entryFee;
            emit RefundCredited(roundId, participants[i], round.entryFee);
        }
        emit ExpiredRoundCancelled(roundId);
    }

    function claim(uint256 roundId) external nonReentrant {
        uint256 amount = claimable[roundId][msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimable[roundId][msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);
        emit Claimed(roundId, msg.sender, amount);
    }

    function setProtocolFeeBps(uint16 feeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (feeBps > 1000) revert FeeTooHigh();
        emit ProtocolFeeChanged(protocolFeeBps, feeBps);
        protocolFeeBps = feeBps;
    }

    function setTreasury(address treasury_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (treasury_ == address(0)) revert InvalidAddress();
        emit TreasuryChanged(treasury, treasury_);
        treasury = treasury_;
    }

    function claimTreasury() external onlyRole(TREASURY_ROLE) nonReentrant {
        uint256 amount = treasuryAccrued;
        if (amount == 0) revert NothingToClaim();
        treasuryAccrued = 0;
        usdc.safeTransfer(treasury, amount);
        emit TreasuryClaimed(treasury, amount);
    }

    function players(uint256 roundId) external view returns (address[] memory) { return _players[roundId]; }
    function settlementDigest(uint256 roundId, address[] calldata survivors, uint256 nonce, uint256 deadline) external view returns (bytes32) {
        if (survivors.length > MAX_PLAYERS) revert InvalidSettlement();
        address[] memory sorted = survivors;
        _sort(sorted);
        bytes32 survivorsHash = keccak256(abi.encodePacked(sorted));
        return _hashTypedDataV4(keccak256(abi.encode(SETTLE_TYPEHASH, roundId, survivorsHash, nonce, deadline)));
    }

    function settlementHash(address[] calldata survivors) external pure returns (bytes32) {
        if (survivors.length > MAX_PLAYERS) revert InvalidSettlement();
        address[] memory sorted = survivors;
        _sort(sorted);
        return keccak256(abi.encodePacked(sorted));
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    function _sort(address[] memory values) private pure {
        for (uint256 i = 1; i < values.length; ++i) {
            address value = values[i];
            uint256 j = i;
            while (j > 0 && uint160(values[j - 1]) > uint160(value)) {
                values[j] = values[j - 1];
                unchecked { --j; }
            }
            values[j] = value;
        }
    }
}
