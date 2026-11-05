const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TYPES } = require("../../server/src/eip712");

const GAME = ethers.id("decent-voyager");
async function fixture() {
  const [admin, referee, pilot, stranger] = await ethers.getSigners();
  const pilots = await (await ethers.getContractFactory("VoyagerPilots")).deploy(admin.address);
  await pilots.registerGame(GAME, referee.address);
  await pilots.setPilots([pilot.address], true);
  const rewards = await (await ethers.getContractFactory("VoyagerRewards")).deploy(admin.address, pilots.target);
  const nft = await (await ethers.getContractFactory("MockERC1155")).deploy(admin.address);
  const token = await (await ethers.getContractFactory("MockUSDC")).deploy(admin.address);
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const reward = {
    gameId: GAME, player: pilot.address, nftContract: nft.target, tokenId: 76,
    nftAmount: 1, paymentToken: token.target, tokenAmount: 100n * 10n ** 18n,
    nativeAmount: ethers.parseEther("0.001"), awardId: ethers.id("perfect-pilot"),
    claimId: ethers.id("run:perfect-pilot"), recordId: ethers.id("level20"),
    deadline: (await ethers.provider.getBlock("latest")).timestamp + 3600
  };
  const sign = (value = reward) => referee.signTypedData(
    { name: "DecentVoyager", version: "1", chainId, verifyingContract: rewards.target },
    { RewardBundle: TYPES.RewardBundle }, value);
  const fund = async () => {
    await nft.mint(rewards.target, 76, 100);
    await token.mint(rewards.target, 10_000n * 10n ** 18n);
    await admin.sendTransaction({ to: rewards.target, value: ethers.parseEther("1") });
  };
  return { admin, referee, pilot, stranger, pilots, rewards, nft, token, reward, sign, fund };
}

describe("VoyagerRewards atomic escrow", function () {
  it("transfers DNFT, ERC20 and native ETH together and links the win record", async function () {
    const f = await fixture(); await f.fund();
    await expect(() => f.rewards.connect(f.stranger).claim(f.reward, f.sign()))
      .to.changeEtherBalance(f.pilot, f.reward.nativeAmount);
    expect(await f.nft.balanceOf(f.pilot.address, 76)).to.equal(1);
    expect(await f.token.balanceOf(f.pilot.address)).to.equal(f.reward.tokenAmount);
    expect(await f.rewards.usedClaimId(f.reward.claimId)).to.equal(true);
    await expect(f.rewards.claim(f.reward, await f.sign())).to.be.revertedWithCustomError(f.rewards, "AlreadyClaimed");
  });

  it("rolls NFT and replay flags back when either fungible asset is short", async function () {
    for (const asset of ["token", "native"]) {
      const f = await fixture();
      await f.nft.mint(f.rewards.target, 76, 1);
      if (asset === "native") await f.token.mint(f.rewards.target, f.reward.tokenAmount);
      await expect(f.rewards.claim(f.reward, await f.sign())).to.be.reverted;
      expect(await f.nft.balanceOf(f.pilot.address, 76)).to.equal(0);
      expect(await f.rewards.usedClaimId(f.reward.claimId)).to.equal(false);
      expect(await f.rewards.claimedToken(f.pilot.address, f.nft.target, 76)).to.equal(false);
      expect(await f.token.balanceOf(f.pilot.address)).to.equal(0);
    }
  });

  it("supports native-only and ERC20-only awards without an NFT", async function () {
    const f = await fixture(); await f.fund();
    const native = { ...f.reward, nftContract: ethers.ZeroAddress, tokenId: 0, nftAmount: 0,
      paymentToken: ethers.ZeroAddress, tokenAmount: 0 };
    await expect(f.rewards.claim(native, await f.sign(native))).to.emit(f.rewards, "RewardClaimed");
    const erc20 = { ...native, nativeAmount: 0, paymentToken: f.token.target, tokenAmount: 100,
      claimId: ethers.id("second"), awardId: ethers.id("second") };
    await f.rewards.claim(erc20, await f.sign(erc20));
    expect(await f.token.balanceOf(f.pilot.address)).to.equal(100);
  });

  it("binds all assets, game and receipt to the referee signature; gates expiry, pilots and pause", async function () {
    const f = await fixture(); await f.fund();
    const signature = await f.sign();
    for (const patch of [{ nativeAmount: 1 }, { tokenAmount: 1 }, { recordId: ethers.id("forged") },
      { gameId: ethers.id("another-game") }, { tokenId: 75 }]) {
      await expect(f.rewards.claim({ ...f.reward, ...patch }, signature)).to.be.reverted;
    }
    const expired = { ...f.reward, deadline: 1 };
    await expect(f.rewards.claim(expired, await f.sign(expired))).to.be.revertedWithCustomError(f.rewards, "Expired");
    await f.pilots.setPilots([f.pilot.address], false);
    await expect(f.rewards.claim(f.reward, signature)).to.be.revertedWithCustomError(f.rewards, "NotPilot");
    await f.pilots.setPilots([f.pilot.address], true);
    await f.rewards.pause();
    await expect(f.rewards.claim(f.reward, signature)).to.be.revertedWithCustomError(f.rewards, "EnforcedPause");
    await expect(f.rewards.connect(f.stranger).unpause()).to.be.reverted;
  });

  it("permits custody recovery only for a manager while paused", async function () {
    const f = await fixture(); await f.fund();
    await expect(f.rewards.releaseToken(f.token.target, 1, f.admin.address)).to.be.reverted;
    await f.rewards.pause();
    await expect(f.rewards.connect(f.stranger).releaseNative(1, f.stranger.address)).to.be.reverted;
    await f.rewards.releaseNFT(f.nft.target, 76, 1, f.admin.address);
    await f.rewards.releaseToken(f.token.target, 1, f.admin.address);
    await f.rewards.releaseNative(1, f.admin.address);
    expect(await f.nft.balanceOf(f.admin.address, 76)).to.equal(1);
  });
});
