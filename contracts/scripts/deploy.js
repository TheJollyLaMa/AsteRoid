const fs = require("node:fs");
const path = require("node:path");
const { ethers, network, artifacts } = require("hardhat");

const ROOT = path.resolve(__dirname, "../..");
const USDC_BY_NETWORK = {
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  baseSepolia: "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
};
const CONTRACTS = ["VoyagerPilots", "VoyagerArena", "VoyagerPrizes", "VoyagerStamps", "MockUSDC"];
const ABI_CONTRACTS = [...CONTRACTS, "MockERC1155"];

async function deployContract(name, args) {
  const factory = await ethers.getContractFactory(name);
  const instance = await factory.deploy(...args);
  await instance.waitForDeployment();
  return instance;
}

async function exportAbis() {
  const dir = path.join(ROOT, "src/js/chain/abi");
  fs.mkdirSync(dir, { recursive: true });
  for (const name of ABI_CONTRACTS) {
    const artifact = await artifacts.readArtifact(name);
    fs.writeFileSync(path.join(dir, `${name}.json`), `${JSON.stringify(artifact.abi, null, 2)}\n`);
  }
}

async function main() {
  const networkName = network.name;
  if (!["hardhat", "baseSepolia", "base"].includes(networkName)) throw new Error(`Unsupported deployment network: ${networkName}`);
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const usdcAddress = networkName === "hardhat"
    ? (await deployContract("MockUSDC", [deployer.address])).target
    : USDC_BY_NETWORK[networkName];
  // ADMIN_ADDRESS (the admin-panel wallet) receives every role plus treasury/royalties; the deployer keeps its roles.
  const admin = process.env.ADMIN_ADDRESS ? ethers.getAddress(process.env.ADMIN_ADDRESS) : deployer.address;
  const referee = process.env.REFEREE_ADDRESS ? ethers.getAddress(process.env.REFEREE_ADDRESS) : null;
  const pilots = await deployContract("VoyagerPilots", [deployer.address]);
  const arena = await deployContract("VoyagerArena", [deployer.address, pilots.target, usdcAddress, admin]);
  const prizes = await deployContract("VoyagerPrizes", [deployer.address, pilots.target]);
  const stamps = await deployContract("VoyagerStamps", [deployer.address, admin, 500, pilots.target]);

  const send = async (label, txPromise) => { const tx = await txPromise; await tx.wait(); console.log(`${label}: ${tx.hash}`); };
  if (referee) await send(`registerGame(decent-voyager -> ${referee})`, pilots.registerGame(ethers.id("decent-voyager"), referee));
  const roster = JSON.parse(fs.readFileSync(path.join(ROOT, "contributor-accounts.json"), "utf8")).contributors
    .filter((entry) => entry && entry.whitelisted !== false && /^0x[\da-fA-F]{40}$/.test(entry.walletAddress || ""))
    .map((entry) => ethers.getAddress(entry.walletAddress));
  if (roster.length) await send(`setPilots(${roster.length})`, pilots.setPilots(roster, true));
  if (admin !== deployer.address) {
    const grants = [
      [pilots, ["DEFAULT_ADMIN_ROLE", "PILOT_MANAGER_ROLE", "GAME_MANAGER_ROLE"]],
      [arena, ["DEFAULT_ADMIN_ROLE", "TREASURY_ROLE"]],
      [prizes, ["DEFAULT_ADMIN_ROLE", "PRIZE_MANAGER_ROLE"]],
      [stamps, ["DEFAULT_ADMIN_ROLE", "MINTER_ROLE"]]
    ];
    for (const [contract, roles] of grants) {
      for (const role of roles) await send(`grant ${role} on ${contract.target}`, contract.grantRole(await contract[role](), admin));
    }
  }
  const deployment = {
    network: networkName,
    chainId,
    deployer: deployer.address,
    admin,
    referee,
    pilots: roster,
    usdc: usdcAddress,
    VoyagerPilots: pilots.target,
    VoyagerArena: arena.target,
    VoyagerPrizes: prizes.target,
    VoyagerStamps: stamps.target,
    deployedAt: new Date().toISOString()
  };
  const deploymentDir = path.join(__dirname, "../deployments");
  fs.mkdirSync(deploymentDir, { recursive: true });
  fs.writeFileSync(path.join(deploymentDir, `${networkName}.json`), `${JSON.stringify(deployment, null, 2)}\n`);

  const addressesPath = path.join(ROOT, "src/js/chain/addresses.json");
  let addresses = {};
  if (fs.existsSync(addressesPath)) addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8"));
  addresses[networkName] = {
    chainId,
    USDC: usdcAddress,
    VoyagerPilots: pilots.target,
    VoyagerArena: arena.target,
    VoyagerPrizes: prizes.target,
    VoyagerStamps: stamps.target
  };
  for (const [name, id, stablecoin] of [["baseSepolia", 84532, USDC_BY_NETWORK.baseSepolia], ["base", 8453, USDC_BY_NETWORK.base]]) {
    if (!addresses[name]) addresses[name] = { chainId: id, USDC: stablecoin, VoyagerPilots: null, VoyagerArena: null, VoyagerPrizes: null, VoyagerStamps: null };
  }
  fs.writeFileSync(addressesPath, `${JSON.stringify(addresses, null, 2)}\n`);
  await exportAbis();
  console.log(JSON.stringify(deployment, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
