const { expect } = require("chai");
const { ethers } = require("hardhat");
const path = require("path");

// Proves the referee server's EIP-712 signatures verify on the deployed contracts.
const { makeVoucherService } = require(path.join(__dirname, "../../server/src/vouchers.js"));

const GAME_ID = ethers.id("decent-voyager-server-xcheck");
const USDC = 1_000_000n;

describe("server referee signatures verify on-chain", function () {
  it("settles, claims a prize and mints a stamp with server-signed payloads", async function () {
    const [admin, host, p1, p2, p3, treasury] = await ethers.getSigners();
    const referee = ethers.Wallet.createRandom();
    const pilots = await (await ethers.getContractFactory("VoyagerPilots")).deploy(admin.address);
    await pilots.registerGame(GAME_ID, referee.address);
    await pilots.setPilots([p1.address, p2.address, p3.address], true);
    const usdc = await (await ethers.getContractFactory("MockUSDC")).deploy(admin.address);
    const arena = await (await ethers.getContractFactory("VoyagerArena")).deploy(admin.address, pilots.target, usdc.target, treasury.address);
    const prizes = await (await ethers.getContractFactory("VoyagerPrizes")).deploy(admin.address, pilots.target);
    const nft = await (await ethers.getContractFactory("MockERC1155")).deploy(admin.address);
    const stamps = await (await ethers.getContractFactory("VoyagerStamps")).deploy(admin.address, treasury.address, 500, pilots.target);
    const { chainId } = await ethers.provider.getNetwork();
    const svc = makeVoucherService({
      privateKey: referee.privateKey, chainId, arenaAddress: arena.target,
      stampsAddress: stamps.target, prizesAddress: prizes.target, nftAddress: nft.target
    });
    const deadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;

    for (const p of [p1, p2, p3]) {
      await usdc.mint(p.address, 100n * USDC);
      await usdc.connect(p).approve(arena.target, ethers.MaxUint256);
    }
    await arena.connect(host).createRound(GAME_ID, 1, 10n * USDC, 5, deadline);
    const roundId = (await arena.nextRoundId()) - 1n;
    for (const p of [p1, p2, p3]) await arena.connect(p).join(roundId);
    const settle = await svc.settle({ roundId, survivors: [p3.address, p1.address], nonce: 1, deadline });
    await arena.settle(roundId, settle.survivors, 1, deadline, settle.signature);
    await arena.connect(p1).claim(roundId);
    expect(await usdc.balanceOf(p1.address)).to.equal(105n * USDC);

    await nft.mint(prizes.target, 70, 1);
    const prize = await svc.prize({ player: p1.address, tokenId: 70, tier: 1, runId: "run-xcheck", deadline });
    await prizes.connect(p1).claim(GAME_ID, prize.value, prize.signature);
    expect(await nft.balanceOf(p1.address, 70)).to.equal(1);

    const stamp = await svc.stamp({ player: p2.address, record: { id: "rec-xcheck", level: 9, difficulty: "ace" }, metadataURI: "ipfs://x", deadline });
    await stamps.connect(p2).mintWithVoucher(GAME_ID, stamp.value, stamp.signature);
    expect(await stamps.uri(1)).to.equal("ipfs://x");
  });
});
