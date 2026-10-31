# AutoEvolve Protocol

**Decentralized, ZK-attested self-improving agent.**

A generate → critique → revise loop scores every version against a frozen benchmark, then proves
in Groth16 that the published integer score strictly increased under that fixed rubric — without
revealing the private metric witness or any system prompt — publishes a sanitized memory manifest
to IPFS, anchors its CID on Base Sepolia and pays a small escrowed reward. A second agent can then
fetch that memory and reuse the lesson.

> **Claim (exact wording):** AutoEvolve records each version and its benchmark evidence, proves
> that the published integer score increased under a fixed rubric (`Score(Vn+1) > Score(Vn)`), and
> settles a testnet reward. The proof hides the private metric witness and the public memory omits
> system prompts. **We prove score arithmetic increase, not LLM inference.**

---

## Architecture

```
                ┌──────────────────────────── apps/web (Next.js 14) ───────────────────────────┐
                │  Run timeline (SSE) · Execution tree (React Flow) · Metrics · Monaco diff   │
                │  Proof panel · Memory & settlement · /registry                              │
                └───────────────────────────────────▲──────────────────────────────────────────┘
                                       SSE / REST   │
┌──────────────────────────── apps/worker (Fastify) ─────────────────────────────────────────┐
│  orchestrator ──► generator (Qwen2.5-Coder-32B)  ──► benchmark (Docker, 10+5 tests)        │
│        │             critic (DeepSeek-R1, JSON)   ──► scorer.ts (integer rubric)           │
│        │                                                                                   │
│        ├──► witness builder ──► snarkjs Groth16 prover ──► proof + public signals           │
│        ├──► sanitizer ──► canonical JSON ──► IPFS (Storacha → Pinata → local content store) │
│        ├──► viem ──► ImprovementRegistry on Base Sepolia ──► reward escrow                  │
│        └──► SQLite (private RunRecord) ──► sanitized manifest only ever leaves this box     │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

Trust boundaries:

| Data | Where it lives | Published? |
| --- | --- | --- |
| system prompt, raw prompts/responses, API keys | worker SQLite / env only | never |
| hidden test bodies | benchmark image only | never |
| metric counts (functional/edge/static) | private witness | only as a proof |
| scores, code hashes, changelogs, critiques, embeddings | sanitized manifest | IPFS |
| proof + CID commitment + reward | Base Sepolia | on-chain |

## Repository layout

```
apps/web                 Next.js 14 dashboard (Tailwind, React Flow, Monaco, SSE)
apps/worker              Fastify API, agentic loop, SQLite, prover/IPFS/chain bridges
packages/shared          Zod schemas, scorer, canonical JSON, changelog, sanitizer, CID commitment
packages/zk              Circom circuit, build artifacts, witness builder, snarkjs prover
packages/contracts       Groth16Verifier.sol, ImprovementRegistry.sol, Hardhat deploy script
benchmark                Docker sandbox, 10 functional + 5 edge tests, static check, runner
AutoEvolve_Test_Suite/   FROZEN acceptance tests (never edited)
```

## Quickstart

```bash
pnpm install
cp .env.example .env               # no secrets required for offline demo
pnpm test:phase1 && pnpm test:phase3 && pnpm test:phase5 && pnpm test:phase4
pnpm demo:clean                    # full loop, mock LLM when no key is set
pnpm worker                        # http://localhost:8787
pnpm web                           # http://localhost:3000
```

Requirements: Node ≥ 20.11 (uses `node:sqlite`), pnpm 9, Python 3.11 for the local benchmark
runner, Circom 2 only if you rebuild the circuit, Docker only if `BENCHMARK_RUNNER=docker`.

### Live models

```dotenv
FEATHERLESS_API_KEY=...
GENERATOR_MODEL=Qwen/Qwen2.5-Coder-32B-Instruct
CRITIC_MODEL=deepseek-ai/DeepSeek-R1
MAX_COST_USD=10
MOCK_LLM=0
```

Verify the pinned model IDs before a demo:

```bash
curl -s https://api.featherless.ai/v1/models -H "Authorization: Bearer $FEATHERLESS_API_KEY" \
  | jq -r '.data[].id' | grep -E 'Qwen2.5-Coder-32B|DeepSeek-R1'
