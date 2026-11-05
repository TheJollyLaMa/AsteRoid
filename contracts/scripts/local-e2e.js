const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

async function deploy(name, args) {
  const contract = await (await ethers.getContractFactory(name)).deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

async function main() {
  const [admin, referee, p1, p2, p3, treasury] = await ethers.getSigners();
  const gameId = ethers.id("decent-voyager-local-e2e");
  const pilots = await deploy("VoyagerPilots", [admin.address]);
  const usdc = await deploy("MockUSDC", [admin.address]);
  const arena = await deploy("VoyagerArena", [admin.address, pilots.target, usdc.target, treasury.address]);
  const prizes = await deploy("VoyagerPrizes", [admin.address, pilots.target]);
  const stamps = await deploy("VoyagerStamps", [admin.address, treasury.address, 500, pilots.target]);
  const nft = await deploy("MockERC1155", [admin.address]);
  await pilots.registerGame(gameId, referee.address);
  await pilots.setPilots([p1.address, p2.address, p3.address], true);

  const usdcUnit = 1_000_000n;
  for (const player of [p1, p2, p3]) {
    await usdc.mint(player.address, 100n * usdcUnit);
    await usdc.connect(player).approve(arena.target, 100n * usdcUnit);
  }
  const latest = await ethers.provider.getBlock("latest");
  const joinDeadline = latest.timestamp + 3600;
  const fee = 10n * usdcUnit;
  await arena.createRound(gameId, 0, fee, 3, joinDeadline);
  const roundId = await arena.nextRoundId() - 1n;
  for (const player of [p1, p2, p3]) await arena.connect(player).join(roundId);
  const survivors = [p1.address, p3.address].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1);
  const survivorsHash = ethers.solidityPackedKeccak256(["address[]"], [survivors]);
  const deadline = latest.timestamp + 1800;
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const settleSignature = await referee.signTypedData(
    { name: "DecentVoyager", version: "1", chainId, verifyingContract: arena.target },
    { Settle: [
      { name: "roundId", type: "uint256" }, { name: "survivorsHash", type: "bytes32" },
      { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }
    ] },
    { roundId, survivorsHash, nonce: 1, deadline }
  );
  await arena.settle(roundId, survivors, 1, deadline, settleSignature);
  const payout = await arena.claimable(roundId, p1.address);
  assert.equal(payout, 15n * usdcUnit);
  const beforePayout = await usdc.balanceOf(p1.address);
  for (const player of [p1, p3]) await arena.connect(player).claim(roundId);
  assert.equal((await usdc.balanceOf(p1.address)) - beforePayout, payout);

  const runId = ethers.id("local-e2e-prize-run");
  await nft.mint(prizes.target, 70, 1);
  const prizeVoucher = { player: p1.address, nftContract: nft.target, tokenId: 70, tier: 1, runId, deadline };
  const prizeSignature = await referee.signTypedData(
    { name: "DecentVoyager", version: "1", chainId, verifyingContract: prizes.target },
    { PrizeVoucher: [
      { name: "player", type: "address" }, { name: "nftContract", type: "address" },
      { name: "tokenId", type: "uint256" }, { name: "tier", type: "uint8" },
      { name: "runId", type: "bytes32" }, { name: "deadline", type: "uint256" }
    ] }, prizeVoucher
  );
  await prizes.connect(p1).claim(gameId, prizeVoucher, prizeSignature);
  assert.equal(await nft.balanceOf(p1.address, 70), 1n);

  const stampVoucher = { player: p1.address, recordId: ethers.id("local-e2e-level-record"), level: 1, difficulty: 2, metadataURI: "ipfs://local-e2e/stamp", deadline };
  const stampSignature = await referee.signTypedData(
    { name: "DecentVoyager", version: "1", chainId, verifyingContract: stamps.target },
    { StampVoucher: [
      { name: "player", type: "address" }, { name: "recordId", type: "bytes32" },
      { name: "level", type: "uint16" }, { name: "difficulty", type: "uint8" },
      { name: "metadataURI", type: "string" }, { name: "deadline", type: "uint256" }
    ] }, stampVoucher
  );
  await stamps.connect(p1).mintWithVoucher(gameId, stampVoucher, stampSignature);
  assert.equal(await stamps.balanceOf(p1.address, 1), 1n);
  console.log(JSON.stringify({
    result: "local end-to-end passed",
    roundId: roundId.toString(),
    paidEach: payout.toString(),
    prizeTokenId: 70,
    prizeBalance: (await nft.balanceOf(p1.address, 70)).toString(),
    stampTokenId: (await stamps.tokenForRecord(stampVoucher.recordId)).toString(),
    stampBalance: (await stamps.balanceOf(p1.address, 1)).toString()
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
