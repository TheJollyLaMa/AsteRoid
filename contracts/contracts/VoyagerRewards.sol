// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./VoyagerPilots.sol";

contract VoyagerRewards is AccessControl, ERC1155Holder, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;
    bytes32 public constant REWARD_MANAGER_ROLE = keccak256("REWARD_MANAGER_ROLE");
    bytes32 private constant BUNDLE_TYPEHASH = keccak256("RewardBundle(bytes32 gameId,address player,address nftContract,uint256 tokenId,uint256 nftAmount,address paymentToken,uint256 tokenAmount,uint256 nativeAmount,bytes32 awardId,bytes32 claimId,bytes32 recordId,uint256 deadline)");

    struct RewardBundle {
        bytes32 gameId;
        address player;
        address nftContract;
        uint256 tokenId;
        uint256 nftAmount;
        address paymentToken;
        uint256 tokenAmount;
        uint256 nativeAmount;
        bytes32 awardId;
        bytes32 claimId;
        bytes32 recordId;
        uint256 deadline;
    }

    VoyagerPilots public immutable pilots;
    mapping(bytes32 => bool) public usedClaimId;
    mapping(bytes32 => mapping(address => mapping(bytes32 => bool))) public claimedAward;
    mapping(address => mapping(address => mapping(uint256 => bool))) public claimedToken;

    event NativeFunded(address indexed from, uint256 amount);
    event RewardClaimed(bytes32 indexed gameId, bytes32 indexed claimId, address indexed player, bytes32 awardId, bytes32 recordId, address nftContract, uint256 tokenId, uint256 nftAmount, address paymentToken, uint256 tokenAmount, uint256 nativeAmount);
    event AssetsReleased(address indexed to, address indexed asset, uint256 tokenId, uint256 amount, uint8 kind);

    error InvalidReward();
    error InvalidSignature();
    error NotPilot();
    error AlreadyClaimed();
    error Expired();
    error NativeTransferFailed();

    constructor(address admin, VoyagerPilots pilots_) EIP712("DecentVoyager", "1") {
        if (admin == address(0) || address(pilots_).code.length == 0) revert InvalidReward();
        pilots = pilots_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REWARD_MANAGER_ROLE, admin);
    }

    receive() external payable { emit NativeFunded(msg.sender, msg.value); }

    function claim(RewardBundle calldata reward, bytes calldata signature) external whenNotPaused nonReentrant {
        if (reward.player == address(0) || reward.gameId == bytes32(0) || reward.awardId == bytes32(0) ||
            reward.claimId == bytes32(0) || reward.recordId == bytes32(0) ||
            (reward.nftAmount == 0 && reward.tokenAmount == 0 && reward.nativeAmount == 0)) revert InvalidReward();
        if ((reward.nftContract == address(0)) != (reward.nftAmount == 0) ||
            (reward.paymentToken == address(0)) != (reward.tokenAmount == 0) ||
            (reward.nftAmount == 0 && reward.tokenId != 0) ||
            (reward.nftAmount > 0 && reward.nftContract.code.length == 0) ||
            (reward.tokenAmount > 0 && reward.paymentToken.code.length == 0)) revert InvalidReward();
        if (block.timestamp > reward.deadline) revert Expired();
        if (!pilots.isPilot(reward.player)) revert NotPilot();
        if (usedClaimId[reward.claimId] || claimedAward[reward.gameId][reward.player][reward.awardId] ||
            (reward.nftAmount > 0 && claimedToken[reward.player][reward.nftContract][reward.tokenId])) revert AlreadyClaimed();
        address referee = pilots.refereeForGame(reward.gameId);
        bytes32 structHash = keccak256(abi.encode(
            BUNDLE_TYPEHASH, reward.gameId, reward.player, reward.nftContract, reward.tokenId, reward.nftAmount,
            reward.paymentToken, reward.tokenAmount, reward.nativeAmount, reward.awardId, reward.claimId,
            reward.recordId, reward.deadline
        ));
        if (referee == address(0) || ECDSA.recover(_hashTypedDataV4(structHash), signature) != referee) revert InvalidSignature();

        usedClaimId[reward.claimId] = true;
        claimedAward[reward.gameId][reward.player][reward.awardId] = true;
        if (reward.nftAmount > 0) {
            claimedToken[reward.player][reward.nftContract][reward.tokenId] = true;
            IERC1155(reward.nftContract).safeTransferFrom(address(this), reward.player, reward.tokenId, reward.nftAmount, "");
        }
        if (reward.tokenAmount > 0) IERC20(reward.paymentToken).safeTransfer(reward.player, reward.tokenAmount);
        if (reward.nativeAmount > 0) {
            (bool sent,) = reward.player.call{value: reward.nativeAmount}("");
            if (!sent) revert NativeTransferFailed();
        }
        emit RewardClaimed(reward.gameId, reward.claimId, reward.player, reward.awardId, reward.recordId,
            reward.nftContract, reward.tokenId, reward.nftAmount, reward.paymentToken, reward.tokenAmount, reward.nativeAmount);
    }

    function releaseNFT(address nft, uint256 tokenId, uint256 amount, address to)
        external onlyRole(REWARD_MANAGER_ROLE) whenPaused nonReentrant
    {
        if (to == address(0) || amount == 0) revert InvalidReward();
        IERC1155(nft).safeTransferFrom(address(this), to, tokenId, amount, "");
        emit AssetsReleased(to, nft, tokenId, amount, 2);
    }

    function releaseToken(address token, uint256 amount, address to)
        external onlyRole(REWARD_MANAGER_ROLE) whenPaused nonReentrant
    {
        if (to == address(0) || amount == 0) revert InvalidReward();
        IERC20(token).safeTransfer(to, amount);
        emit AssetsReleased(to, token, 0, amount, 1);
    }

    function releaseNative(uint256 amount, address payable to)
        external onlyRole(REWARD_MANAGER_ROLE) whenPaused nonReentrant
    {
        if (to == address(0) || amount == 0) revert InvalidReward();
        (bool sent,) = to.call{value: amount}("");
        if (!sent) revert NativeTransferFailed();
        emit AssetsReleased(to, address(0), 0, amount, 0);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl, ERC1155Holder) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
