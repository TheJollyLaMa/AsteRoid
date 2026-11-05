// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./VoyagerPilots.sol";

contract VoyagerPrizes is AccessControl, ERC1155Holder, Pausable, ReentrancyGuard, EIP712 {
    bytes32 public constant PRIZE_MANAGER_ROLE = keccak256("PRIZE_MANAGER_ROLE");
    bytes32 private constant PRIZE_TYPEHASH = keccak256("PrizeVoucher(address player,address nftContract,uint256 tokenId,uint8 tier,bytes32 runId,uint256 deadline)");

    struct Voucher { address player; address nftContract; uint256 tokenId; uint8 tier; bytes32 runId; uint256 deadline; }
    VoyagerPilots public immutable pilots;
    mapping(bytes32 => bool) public usedRunId;
    mapping(address => mapping(uint256 => bool)) public claimedToken;

    event PrizeClaimed(bytes32 indexed gameId, bytes32 indexed runId, address indexed player, address nftContract, uint256 tokenId, uint8 tier);
    event PrizeReleased(address indexed to, address indexed nftContract, uint256 indexed tokenId, uint256 amount);

    error InvalidAddress();
    error InvalidVoucher();
    error NotPilot();
    error VoucherExpired();
    error InvalidSignature();
    error AlreadyClaimed();

    constructor(address admin, VoyagerPilots pilots_) EIP712("DecentVoyager", "1") {
        if (admin == address(0) || address(pilots_) == address(0)) revert InvalidAddress();
        pilots = pilots_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PRIZE_MANAGER_ROLE, admin);
    }

    function claim(bytes32 gameId, Voucher calldata voucher, bytes calldata signature) external whenNotPaused nonReentrant {
        if (voucher.player == address(0) || voucher.nftContract == address(0) || voucher.runId == bytes32(0) || voucher.tier == 0 || voucher.tier > 2 || voucher.nftContract.code.length == 0) revert InvalidVoucher();
        if (block.timestamp > voucher.deadline) revert VoucherExpired();
        if (!pilots.isPilot(voucher.player)) revert NotPilot();
        if (usedRunId[voucher.runId] || claimedToken[voucher.player][voucher.tokenId]) revert AlreadyClaimed();
        address referee = pilots.refereeForGame(gameId);
        if (referee == address(0)) revert InvalidVoucher();
        bytes32 structHash = keccak256(abi.encode(PRIZE_TYPEHASH, voucher.player, voucher.nftContract, voucher.tokenId, voucher.tier, voucher.runId, voucher.deadline));
        if (ECDSA.recover(_hashTypedDataV4(structHash), signature) != referee) revert InvalidSignature();
        usedRunId[voucher.runId] = true;
        claimedToken[voucher.player][voucher.tokenId] = true;
        IERC1155(voucher.nftContract).safeTransferFrom(address(this), voucher.player, voucher.tokenId, 1, "");
        emit PrizeClaimed(gameId, voucher.runId, voucher.player, voucher.nftContract, voucher.tokenId, voucher.tier);
    }

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl, ERC1155Holder) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function inventory(address nftContract, uint256 tokenId) external view returns (uint256) {
        return IERC1155(nftContract).balanceOf(address(this), tokenId);
    }

    function adminRelease(address to, address nftContract, uint256 tokenId, uint256 amount)
        external onlyRole(PRIZE_MANAGER_ROLE) whenNotPaused nonReentrant
    {
        if (to == address(0) || nftContract == address(0) || amount == 0) revert InvalidAddress();
        IERC1155(nftContract).safeTransferFrom(address(this), to, tokenId, amount, "");
        emit PrizeReleased(to, nftContract, tokenId, amount);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }
}
