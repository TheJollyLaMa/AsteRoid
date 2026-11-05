// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./VoyagerPilots.sol";

contract VoyagerStamps is ERC1155, ERC2981, AccessControl, Pausable, ReentrancyGuard, EIP712 {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 private constant STAMP_TYPEHASH = keccak256("StampVoucher(address player,bytes32 recordId,uint16 level,uint8 difficulty,string metadataURI,uint256 deadline)");
    uint256 public constant MAX_BATCH = 5;

    struct StampVoucher { address player; bytes32 recordId; uint16 level; uint8 difficulty; string metadataURI; uint256 deadline; }
    VoyagerPilots public immutable pilots;
    uint256 public nextTokenId = 1;
    mapping(bytes32 => bool) public usedRecordId;
    mapping(bytes32 => uint256) public tokenForRecord;
    mapping(uint256 => string) private _tokenURIs;

    event StampMinted(bytes32 indexed gameId, address indexed player, bytes32 indexed recordId, uint256 tokenId, uint16 level, uint8 difficulty, string metadataURI);

    error InvalidAddress();
    error InvalidVoucher();
    error NotPilot();
    error VoucherExpired();
    error InvalidSignature();
    error AlreadyMinted();
    error BatchTooLarge();

    constructor(address admin, address royaltyReceiver, uint96 royaltyFeeBps, VoyagerPilots pilots_)
        ERC1155("") EIP712("DecentVoyager", "1")
    {
        if (admin == address(0) || royaltyReceiver == address(0) || address(pilots_) == address(0)) revert InvalidAddress();
        pilots = pilots_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _setDefaultRoyalty(royaltyReceiver, royaltyFeeBps);
    }

    function mintWithVoucher(bytes32 gameId, StampVoucher calldata voucher, bytes calldata signature) external whenNotPaused nonReentrant returns (uint256 tokenId) {
        if (msg.sender != voucher.player) revert InvalidAddress();
        tokenId = _verifyAndMint(gameId, voucher, signature);
    }

    function mintBatch(address to, bytes32[] calldata recordIds, uint16[] calldata levels, uint8[] calldata difficulties, string[] calldata metadataURIs)
        external onlyRole(MINTER_ROLE) whenNotPaused returns (uint256[] memory tokenIds)
    {
        uint256 length = recordIds.length;
        if (length == 0 || length > MAX_BATCH || levels.length != length || difficulties.length != length || metadataURIs.length != length) revert BatchTooLarge();
        if (to == address(0)) revert InvalidAddress();
        if (!pilots.isPilot(to)) revert NotPilot();
        tokenIds = new uint256[](length);
        for (uint256 i; i < length; ++i) {
            if (recordIds[i] == bytes32(0) || levels[i] == 0 || difficulties[i] > 2 || bytes(metadataURIs[i]).length == 0 || usedRecordId[recordIds[i]]) revert InvalidVoucher();
            usedRecordId[recordIds[i]] = true;
            uint256 tokenId = nextTokenId++;
            tokenForRecord[recordIds[i]] = tokenId;
            _tokenURIs[tokenId] = metadataURIs[i];
            tokenIds[i] = tokenId;
            _mint(to, tokenId, 1, "");
            emit StampMinted(bytes32(0), to, recordIds[i], tokenId, levels[i], difficulties[i], metadataURIs[i]);
        }
    }

    function uri(uint256 tokenId) public view override returns (string memory) { return _tokenURIs[tokenId]; }
    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, ERC2981, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    function _verifyAndMint(bytes32 gameId, StampVoucher calldata voucher, bytes calldata signature) private returns (uint256 tokenId) {
        if (voucher.player == address(0) || voucher.recordId == bytes32(0) || voucher.level == 0 || voucher.difficulty > 2 || bytes(voucher.metadataURI).length == 0) revert InvalidVoucher();
        if (block.timestamp > voucher.deadline) revert VoucherExpired();
        if (!pilots.isPilot(voucher.player)) revert NotPilot();
        if (usedRecordId[voucher.recordId]) revert AlreadyMinted();
        address referee = pilots.refereeForGame(gameId);
        if (referee == address(0)) revert InvalidVoucher();
        bytes32 structHash = keccak256(abi.encode(STAMP_TYPEHASH, voucher.player, voucher.recordId, voucher.level, voucher.difficulty, keccak256(bytes(voucher.metadataURI)), voucher.deadline));
        if (ECDSA.recover(_hashTypedDataV4(structHash), signature) != referee) revert InvalidSignature();
        usedRecordId[voucher.recordId] = true;
        tokenId = nextTokenId++;
        tokenForRecord[voucher.recordId] = tokenId;
        _tokenURIs[tokenId] = voucher.metadataURI;
        _mint(voucher.player, tokenId, 1, "");
        emit StampMinted(gameId, voucher.player, voucher.recordId, tokenId, voucher.level, voucher.difficulty, voucher.metadataURI);
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal override whenNotPaused
    {
        super._update(from, to, ids, values);
    }
}
