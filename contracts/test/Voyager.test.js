const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const GAME_ID = ethers.id("decent-voyager");
const USDC = 1_000_000n;

async function deployFixture() {
  const [admin, referee, host, p1, p2, p3, p4, p5, stranger, treasury] = await ethers.getSigners();
  const Pilots = await ethers.getContractFactory("VoyagerPilots");
  const pilots = await Pilots.deploy(admin.address);
  await pilots.registerGame(GAME_ID, referee.address);
  await pilots.setPilots([p1.address, p2.address, p3.address, p4.address, p5.address], true);

  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy(admin.address);
  const Arena = await ethers.getContractFactory("VoyagerArena");
  const arena = await Arena.deploy(admin.address, pilots.target, usdc.target, treasury.address);
  for (const player of [p1, p2, p3, p4, p5]) {
    await usdc.mint(player.address, 10_000n * USDC);
    await usdc.connect(player).approve(arena.target, ethers.MaxUint256);
  }
  const Prizes = await ethers.getContractFactory("VoyagerPrizes");
  const prizes = await Prizes.deploy(admin.address, pilots.target);
  const Mock1155 = await ethers.getContractFactory("MockERC1155");
  const nft = await Mock1155.deploy(admin.address);
  const Stamps = await ethers.getContractFactory("VoyagerStamps");
  const stamps = await Stamps.deploy(admin.address, treasury.address, 500, pilots.target);
  return { admin, referee, host, p1, p2, p3, p4, p5, stranger, treasury, pilots, usdc, arena, prizes, nft, stamps };
}

async function future(seconds = 3600) {
  const block = await ethers.provider.getBlock("latest");
  return block.timestamp + seconds;
}

async function createRound(f, { fee = 10n * USDC, maxPlayers = 5, mode = 0, deadline } = {}) {
  deadline ??= await future();
  const tx = await f.arena.connect(f.host).createRound(GAME_ID, mode, fee, maxPlayers, deadline);
  await tx.wait();
  return { roundId: await f.arena.nextRoundId() - 1n, deadline, fee };
}

async function joinPlayers(f, roundId, players) {
  for (const player of players) await f.arena.connect(player).join(roundId);
}

async function settleSignature(f, roundId, survivors, nonce = 1n, deadline) {
  deadline ??= await future();
  const networkInfo = await ethers.provider.getNetwork();
  const sorted = [...survivors].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1);
  const survivorsHash = ethers.solidityPackedKeccak256(["address[]"], [sorted]);
  const signature = await f.referee.signTypedData(
    { name: "DecentVoyager", version: "1", chainId: networkInfo.chainId, verifyingContract: f.arena.target },
    { Settle: [
      { name: "roundId", type: "uint256" },
      { name: "survivorsHash", type: "bytes32" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" }
    ] },
    { roundId, survivorsHash, nonce, deadline }
  );
  return { signature, deadline, survivorsHash };
}

async function voucherSignature(f, contract, signer, typeName, fields, value) {
  const networkInfo = await ethers.provider.getNetwork();
  const signature = await signer.signTypedData(
    { name: "DecentVoyager", version: "1", chainId: networkInfo.chainId, verifyingContract: contract.target },
    { [typeName]: fields }, value
  );
  return signature;
}

const prizeFields = [
  { name: "player", type: "address" }, { name: "nftContract", type: "address" },
  { name: "tokenId", type: "uint256" }, { name: "tier", type: "uint8" },
  { name: "runId", type: "bytes32" }, { name: "deadline", type: "uint256" }
];
const stampFields = [
  { name: "player", type: "address" }, { name: "recordId", type: "bytes32" },
  { name: "level", type: "uint16" }, { name: "difficulty", type: "uint8" },
  { name: "metadataURI", type: "string" }, { name: "deadline", type: "uint256" }
];