```

Every call is logged with `request_id`, `model_id`, `prompt_digest`, `response_hash`, token counts,
USD cost and latency, at `temperature=0.0`, `top_p=1.0`, max 3000 output tokens. The generator and
critic are always different model IDs.

### Benchmark sandbox

```bash
docker build -t autoevolve-bench ./benchmark
BENCHMARK_RUNNER=docker pnpm bench:run          # docker, --network none
BENCHMARK_RUNNER=local  pnpm bench:run          # network-isolated fallback
```

The runner feeds the candidate to `harness.py` over stdin (no volume mounts), scans imports with an
AST check, runs pytest under a JUnit report and a 5 s budget, and scores static quality with a pinned
Ruff. Scores are computed by `packages/shared/src/scorer.ts` — never by a model.

Current fixture scores (measured by `pnpm test:phase0`):

| File | functional | edge | static | total |
| --- | --- | --- | --- | --- |
| `V1_buggy.py` | 6 | 2 | 2 | **56** |
| `V2_fixed.py` | 10 | 4 | 0 | **92** |
| `V3_improved.py` | 10 | 5 | 2 | **97** |
| `reference_solution.py` | 10 | 5 | 5 | **100** |

### Zero-knowledge circuit

`packages/zk/circuits/improvement.circom`

- private: `f_old, e_old, s_old, f_new, e_new, s_new`
- public: `oldScore, newScore, rubricDigest, versionCommitOld, versionCommitNew,
  transitionNonce, manifestCommit`
- constraints: 8-bit range checks, `oldScore = f_old*8 + e_old*3 + s_old`,
  `newScore = f_new*8 + e_new*3 + s_new`, scores ≤ 100, and `newScore > oldScore` via
  `circomlib` `LessThan`.

Artifacts are committed (`build/improvement_js/improvement.wasm`, `improvement_final.zkey`,
`verification_key.json`, `Groth16Verifier.sol`), so proving works without a rebuild. Rebuild with
`CIRCOM_BIN=/path/to/circom pnpm zk:build` (powers of tau 2^14 are generated locally; no download
needed).

Proving time in the demo runs: **73–843 ms** per transition on a laptop (well under the 30 s
target). `pnpm test:phase3` covers valid 60→85, equal, decreasing, out-of-range and tampered
public signals.

### Contracts

```bash
pnpm contracts:compile
# .env: BASE_SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY (funded with testnet ETH)
pnpm contracts:deploy            # writes packages/contracts/deployments/84532.json
# then set REGISTRY_ADDRESS + VERIFIER_ADDRESS in .env
```

`ImprovementRegistry.submitImprovement` checks pause state, replay (`Transition used`), strict
increase (`Must improve`), score range, then verifies the Groth16 proof, writes the record, emits
`ImprovementVerified` and pays `rewardAmount` (default 0.0001 ETH) from escrow with
checks-effects-interactions + `nonReentrant`. Owner-only `fund`, `withdraw`, `pause`,
`setRewardAmount`.

### IPFS memory

`IPFS_PROVIDER=local` (default) stores canonical JSON in `.data/ipfs/<cid>` and serves it from
`GET /api/ipfs/:cid`; the CID is a real CIDv1 dag-json/sha2-256 (`bafy…`/`bagu…`) and every upload is
fetch-back validated. `storacha` (via `@web3-storage/w3up-client`) and `pinata` (REST + JWT) are
implemented and tried first when their credentials are present.

Commitment scheme without hash circularity: the circuit commits to `keccak256(contentCid)`, where
`contentCid` is the CID of the manifest with `contentCid` and `proofPublicInputs` set to `null`. A
judge can refetch the manifest, null those two fields, recompute the CID and compare it with the
public `manifestCommitment` in the proof and on-chain record.

The second agent (`fetchRelevantMemories`) reads registry events (or local publications), fetches
manifests, embeds with local `@xenova/transformers` (`all-MiniLM-L6-v2`) and ranks lessons by cosine
similarity; when the model cannot be downloaded it falls back to deterministic hashed embeddings.
Inherited lessons are injected into the next run's generator prompt and shown as a "memory reused"
badge with the parent CIDs.

## Verification (what was actually run)

| Command | Result |
| --- | --- |
| `pnpm test:phase1` (frozen scoring) | 6/6 pass |
| `pnpm test:phase3` (frozen circuit) | 5/5 pass |
| `pnpm test:phase4` (frozen contracts) | 4/4 pass |
| `pnpm test:phase5` (frozen IPFS/memory) | 4/4 pass |
| `pnpm test:phase2` (agentic loop, T2.1–T2.5) | 5/5 pass |
| `pnpm test:phase0` (T0.1–T0.4) | 4/4 pass, digest `fb8023d7…` |
| `pnpm --filter @autoevolve/web build` | success |
| `pnpm demo:clean` (mock) | 2 runs, 4 proofs verified, 2 CIDs, 5 s wall clock |

### Known limitations in this environment

- **Docker daemon is not installed here** (CLI exists, no engine), so `docker build` and
  `BENCHMARK_RUNNER=docker` could not be executed. The image and network-isolated runner are
  complete; the measured scores above came from the local runner with the same tests, harness and
  pinned Ruff.
- **No Base Sepolia deployment or transaction** was performed (no funded key was available). The
  deploy script, ABI, registry tests and worker settlement path are complete; without chain
  credentials the run reports `not settled` instead of inventing a tx hash.
- **Storacha/Pinata uploads were not exercised live** (no credentials). The default is the local
  content store, which is fully tested.
- Live Featherless calls were not executed here; mock mode is deterministic and clearly badged in
  the UI.

## Deliberate deviations (forced by the frozen tests)

1. **Circuit count bounds are 4-bit (0–15), not 10/5/5.** The frozen valid vector `60 → 85` uses
   `s_old = 6`, which a strict `static ≤ 5` check would reject. The rubric caps remain enforced by
   `scorer.ts`; the circuit binds the exact score equation and strict increase.
2. **CID ↔ commitment equality is not enforced on-chain.** Frozen test T4.7 stores a display CID
   with a fixed commitment (333). The worker derives the commitment from the manifest's
   `contentCid`; anyone can re-verify it off-chain against `getRecord`.
3. **String revert reasons** (`Transition used`, `Must improve`) instead of custom errors, because
   the frozen tests assert on the strings.

## Two-minute demo script

1. `pnpm demo:clean` into the terminal — point at V1 56 → V2 92 → V3 97 and the 2 proofs.
2. Open `http://localhost:3000` — live badges (mock/live, chain), then the finished run.
3. Timeline: SSE stages; execution tree: critique-labelled edges; metrics: the formula table.
4. Diff: Monaco side-by-side V1→V2, V2→V3 with the deterministic changelog.
5. Proof panel: public inputs, local PASS, proving ms. Then the CID: fetch & validate in place.
6. Registry: published manifests; with chain credentials, the tx and +0.0001 ETH reward.
7. Second agent: "memory reused" badge with the parent CID from the previous run.
8. Close with the claim wording and the trust-boundary table.

## License

MIT — see [LICENSE](LICENSE).
