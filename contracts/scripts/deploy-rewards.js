const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ethers, artifacts, network } = require("hardhat");

const ROOT = path.resolve(__dirname, "../..");
const ADMIN = "0x807061DF657A7697c04045dA7d16D941861cAABc";
const BNUT = "0x25ACb773159Af5a5c672DEfe31C7Fff6a9A93736";
const BUDGET = ethers.parseEther("10000");
const OUTPUT = path.join(__dirname, "../deployments/base-rewards.json");
const ABI = [
  "function MINTER_ROLE() view returns(bytes32)", "function hasRole(bytes32,address) view returns(bool)",
  "function remainingSupply() view returns(uint256)", "function balanceOf(address) view returns(uint256)",
  "function decimals() view returns(uint8)", "function mintReward(address,uint256,string)",
  "event Transfer(address indexed from,address indexed to,uint256 amount)"
];

async function main() {
  assert.equal(network.name, "base", "This explicit funding script supports Base mainnet only");
  assert.equal(Number((await ethers.provider.getNetwork()).chainId), 8453);
  assert.equal(process.env.EXECUTE_REWARDS_FUNDING, "yes", "Explicit execution flag required");
  assert.ok(process.env.JOLLY_PRIVATE_KEY, "Creator mint-authority signer is required");
  const signer = new ethers.Wallet(process.env.JOLLY_PRIVATE_KEY, ethers.provider);
  assert.equal(signer.address, ADMIN);
  const bookPath = path.join(ROOT, "src/js/chain/addresses.json");
  const book = JSON.parse(fs.readFileSync(bookPath));
  const pilots = book.base.VoyagerPilots;
  assert.notEqual(await ethers.provider.getCode(pilots), "0x");
  const token = new ethers.Contract(BNUT, ABI, signer);
  assert.equal(await token.decimals(), 18n);
  assert.equal(await token.hasRole(await token.MINTER_ROLE(), ADMIN), true, "Signer lacks BNut mint authority");
  let state = fs.existsSync(OUTPUT) ? JSON.parse(fs.readFileSync(OUTPUT)) : null;
  const save = () => fs.writeFileSync(OUTPUT, `${JSON.stringify(state, null, 2)}\n`);
  const factory = await ethers.getContractFactory("VoyagerRewards", signer);
  const confirmed = async hash => {
    const reader = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true });
    try {
      const receipt = await reader.waitForTransaction(hash, 2, 120_000);
      assert.ok(receipt, "Submitted transaction is unavailable; inspect before retrying");
      return receipt;
    } finally { reader.destroy(); }
  };
  if (!state) {
    assert.ok(await token.remainingSupply() >= BUDGET, "BNut supply cap cannot cover budget");
    const request = await factory.getDeployTransaction(ADMIN, pilots);
    const gas = await signer.estimateGas(request);
    const fee = (await ethers.provider.getFeeData()).maxFeePerGas;
    assert.ok(fee && await ethers.provider.getBalance(ADMIN) > gas * fee * 2n, "Insufficient deployment gas headroom");
    const rewards = await factory.deploy(ADMIN, pilots);
    state = { chainId: 8453, admin: ADMIN, pilots, VoyagerRewards: rewards.target,
      deploymentTxHash: rewards.deploymentTransaction().hash, bnut: BNUT,
      approvedBNutBudget: String(BUDGET), status: "DEPLOYMENT_SUBMITTED" };
    save();
  }
  const deployment = await confirmed(state.deploymentTxHash);
  assert.equal(deployment.status, 1, "Deployment failed; inspect before retrying");
  assert.equal(deployment.contractAddress, state.VoyagerRewards);
  const submitted = await ethers.provider.getTransaction(state.deploymentTxHash);
  const expectedDeployment = await factory.getDeployTransaction(ADMIN, pilots);
  assert.equal(submitted.from, ADMIN);
  assert.equal(submitted.data, expectedDeployment.data, "Deployment source or constructor differs from this build");
  assert.equal(state.admin, ADMIN);
  assert.equal(state.pilots, pilots);
  assert.equal(state.approvedBNutBudget, String(BUDGET));
  const rewards = factory.attach(state.VoyagerRewards);
  assert.equal(await rewards.pilots(), pilots);
  assert.equal(await rewards.hasRole(await rewards.DEFAULT_ADMIN_ROLE(), ADMIN), true);
  assert.notEqual(await ethers.provider.getCode(state.VoyagerRewards), "0x");
  if (!state.mintTxHash) {
    assert.equal(await token.balanceOf(state.VoyagerRewards), 0n, "Unexpected existing BNut custody; replan before minting");
    assert.ok(await token.remainingSupply() >= BUDGET);
    const tx = await token.mintReward(state.VoyagerRewards, BUDGET,
      "DecentVoyager Perfect Pilot reserve: 100 awards x 100 BNut; atomic Supporter DNFT + BNut claims");
    state.mintTxHash = tx.hash;
    state.status = "BNUT_MINT_SUBMITTED";
    save();
  }
  const minted = await confirmed(state.mintTxHash);
  assert.equal(minted.status, 1, "Mint failed; inspect before retrying");
  const transfers = minted.logs.filter(log => log.address.toLowerCase() === BNUT.toLowerCase())
    .map(log => { try { return token.interface.parseLog(log); } catch { return null; } })
    .filter(log => log?.name === "Transfer" && log.args.from === ethers.ZeroAddress &&
      log.args.to === state.VoyagerRewards && log.args.amount === BUDGET);
  assert.equal(transfers.length, 1, "Receipt does not prove the exact authorized reserve mint");
  assert.ok(await token.balanceOf(state.VoyagerRewards) >= BUDGET);
  state.status = "DEPLOYED_BNUT_FUNDED_NFT_RESERVES_PENDING";
  state.verifiedAt = new Date().toISOString();
  state.verifiedBlock = await ethers.provider.getBlockNumber();
  save();
  book.base.VoyagerRewards = state.VoyagerRewards;
  fs.writeFileSync(bookPath, `${JSON.stringify(book, null, 2)}\n`);
  const artifact = await artifacts.readArtifact("VoyagerRewards");
  fs.writeFileSync(path.join(ROOT, "src/js/chain/abi/VoyagerRewards.json"), `${JSON.stringify(artifact.abi, null, 2)}\n`);
  console.log(JSON.stringify(state, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