describe("VoyagerPilots", function () {
  it("sets pilots and registers or updates referees under distinct roles", async function () {
    const f = await deployFixture();
    expect(await f.pilots.isPilot(f.p1.address)).to.equal(true);
    expect(await f.pilots.isPilot(f.stranger.address)).to.equal(false);
    await expect(f.pilots.connect(f.stranger).setPilots([f.stranger.address], true)).to.be.reverted;
    await expect(f.pilots.connect(f.stranger).registerGame(ethers.id("other"), f.stranger.address)).to.be.reverted;
    await expect(f.pilots.registerGame(ethers.ZeroHash, f.referee.address)).to.be.revertedWithCustomError(f.pilots, "InvalidGame");
    await expect(f.pilots.registerGame(ethers.id("other"), ethers.ZeroAddress)).to.be.revertedWithCustomError(f.pilots, "InvalidGame");
    await f.pilots.registerGame(GAME_ID, f.p2.address);
    expect(await f.pilots.refereeForGame(GAME_ID)).to.equal(f.p2.address);
    await f.pilots.setPilots([f.p1.address], false);
    expect(await f.pilots.isPilot(f.p1.address)).to.equal(false);
  });

  it("pauses role-managed pilot and game changes", async function () {
    const f = await deployFixture();
    await f.pilots.pause();
    await expect(f.pilots.setPilots([f.stranger.address], true)).to.be.revertedWithCustomError(f.pilots, "EnforcedPause");
    await expect(f.pilots.registerGame(ethers.id("x"), f.referee.address)).to.be.revertedWithCustomError(f.pilots, "EnforcedPause");
    await f.pilots.unpause();
    await f.pilots.setPilots([f.stranger.address], true);
    expect(await f.pilots.isPilot(f.stranger.address)).to.equal(true);
  });
});

