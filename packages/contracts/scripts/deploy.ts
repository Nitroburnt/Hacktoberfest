/**
 * Deploy the AutoEvolve contract pair.
 *
 *   hardhat run packages/contracts/scripts/deploy.ts --network baseSepolia
 *
 * Requires BASE_SEPOLIA_RPC_URL + a funded DEPLOYER_PRIVATE_KEY. Writes
 * packages/contracts/deployments/<chainId>.json (gitignored except localhost).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import hre from 'hardhat';
const { ethers } = hre;

const REWARD = BigInt(process.env.REWARD_WEI ?? '100000000000000'); // 0.0001 ETH
const ESCROW = BigInt(process.env.REWARD_ESCROW_FUND_WEI ?? '1000000000000000000'); // 0.001 ETH

async function main() {
  const [deployer] = await ethers.getSigners();
  const chain = await ethers.provider.getNetwork();

  console.log(`deployer ${deployer.address} on chain ${chain.chainId}`);

  const verifier = await ethers.deployContract('Groth16Verifier');
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log(`Groth16Verifier  ${verifierAddress}`);

  const registry = await ethers.deployContract('ImprovementRegistry', [verifierAddress, REWARD]);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`ImprovementRegistry ${registryAddress}`);

  const fundTx = await deployer.sendTransaction({ to: registryAddress, value: ESCROW });
  await fundTx.wait();
  console.log(`escrowed ${ESCROW} wei (tx ${fundTx.hash})`);

  const dir = resolve(import.meta.dirname, '../deployments');
  mkdirSync(dir, { recursive: true });
  const out = {
    chainId: Number(chain.chainId),
    verifier: verifierAddress,
    registry: registryAddress,
    rewardWei: REWARD.toString(),
    escrowWei: ESCROW.toString(),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  };
  writeFileSync(join(dir, `${chain.chainId}.json`), `${JSON.stringify(out, null, 2)}\n`);
  console.log(`wrote packages/contracts/deployments/${chain.chainId}.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
