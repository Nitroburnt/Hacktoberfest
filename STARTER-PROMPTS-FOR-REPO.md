
# How to Use AutoEvolve Master Prompt + Bias-Free Tests

You have in your repo:
- AutoEvolve_Master_Prompt.md (the build bible)
- AutoEvolve_Test_Suite/ (FROZEN tests you must NEVER edit)

Use these prompts IN ORDER in Cursor / Claude Code / Windsurf.

---

## PROMPT 0: KICKOFF - Load Context

Copy this first:

```
Read @AutoEvolve_Master_Prompt.md completely. Also read @AutoEvolve_Test_Suite/FINAL_ACCEPTANCE.md and @AutoEvolve_Test_Suite/frozen_task_spec.json.

You are the Senior Staff Engineer described in the ROLE section.

CRITICAL RULES:
1. The folder AutoEvolve_Test_Suite/ is FROZEN and IMMUTABLE. You are FORBIDDEN to edit, delete, or mock any file inside it. Tests are bias-free judges.
2. Do NOT use Streamlit. Stack is locked: pnpm monorepo, Next.js 14, Circom+snarkjs, Base Sepolia, viem, Docker benchmark.
3. Implement strictly phase-by-phase. Do NOT jump ahead. Each phase must pass its bias-free tests before next phase.
4. After each phase, run the verification command I give you.

Confirm you understood and list the 8 phases you will follow.
```

---

## PROMPT 1: PHASE 0 - Foundation & Freeze

```
Now implement PHASE 0 from @AutoEvolve_Master_Prompt.md ONLY.

Tasks:
- Init pnpm monorepo with Turborepo: apps/web, apps/worker, packages/contracts, packages/zk, packages/shared, benchmark/
- Create .env.example, .gitignore (no secrets, no ptau/zkey/wallet)
- Freeze task: copy @AutoEvolve_Test_Suite/frozen_task_spec.json and rubric.json into packages/shared/src/ and compute SHA256 rubric digest
- Setup Docker benchmark runner in benchmark/ that can run python files and return JSON score
- Create Zod schemas in packages/shared

After implementation, VERIFY with:
```
docker build -t autoevolve-bench ./benchmark
pnpm install
pnpm run build
```
Then run frozen check:
```
node -e "console.log(require('./packages/shared/src/rubric.json'))"
# Same candidate should score same 3 times - test with @AutoEvolve_Test_Suite/benchmark_fixtures/V1_buggy.py
```

Do not proceed to Phase 1 until I confirm. Show me folder tree and exit conditions T0.1-T0.4 passed.
```

---

## PROMPT 2: PHASE 1 - Benchmark & Scoring Engine

```
Implement PHASE 1 ONLY.

- Create benchmark/tests/: 10 functional + 5 edge tests (use @AutoEvolve_Test_Suite/benchmark_fixtures/*.py as reference for what should fail/pass)
- Implement packages/shared/src/scorer.ts exactly: Score = func*8 + edge*3 + static. Safety gate = banned imports check + timeout.
- Implement changelog generator using diff package, not LLM
- Implement canonical JSON stringify

DO NOT EDIT @AutoEvolve_Test_Suite/. Use it to VERIFY:

Run:
```
pnpm test:phase1
# OR if you haven't added script:
npx vitest run AutoEvolve_Test_Suite/scoring.biasfree.test.ts
```

Requirements:
- T1.1 max 100
- T1.2 safety fail => 0
- T1.5 V1_buggy <60, V2 > V1 using real benchmark run

If any test fails, fix scorer.ts, not the test file. Show test output.
```

---

## PROMPT 3: PHASE 2 - Agentic Loop

```
Implement PHASE 2 ONLY - Generate-Critique-Revise with Featherless.

- Implement apps/worker/src/featherlessClient.ts using openai SDK with baseURL https://api.featherless.ai/v1, temp 0.0, log all hashes
- Generator: Qwen/Qwen2.5-Coder-32B-Instruct
- Critic: deepseek-ai/DeepSeek-R1 (or V4-Flash), strict JSON schema
- Loop orchestrator V1->eval->critique->V2->eval->critique->V3 with early stop
- Cost guard $10
- Private RunRecord in sqlite, never publish

VERIFY:
```
npx vitest run AutoEvolve_Test_Suite/ --testNamePattern="T2"
# Manually check logs:
# 1. generator != critic model IDs
# 2. critic input does NOT contain hidden test bodies
```

Show me one full loop with mocked LLM responses first, then with real Featherless keys from .env.
```