describe("VoyagerArena", function () {
  it("creates reusable rounds, accepts pilot joins, and pays signed survivors", async function () {
    const f = await deployFixture();
    const round = await createRound(f, { fee: 10n * USDC, maxPlayers: 3, mode: 1 });
    expect((await f.arena.rounds(round.roundId)).state).to.equal(1);
    await joinPlayers(f, round.roundId, [f.p1, f.p2, f.p3]);
    const survivors = [f.p3.address, f.p1.address];
    const signed = await settleSignature(f, round.roundId, survivors);
    await expect(f.arena.settle(round.roundId, survivors, 1, signed.deadline, signed.signature))
      .to.emit(f.arena, "RoundSettled").withArgs(round.roundId, signed.survivorsHash, 2, 30n * USDC, 0);
    expect(await f.arena.claimable(round.roundId, f.p1.address)).to.equal(15n * USDC);
    expect(await f.arena.claimable(round.roundId, f.p2.address)).to.equal(0);
    await f.arena.connect(f.p1).claim(round.roundId);
    expect(await f.usdc.balanceOf(f.p1.address)).to.equal(10_005n * USDC);
    await expect(f.arena.connect(f.p1).claim(round.roundId)).to.be.revertedWithCustomError(f.arena, "NothingToClaim");
  });

  it("rejects unregistered games, invalid configuration, non-pilots, duplicate joins, and over-capacity", async function () {
    const f = await deployFixture();
    await expect(f.arena.createRound(ethers.id("missing"), 0, USDC, 2, await future())).to.be.revertedWithCustomError(f.arena, "InvalidRoundConfig");
    await expect(f.arena.createRound(GAME_ID, 2, USDC, 2, await future())).to.be.revertedWithCustomError(f.arena, "InvalidRoundConfig");
    await expect(f.arena.createRound(GAME_ID, 0, 0, 2, await future())).to.be.revertedWithCustomError(f.arena, "InvalidRoundConfig");
    await expect(f.arena.createRound(GAME_ID, 0, USDC, 6, await future())).to.be.revertedWithCustomError(f.arena, "InvalidRoundConfig");
    const round = await createRound(f, { maxPlayers: 2 });
    await expect(f.arena.connect(f.stranger).join(round.roundId)).to.be.revertedWithCustomError(f.arena, "NotPilot");
    await f.arena.connect(f.p1).join(round.roundId);
    await expect(f.arena.connect(f.p1).join(round.roundId)).to.be.revertedWithCustomError(f.arena, "AlreadyJoined");
    await f.arena.connect(f.p2).join(round.roundId);
    await expect(f.arena.connect(f.p3).join(round.roundId)).to.be.revertedWithCustomError(f.arena, "RoundFull");
  });

  it("validates referee signature, deadline, survivors, nonce replay, and double settlement", async function () {
    const f = await deployFixture();
    const round = await createRound(f, { maxPlayers: 2 });
    await joinPlayers(f, round.roundId, [f.p1, f.p2]);
    const signed = await settleSignature(f, round.roundId, [f.p1.address]);
    await f.pilots.registerGame(GAME_ID, f.p2.address);
    const expired = await settleSignature(f, round.roundId, [f.p1.address], 8, 1);
    await expect(f.arena.settle(round.roundId, [f.p1.address], 8, expired.deadline, expired.signature))
      .to.be.revertedWithCustomError(f.arena, "DeadlineExpired");
    const tooLate = await settleSignature(f, round.roundId, [f.p1.address], 9, round.deadline + 7 * 24 * 60 * 60 + 1);
    await expect(f.arena.settle(round.roundId, [f.p1.address], 9, tooLate.deadline, tooLate.signature))
      .to.be.revertedWithCustomError(f.arena, "DeadlineExpired");
    await expect(f.arena.settle(round.roundId, [f.p1.address], 1, signed.deadline, await f.stranger.signMessage("bad")))
      .to.be.revertedWithCustomError(f.arena, "InvalidSignature");
    await expect(f.arena.settle(round.roundId, [f.stranger.address], 1, signed.deadline, signed.signature))
      .to.be.revertedWithCustomError(f.arena, "InvalidSettlement");
    await expect(f.arena.settle(round.roundId, [f.p1.address, f.p1.address], 1, signed.deadline, signed.signature))
      .to.be.revertedWithCustomError(f.arena, "InvalidSettlement");
    await expect(f.arena.settle(round.roundId, [f.p1.address], 1, signed.deadline, signed.signature))
      .not.to.be.reverted;
    await expect(f.arena.settle(round.roundId, [f.p1.address], 1, signed.deadline, signed.signature))
      .to.be.revertedWithCustomError(f.arena, "InvalidRoundState");
  });

  it("pays full refunds when nobody survives and allows claims while paused", async function () {
    const f = await deployFixture();
    const round = await createRound(f, { fee: 3n * USDC, maxPlayers: 2 });
    await joinPlayers(f, round.roundId, [f.p1, f.p2]);
    const signed = await settleSignature(f, round.roundId, [], 7);
    await f.arena.settle(round.roundId, [], 7, signed.deadline, signed.signature);
    expect(await f.arena.claimable(round.roundId, f.p1.address)).to.equal(3n * USDC);
    await f.arena.pause();
    await f.arena.connect(f.p1).claim(round.roundId);
    await expect(f.arena.connect(f.p3).join(round.roundId)).to.be.revertedWithCustomError(f.arena, "EnforcedPause");
  });

  it("credits rounding dust to the treasury and permits only its role to withdraw", async function () {
    const f = await deployFixture();
    const round = await createRound(f, { fee: 101n, maxPlayers: 3 });
    await joinPlayers(f, round.roundId, [f.p1, f.p2, f.p3]);
    const signed = await settleSignature(f, round.roundId, [f.p1.address, f.p2.address], 3);
    await f.arena.settle(round.roundId, [f.p1.address, f.p2.address], 3, signed.deadline, signed.signature);
    expect(await f.arena.claimable(round.roundId, f.p1.address)).to.equal(151);
    expect(await f.arena.treasuryAccrued()).to.equal(1);
    await expect(f.arena.connect(f.stranger).claimTreasury()).to.be.reverted;
    await f.arena.claimTreasury();
    expect(await f.usdc.balanceOf(f.treasury.address)).to.equal(1);
  });

  it("cancels timed-out unsettled rounds and refunds every participant", async function () {
    const f = await deployFixture();
    const deadline = await future(100);
    const round = await createRound(f, { fee: 12n, deadline });
    await joinPlayers(f, round.roundId, [f.p1, f.p2]);
    await expect(f.arena.cancelExpiredRound(round.roundId)).to.be.revertedWithCustomError(f.arena, "TooEarly");
    await network.provider.send("evm_setNextBlockTimestamp", [deadline + 7 * 24 * 60 * 60 + 1]);
    await f.arena.cancelExpiredRound(round.roundId);
    expect(await f.arena.claimable(round.roundId, f.p1.address)).to.equal(12);
    expect((await f.arena.rounds(round.roundId)).state).to.equal(3);
  });

  it("enforces join deadlines, fees, treasury and pause controls", async function () {
    const f = await deployFixture();
    const deadline = await future(100);
    const round = await createRound(f, { deadline });
    await f.arena.pause();
    await expect(f.arena.createRound(GAME_ID, 0, USDC, 1, await future())).to.be.revertedWithCustomError(f.arena, "EnforcedPause");
    await expect(f.arena.connect(f.p1).join(round.roundId)).to.be.revertedWithCustomError(f.arena, "EnforcedPause");
    await f.arena.unpause();
    await network.provider.send("evm_setNextBlockTimestamp", [deadline]);
    await expect(f.arena.connect(f.p1).join(round.roundId)).to.be.revertedWithCustomError(f.arena, "JoinClosed");
    await expect(f.arena.setProtocolFeeBps(1001)).to.be.revertedWithCustomError(f.arena, "FeeTooHigh");
    await f.arena.setProtocolFeeBps(1000);
    await expect(f.arena.setTreasury(ethers.ZeroAddress)).to.be.revertedWithCustomError(f.arena, "InvalidAddress");
  });
});

