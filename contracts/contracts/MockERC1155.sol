// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockERC1155 is ERC1155, Ownable {
    constructor(address owner) ERC1155("ipfs://mock/{id}.json") Ownable(owner) {}
    function mint(address to, uint256 id, uint256 amount) external onlyOwner { _mint(to, id, amount, ""); }
}
