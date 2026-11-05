require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

const accounts = process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [];
module.exports = {
  solidity: { version: "0.8.26", settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: "cancun" } },
  networks: {
    hardhat: {},
    baseSepolia: { url: process.env.BASE_SEPOLIA_RPC_URL || "", chainId: 84532, accounts },
    base: { url: process.env.BASE_RPC_URL || "", chainId: 8453, accounts }
  },
  etherscan: {
    apiKey: { base: process.env.BASESCAN_API_KEY || "", baseSepolia: process.env.BASESCAN_API_KEY || "" },
    customChains: [
      { network: "base", chainId: 8453, urls: { apiURL: "https://api.basescan.org/api", browserURL: "https://basescan.org" } },
      { network: "baseSepolia", chainId: 84532, urls: { apiURL: "https://api-sepolia.basescan.org/api", browserURL: "https://sepolia.basescan.org" } }
    ]
  },
  paths: { sources: "./contracts", tests: "./test", cache: "./cache", artifacts: "./artifacts" }
};