describe("VoyagerPrizes", function () {
  it("claims an ERC-1155 voucher signed by the registered game's referee", async function () {
    const f = await deployFixture();
    const runId = ethers.id("run-1");
    const voucher = { player: f.p1.address, nftContract: f.nft.target, tokenId: 70, tier: 1, runId, deadline: await future() };
    await f.nft.mint(f.prizes.target, 70, 2);
    const signature = await voucherSignature(f, f.prizes, f.referee, "PrizeVoucher", prizeFields, voucher);
    await expect(f.prizes.connect(f.p1).claim(GAME_ID, voucher, signature))
      .to.emit(f.prizes, "PrizeClaimed").withArgs(GAME_ID, runId, f.p1.address, f.nft.target, 70, 1);
    expect(await f.nft.balanceOf(f.p1.address, 70)).to.equal(1);
    expect(await f.prizes.inventory(f.nft.target, 70)).to.equal(1);
    await expect(f.prizes.connect(f.p1).claim(GAME_ID, voucher, signature)).to.be.revertedWithCustomError(f.prizes, "AlreadyClaimed");
    const nonPilotVoucher = { ...voucher, player: f.stranger.address, runId: ethers.id("non-pilot-run") };
    const nonPilotSignature = await voucherSignature(f, f.prizes, f.referee, "PrizeVoucher", prizeFields, nonPilotVoucher);
    await expect(f.prizes.claim(GAME_ID, nonPilotVoucher, nonPilotSignature)).to.be.revertedWithCustomError(f.prizes, "NotPilot");
  });

  it("rejects replay across different token ids, wrong referee, expired voucher, and invalid tier", async function () {
    const f = await deployFixture();
    const deadline = await future();
    const one = { player: f.p1.address, nftContract: f.nft.target, tokenId: 75, tier: 2, runId: ethers.id("run-75"), deadline };
    await f.nft.mint(f.prizes.target, 75, 1);
    const wrongSig = await voucherSignature(f, f.prizes, f.p2, "PrizeVoucher", prizeFields, one);
    await expect(f.prizes.claim(GAME_ID, one, wrongSig)).to.be.revertedWithCustomError(f.prizes, "InvalidSignature");
    const sig = await voucherSignature(f, f.prizes, f.referee, "PrizeVoucher", prizeFields, one);
    await f.prizes.claim(GAME_ID, one, sig);
    const second = { ...one, tokenId: 76 };
    await f.nft.mint(f.prizes.target, 76, 1);
    const sig2 = await voucherSignature(f, f.prizes, f.referee, "PrizeVoucher", prizeFields, second);
    await expect(f.prizes.claim(GAME_ID, second, sig2)).to.be.revertedWithCustomError(f.prizes, "AlreadyClaimed");
    const expired = { ...second, runId: ethers.id("expired"), deadline: 1 };
    await expect(f.prizes.claim(GAME_ID, expired, "0x")).to.be.revertedWithCustomError(f.prizes, "VoucherExpired");
    const invalid = { ...second, runId: ethers.id("invalid"), tier: 3 };
    await expect(f.prizes.claim(GAME_ID, invalid, "0x")).to.be.revertedWithCustomError(f.prizes, "InvalidVoucher");
  });

  it("supports controlled releases and pausing", async function () {
    const f = await deployFixture();
    await f.nft.mint(f.prizes.target, 79, 2);
    await expect(f.prizes.connect(f.stranger).adminRelease(f.stranger.address, f.nft.target, 79, 1)).to.be.reverted;
    await f.prizes.pause();
    await expect(f.prizes.adminRelease(f.p1.address, f.nft.target, 79, 1)).to.be.revertedWithCustomError(f.prizes, "EnforcedPause");
    await f.prizes.unpause();
    await f.prizes.adminRelease(f.p1.address, f.nft.target, 79, 1);
    expect(await f.nft.balanceOf(f.p1.address, 79)).to.equal(1);
  });
});

