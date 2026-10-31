import type { ProofRecord, PublicRunRecord } from '@autoevolve/shared';
import { proofToSolidity, type Groth16Proof } from '@autoevolve/zk';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseAbiItem,
  type Address,
  type Hash,
  type Log,
  type PublicClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { config, isChainConfigured } from './config';
import { log } from './logger';

export const REGISTRY_ABI = parseAbi([
  'function submitImprovement(string transitionId, uint256 oldScore, uint256 newScore, string cidString, uint256 manifestCommitment, uint256 rubricDigest, uint256 versionCommitOld, uint256 versionCommitNew, (uint256[2] a, uint256[2][2] b, uint256[2] c) proof)',
  'function getRecord(string transitionId) view returns ((address agent, uint256 oldScore, uint256 newScore, string cid, uint256 manifestCommitment, uint256 rubricDigest, uint256 timestamp, uint256 reward))',
  'function rewardAmount() view returns (uint256)',
  'function totalRewardsPaid() view returns (uint256)',
  'event ImprovementVerified(address indexed agent, string transitionId, uint256 oldScore, uint256 newScore, string cid, uint256 reward)',
]);

const IMPROVEMENT_EVENT = parseAbiItem(
  'event ImprovementVerified(address indexed agent, string transitionId, uint256 oldScore, uint256 newScore, string cid, uint256 reward)',
);

export interface RegistryEvent {
  agent: string;
  transitionId: string;
  oldScore: number;
  newScore: number;
  cid: string;
  rewardWei: string;
  txHash: string;
  blockNumber: number;
}

export interface SettlementResult {
  chainId: number;
  txHash: string;
  explorerUrl: string;
  rewardWei: string;
  contractAddress: string;
  blockNumber: number;
  onChainVerified: boolean;
}

export function publicClient(): PublicClient {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(config.chain.rpcUrl, { timeout: 20_000 }),
  }) as PublicClient;
}

export async function fetchRegistryEvents(limit = 50): Promise<RegistryEvent[]> {
  if (!config.chain.registryAddress) return [];
  const client = publicClient();
  const latest = await client.getBlockNumber();
  const fromBlock = latest > 50_000n ? latest - 50_000n : 0n;
  try {
    const logs = (await client.getLogs({
      address: config.chain.registryAddress as Address,
      event: IMPROVEMENT_EVENT,
      fromBlock,
      toBlock: latest,
    })) as Log[];
    return logs
      .slice(-limit)
      .map((entry) => {
        const args = (entry as unknown as { args: Record<string, unknown> }).args ?? {};
        return {
          agent: String(args.agent ?? ''),
          transitionId: String(args.transitionId ?? ''),
          oldScore: Number(args.oldScore ?? 0),
          newScore: Number(args.newScore ?? 0),
          cid: String(args.cid ?? ''),
          rewardWei: String(args.reward ?? '0'),
          txHash: entry.transactionHash ?? '',
          blockNumber: Number(entry.blockNumber),
        };
      });
  } catch (err) {
    log('chain_read_failed', { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

function proofArgs(proof: ProofRecord) {
  const p = proof.proof as any;
  const raw = p && p.a ? p : proofToSolidity(p as Groth16Proof);
  const pair = (value: [string, string]) =>
    [BigInt(value[0]), BigInt(value[1])] as const;
  return {
    a: pair(raw.a),
    b: [pair(raw.b[0]), pair(raw.b[1])] as const,
    c: pair(raw.c),
  };
}

/**
 * Submit the primary proof on-chain. Returns null when the chain is not
 * configured (fallback demo mode) instead of fabricating a transaction.
 */
export async function settleImprovement(
  run: PublicRunRecord,
  proof: ProofRecord,
  cid: string,
): Promise<SettlementResult | null> {
  if (!isChainConfigured()) {
    log('settlement_skipped', { reason: 'chain not configured', runId: run.id });
    return null;
  }
  const account = privateKeyToAccount(`0x${config.chain.privateKey.replace(/^0x/, '')}`);
  const wallet = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(config.chain.rpcUrl, { timeout: 30_000 }),
  });
  const [oldScore, newScore, rubricDigest, commitOld, commitNew, , manifestCommit] =
    proof.publicSignals;

  const hash: Hash = await wallet.writeContract({
    address: config.chain.registryAddress as Address,
    abi: REGISTRY_ABI,
    functionName: 'submitImprovement',
    args: [
      proof.transitionId,
      BigInt(oldScore),
      BigInt(newScore),
      cid,
      BigInt(manifestCommit),
      BigInt(rubricDigest),
      BigInt(commitOld),
      BigInt(commitNew),
      proofArgs(proof),
    ],
  });

  const receipt = await publicClient().waitForTransactionReceipt({ hash, timeout: 120_000 });
  const onChainVerified = receipt.status === 'success';
  log('settlement', { runId: run.id, txHash: hash, status: receipt.status });

  return {
    chainId: config.chain.chainId,
    txHash: hash,
    explorerUrl: `${config.chain.explorer}/tx/${hash}`,
    rewardWei: config.chain.rewardWei.toString(),
    contractAddress: config.chain.registryAddress,
    blockNumber: Number(receipt.blockNumber),
    onChainVerified,
  };
}