---

## PROMPT 4: PHASE 3 - ZK Circuit

```
Implement PHASE 3 ONLY.

- Write packages/zk/circuits/improvement.circom with constraints from master prompt: range checks, oldScore calc, newScore calc, newScore > oldScore
- Use circomlib LessThan
- Setup: compile, ptau phase1 14, groth16 setup, export verification_key.json and Solidity verifier
- Implement witness builder in apps/worker/src/zk/
- Prover using snarkjs fullProve + local verify

VERIFY with frozen tests:
```
npx vitest run AutoEvolve_Test_Suite/circuit.biasfree.test.ts
```

Must pass:
- T3.1 valid 60->85 PASS
- T3.2 equal 80->80 FAIL
- T3.3 decreasing 90->70 FAIL
- T3.5 tampered FAIL

If tests fail, fix circuit, not tests.
```

---

## PROMPT 5: PHASE 4 - Contracts

```
Implement PHASE 4 ONLY.

- Move Groth16Verifier.sol to packages/contracts/contracts/
- Write ImprovementRegistry.sol as specified in master prompt with replay guard, reward, pause
- Deploy script to Base Sepolia (chain 84532) using Hardhat + viem
- Fund with faucet ETH
- Worker integration: after IPFS, call submitImprovement

VERIFY:
```
npx hardhat test AutoEvolve_Test_Suite/contracts.biasfree.test.ts
# OR
npx vitest run AutoEvolve_Test_Suite/contracts.biasfree.test.ts
```

Requirements T4.1-T4.7: valid proof pays reward, replay reverts, invalid reverts.
Show Basescan link.
```

---

## PROMPT 6: PHASE 5 - IPFS Memory + Second Agent

```
Implement PHASE 5 ONLY.

- Implement sanitizer: drops systemPrompt, apiKey, private tests. Keep only allowed fields.
- Implement uploader.ts: Storacha w3up-client primary, Pinata fallback, fetch-back validation
- CID commitment = keccak256(cid string)
- Second agent fetchRelevantMemories() - query contract events, fetch IPFS, local embeddings @xenova/transformers, cosine rank

VERIFY:
```
npx vitest run AutoEvolve_Test_Suite/ipfs.memory.biasfree.test.ts
```

Must pass T5.1 no secrets in IPFS, T5.2 roundtrip, T5.4 similarity ranking.
```

---

## PROMPT 7: PHASE 6 - Dashboard (NOT Streamlit)

```
Implement PHASE 6 ONLY - Next.js Dashboard.

- apps/web: App Router /, /runs/[id], /registry
- Components: Timeline SSE, Execution Tree React Flow, Metrics Panel, Monaco Diff, Proof Panel, Memory & Settlement (CID + tx link)
- SSE from apps/worker
- viem reads registry events
- No raw prompts in browser

VERIFY manually + with:
```
pnpm dev
# Open localhost:3000, start new run, check:
# T6.1 SSE order, T6.3 diff shows real changes, T6.4 both checks green
```

```

---

## PROMPT 8: PHASE 7 - E2E & Demo

```
Implement PHASE 7 - Final Integration.

- Create npm run demo:clean script that does full V1-V3 real Featherless -> proof -> IPFS -> chain -> second agent
- Save fallback sanitized sample run in public/sample_run.json
- Write README with architecture, claim wording, setup guide, explorer links
- Cost & latency panel

FINAL VERIFY:
```
cat AutoEvolve_Test_Suite/FINAL_ACCEPTANCE.md
# Check all boxes:
# 3 versions, 2 proofs, 1 CID live, 1 tx on Base Sepolia, reward paid, second agent badge
```

Generate a 2-min demo script for judges.
```

---

## QUICK VERIFY ALL (after each phase)

Add this to your package.json scripts:

```json
{
  "scripts": {
    "test:phase1": "vitest run AutoEvolve_Test_Suite/scoring.biasfree.test.ts",
    "test:phase3": "vitest run AutoEvolve_Test_Suite/circuit.biasfree.test.ts",
    "test:phase4": "hardhat test AutoEvolve_Test_Suite/contracts.biasfree.test.ts",
    "test:phase5": "vitest run AutoEvolve_Test_Suite/ipfs.memory.biasfree.test.ts",
    "test:all": "vitest run AutoEvolve_Test_Suite/*.test.ts"
  }
}
```

Then after each phase prompt, say:
```
Run pnpm test:phaseX and fix until green. You are not allowed to edit AutoEvolve_Test_Suite/.
```