describe("VoyagerStamps", function () {
  it("mints a player-paid EIP-712 voucher once and exposes per-token metadata and royalties", async function () {
    const f = await deployFixture();
    const voucher = { player: f.p1.address, recordId: ethers.id("record-1"), level: 4, difficulty: 2, metadataURI: "ipfs://stamp/1", deadline: await future() };
    const signature = await voucherSignature(f, f.stamps, f.referee, "StampVoucher", stampFields, voucher);
    await expect(f.stamps.connect(f.p1).mintWithVoucher(GAME_ID, voucher, signature))
      .to.emit(f.stamps, "StampMinted").withArgs(GAME_ID, f.p1.address, voucher.recordId, 1, 4, 2, voucher.metadataURI);
    expect(await f.stamps.uri(1)).to.equal(voucher.metadataURI);
    expect(await f.stamps.balanceOf(f.p1.address, 1)).to.equal(1);
    expect(await f.stamps.tokenForRecord(voucher.recordId)).to.equal(1);
    expect((await f.stamps.royaltyInfo(1, 10_000))[1]).to.equal(500);
    await expect(f.stamps.connect(f.p1).mintWithVoucher(GAME_ID, voucher, signature)).to.be.revertedWithCustomError(f.stamps, "AlreadyMinted");
  });

  it("checks stamp signer, caller, deadline, and voucher values", async function () {
    const f = await deployFixture();
    const voucher = { player: f.p1.address, recordId: ethers.id("record-2"), level: 1, difficulty: 0, metadataURI: "ipfs://stamp/2", deadline: await future() };
    const wrong = await voucherSignature(f, f.stamps, f.stranger, "StampVoucher", stampFields, voucher);
    await expect(f.stamps.connect(f.p1).mintWithVoucher(GAME_ID, voucher, wrong)).to.be.revertedWithCustomError(f.stamps, "InvalidSignature");
    const signed = await voucherSignature(f, f.stamps, f.referee, "StampVoucher", stampFields, voucher);
    await expect(f.stamps.connect(f.p2).mintWithVoucher(GAME_ID, voucher, signed)).to.be.revertedWithCustomError(f.stamps, "InvalidAddress");
    await expect(f.stamps.connect(f.p1).mintWithVoucher(GAME_ID, { ...voucher, deadline: 1 }, "0x"))
      .to.be.revertedWithCustomError(f.stamps, "VoucherExpired");
    await expect(f.stamps.connect(f.p1).mintWithVoucher(GAME_ID, { ...voucher, difficulty: 3 }, "0x"))
      .to.be.revertedWithCustomError(f.stamps, "InvalidVoucher");
    const nonPilot = { ...voucher, player: f.stranger.address, recordId: ethers.id("non-pilot-record") };
    const nonPilotSignature = await voucherSignature(f, f.stamps, f.referee, "StampVoucher", stampFields, nonPilot);
    await expect(f.stamps.connect(f.stranger).mintWithVoucher(GAME_ID, nonPilot, nonPilotSignature))
      .to.be.revertedWithCustomError(f.stamps, "NotPilot");
  });

  it("batch mints only for minters and enforces a five-item batch limit", async function () {
    const f = await deployFixture();
    const ids = [ethers.id("batch-1"), ethers.id("batch-2")];
    await expect(f.stamps.connect(f.stranger).mintBatch(f.p1.address, ids, [1, 2], [0, 1], ["uri1", "uri2"])).to.be.reverted;
    await f.stamps.mintBatch(f.p1.address, ids, [1, 2], [0, 1], ["uri1", "uri2"]);
    expect(await f.stamps.balanceOf(f.p1.address, 1)).to.equal(1);
    expect(await f.stamps.balanceOf(f.p1.address, 2)).to.equal(1);
    expect(await f.stamps.uri(2)).to.equal("uri2");
    await expect(f.pilots.setPilots([f.stranger.address, f.host.address, f.treasury.address, f.referee.address, f.admin.address, f.p5.address], true))
      .to.be.revertedWithCustomError(f.pilots, "InvalidPilot");
    const six = Array.from({ length: 6 }, (_, i) => ethers.id(`batch-${i + 3}`));
    await expect(f.stamps.mintBatch(f.p1.address, six, [1, 1, 1, 1, 1, 1], [0, 0, 0, 0, 0, 0], six.map(() => "uri")))
      .to.be.revertedWithCustomError(f.stamps, "BatchTooLarge");
    await f.stamps.connect(f.p1).safeTransferFrom(f.p1.address, f.p2.address, 1, 1, "0x");
    await f.stamps.pause();
    await expect(f.stamps.connect(f.p1).safeTransferFrom(f.p1.address, f.p2.address, 1, 1, "0x"))
      .to.be.revertedWithCustomError(f.stamps, "EnforcedPause");
  });
});
