import 'dotenv/config';
import { resolve } from 'path';
process.env.LOCALAPPDATA = resolve(__dirname, 'hardhat-cache');
import '@nomicfoundation/hardhat-toolbox';
import type { HardhatUserConfig } from 'hardhat/config';

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // The snarkjs verifier uses the BN254 precompiles; no special flags needed.
    },
  },
  paths: {
    sources: './packages/contracts/contracts',
    tests: './packages/contracts/test',
    cache: './hardhat-cache',
    artifacts: './packages/contracts/artifacts',
  },
  networks: {
    hardhat: {
      chainId: 84532,
      allowUnlimitedContractSize: false,
    },
    localhost: {
      url: 'http://127.0.0.1:8545',
      chainId: 84532,
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org',
      chainId: 84532,
      accounts,
    },
  },
  mocha: {
    timeout: 120_000,
  },
};

export default config;
