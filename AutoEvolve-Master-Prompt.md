
# MASTER PROMPT: AutoEvolve Protocol - Decentralized, ZK-Attested Self-Improving Agent

## ROLE
You are a Senior Staff Engineer expert in: TypeScript Monorepos, Solidity / EVM, Circom & snarkjs ZK circuits, IPFS/Filecoin (Storacha/Pinata), Next.js 14, Docker-isolated evaluation, and LLM Agentic loops using OpenAI-compatible APIs (Featherless).

Your goal is to build a complete, judging-ready, open-source implementation of **AutoEvolve Protocol**. You must follow the phases strictly, do not skip testing. Do NOT use Streamlit. Use Next.js.

## CORE PROBLEM STATEMENT (CORRECTED)
Current self-improving agents operate in closed loops with no proof that improvement actually happened. AutoEvolve must:
1. Execute V1 -> Critique -> V2 -> Critique -> V3 loop with deterministic benchmark scoring.
2. Prove cryptographically that Score(Vn+1) > Score(Vn) using a ZK circuit WITHOUT revealing private witness (metric counts) or system prompts.
3. Publish sanitized execution diffs, critiques, embeddings to IPFS, and anchor CID on-chain on Base Sepolia.
4. Verify ZK proof on-chain, record memory, and pay micro-reward from escrow.
5. Allow a second independent agent to query the on-chain registry, fetch CIDs, and reuse lessons.
6. Show everything on a real-time developer dashboard.

### IMPORTANT CORRECTIONS TO ORIGINAL DOC
- DO NOT use EZKL for MVP (it proves model inference, not score arithmetic; Featherless is remote). USE Circom + snarkjs Groth16 for score improvement proof. Keep SP1 as stretch goal noted in README.
- DO NOT use Streamlit. Use Next.js 14 App Router + Tailwind + React Flow + Monaco Editor.
- Score claim must be narrow: "Proof of Score Arithmetic Validity & Strict Increase", NOT "Proof that LLM generated code".
- DataDAO = Append-only Registry + IPFS convention for MVP. No governance token needed.
- All model calls: temperature=0.0, top_p=1.0, pinned model IDs, logged hashes. This is reproducibility, not bit-identical guarantee.
- Security: Docker no-network sandbox for code execution, no secrets in IPFS, bounded rewards, nonReentrant.

## FINAL TECH STACK (LOCKED)
- Monorepo: pnpm + Turborepo
- Apps: apps/web (Next.js 14, Tailwind, React Flow, Monaco Diff, viem/wagmi), apps/worker (Node.js/TS, Fastify, SSE)
- Packages: packages/contracts (Hardhat 3, Solidity 0.8.24, OpenZeppelin), packages/zk (Circom 2, snarkjs), packages/shared (schemas, types)
- Benchmark: Docker image python:3.11-slim, pytest, Ruff, isolated runner
- LLM: Featherless API via openai SDK with baseURL=https://api.featherless.ai/v1 . Models: Qwen/Qwen2.5-Coder-32B-Instruct (Generator), deepseek-ai/DeepSeek-R1 or DeepSeek-V4-Flash (Critic). Fallback Qwen/Qwen3-32B.
- Storage: Storacha w3up-client primary, Pinata fallback, both verified via fetch-back.
- Chain: Base Sepolia (ChainID 84532). Contracts: Groth16Verifier.sol (auto-generated) + ImprovementRegistry.sol
- Embeddings: Local @xenova/transformers (all-MiniLM-L6-v2) to avoid extra LLM cost for memory search.

---

### PHASE 0: PROJECT FOUNDATION & DEMO FREEZE
**Goal:** Freeze what judges will see.

**Tasks:**
0.1 Init pnpm monorepo with Turborepo. Structure: apps/web, apps/worker, packages/contracts, packages/zk, packages/shared, benchmark/
0.2 Create .env.example only. No secrets in repo. Add .gitignore for .env, ptau, zkey, wallet.
0.3 Define frozen task: CSV Transaction Importer (task_spec.json) - functions: parseCSV, validateDate, dedup, handleMalformed. Provide reference solution that passes 100%.
0.4 Freeze rubric: Score = (functional_pass * 8) + (edge_pass * 3) + static_quality (0-5). Max 100. Safety gate = no banned imports (os, subprocess, socket), timeout 5s, no network.
0.5 Freeze benchmark digest: SHA256 of rubric + test files. Compute and store.
0.6 Setup Docker benchmark runner: accepts code file, runs pytest suite, returns JSON report.
0.7 Write shared Zod schemas: RunRecord, SanitizedManifest (schemaVersion=1), CritiqueJSON, ScoreReport.

**Deliverable:** Monorepo compiles, docker run python benchmark --code sample.py returns score JSON.

**TESTING (Phase 0):**
- T0.1: Same candidate file returns identical score on 3 consecutive runs.
- T0.2: Reference solution scores 100, safety gate PASS.
- T0.3: Malicious file with `import os` fails safety gate.
- T0.4: Rubric digest changes if test file edited (tamper detection).

### PHASE 1: BENCHMARK & SCORING ENGINE
**Tasks:**
1.1 Implement benchmark/tests/: 10 functional tests + 5 edge tests + lint gate. Hide private tests from LLM context (only failure summaries exposed).
1.2 Implement scorer.ts: Input = test JSON, Output = {functional: 0-10, edge: 0-5, static: 0-5, total: 0-100, safety: bool}. Must be integer only.
1.3 Implement changelog generator: git diff style between V1/V2/V3 using `diff` package, not LLM.
1.4 Create embedding for failure lessons: local transformer, store vector in manifest.
1.5 Canonical JSON serialization: deterministic stringify (sorted keys) for CID and proof commitment.

**TESTING (Phase 1):**
- T1.1: Scoring formula: 10 functional + 5 edge + 5 static = 100 exactly.
- T1.2: Edge case: timeout after 5s returns safety FAIL, score 0.
- T1.3: Changelog shows real file diff, not hallucinated text.
- T1.4: Canonical JSON same object different key order => same hash/CID input.
- T1.5: Provided V1_buggy.csv_importer scores < 60, V2_fixed scores > V1, V3 scores >= V2.

### PHASE 2: AGENTIC LOOP - GENERATE-CRITIQUE-REVISE (Featherless Adversarial Separation)
**Tasks:**
2.1 Implement Featherless client: openai SDK, baseURL, temp 0.0, log: request_id, model_id, prompt_digest, response_hash, tokens, cost.
2.2 Generator Agent: Prompt template = task_spec + previous_code + sanitized_critique only. No hidden tests. Output must be single Python file. Bounded to 3000 output tokens.
2.3 Critic Agent (separate model): Input = rubric summary + sanitized test failure IDs + stack traces (redacted). Output = strict JSON schema: {defect, evidence, severity (low/med/high), suggested_change, confidence 0-1}. Validate with Zod, one repair retry on invalid JSON.
2.4 Loop Orchestrator (worker): V1 generate -> evaluate -> critique -> V2 generate -> evaluate -> critique -> V3. Stop early if no improvement or safety fail. Persist private RunRecord (raw prompts/responses) in local DB (sqlite/json), never publish.
2.5 Cost guard: Track usage.cost, stop if > $10 app-level ceiling.
2.6 Create second-agent retrieval stub: query function that will later fetch from chain.

**TESTING (Phase 2):**
- T2.1: Two model IDs are different (generator != critic) logged.
- T2.2: Critic receives NO hidden test bodies, only IDs + failure summary (privacy check).
- T2.3: Malformed critic JSON triggers exactly 1 repair call then fails gracefully.
- T2.4: Full loop with mocked LLM responses produces V1/V2/V3 and scores increase.
- T2.5: Cost tracker sums correctly, stops new run after ceiling.
- T2.6: Prompt digest + response hash logged for reproducibility.

### PHASE 3: ZK CIRCUIT - PROOF OF IMPROVEMENT (Circom)
**Tasks:**
3.1 Write circuit improvement.circom: Private inputs: f1_old, e1_old, s1_old, f1_new, e1_new, s1_new. Public inputs: oldScore, newScore, rubricDigest, versionCommitmentOld, versionCommitmentNew, transitionNonce, manifestCommitment. Constraints: oldScore = f_old*8 + e_old*3 + s_old, newScore = f_new*8 + e_new*3 + s_new, range checks (f 0-10, e 0-5, s 0-5, scores 0-100) using LessThan, check newScore > oldScore via comparator, version commitments match public. Use circomlib.
3.2 Compile, Powers of Tau: Use phase1 ptau 14, groth16 setup, generate verification key.
3.3 Implement witness builder in worker: from ScoreReport -> circuit inputs.
3.4 Implement prover: snarkjs groth16 fullProve, local verify.
3.5 Export Solidity verifier: snarkjs zkey export solidityverifier.
3.6 Invalid case tests: equal scores, decreasing scores, out-of-range scores must fail proving or local verify.

**TESTING (Phase 3):**
- T3.1: Valid transition (60 -> 85) generates proof and local verify PASS.
- T3.2: Equal scores (80 -> 80) must FAIL (constraint new > old).
- T3.3: Decreasing (90 -> 70) must FAIL.
- T3.4: Out-of-range private (f=15) must FAIL range check.
- T3.5: Tampered public signal (change oldScore) makes verify FAIL.
- T3.6: Proof generation time < 30s on laptop.

### PHASE 4: SMART CONTRACTS - VERIFIER + REGISTRY + REWARD ESCROW
**Tasks:**
4.1 Deploy Groth16Verifier.sol (auto-generated).
4.2 Write ImprovementRegistry.sol: 
 - state: verifier address, owner, paused, rewardAmount (0.0001 eth), mapping transitionId => bool used, mapping runId => Record {agent, oldScore, newScore, cid, manifestCommitment, timestamp}
 - function submitImprovement(transitionId, oldScore, newScore, cidString, manifestCommitment, rubricDigest, versionCommits, proof) external: checks: not paused, transitionId unused, oldScore<newScore, oldScore/newScore in range, CID commitment matches manifestCommitment (keccak256(cid) == commitment), calls verifier.verifyProof, writes record, emits ImprovementVerified(agent, transitionId, oldScore, newScore, cid, reward), pays msg.sender small reward via call (checks-effects-interactions, nonReentrant, balance check).
 - fund(), withdraw(), pause().
4.3 Hardhat deploy script to Base Sepolia: deploy verifier then registry, fund with 0.001 eth testnet.
4.4 Worker integration: after proof, upload to IPFS first, get CID, compute commitment, then call contract via viem.
4.5 Event indexing: viem getLogs for ImprovementVerified.

**TESTING (Phase 4):**
- T4.1: Valid proof + CID submits, emits event, reward paid (balance increase).
- T4.2: Replay same transitionId reverts.
- T4.3: Invalid proof reverts, no state change, no reward.
- T4.4: Decreasing scores revert before verifier call (gas save).
- T4.5: Pause blocks submissions.
- T4.6: Non-owner cannot withdraw.
- T4.7: CID string stored retrievable via getRecord.

### PHASE 5: DECENTRALIZED MEMORY - IPFS/DataDAO + SECOND AGENT REUSE
**Tasks:**
5.1 Sanitizer: From private RunRecord, create SanitizedManifest: drop raw prompts, system prompts, API keys, private tests. Keep: taskDigest, rubricDigest, model IDs, version hashes, diffs, scores, sanitized critique, failure lessons (redacted), embeddings, proof public inputs, CID refs, parentCID if inherited.
5.2 IPFS upload: Implement uploader.ts with Storacha primary. After upload, fetch via gateway (w3s.link/ipfs/CID) and validate schema + hash. Fallback to Pinata if Storacha fails. Return CID.
5.3 CID commitment: keccak256(CID string) or CID bytes -> manifestCommitment for contract.
5.4 Second Agent (Memory Consumer): Function `fetchRelevantMemories(newTaskDescription)`: queries contract events (last 50), fetches manifests from IPFS, computes cosine similarity between newTask embedding and stored failure lessons, ranks top 3, returns lessons + source CIDs.
5.5 Integration: First agent's V1 generation can optionally include inherited lessons if available.

**TESTING (Phase 5):**
- T5.1: Sanitized manifest contains NO system prompt substring or API key pattern.
- T5.2: Upload manifest -> fetch via CID -> content matches (roundtrip).
- T5.3: Second agent queries registry and finds first agent's CID (end-to-end).
- T5.4: Embedding similarity: query "CSV date validation fails" ranks relevant lesson > irrelevant.
- T5.5: Manifest schemaVersion validated, rejects invalid.
- T5.6: CID commitment keccak matches contract check.

### PHASE 6: DEVELOPER DASHBOARD (Next.js, NOT STREAMLIT)
**Tasks:**
6.1 App Router: / , /runs/[id] , /registry
6.2 UI Components: 
 - Run Timeline: SSE from worker showing stages (queued, generating V1, evaluating, critiquing, proving, publishing, settling) with latency.
 - Execution Tree: React Flow nodes V1->V2->V3 with edges labeled critique summary.
 - Metrics Panel: Score formula breakdown per version, component deltas, safety gate.
 - Diff Panel: Monaco Editor diff side-by-side V1 vs V2, V2 vs V3, plus auto-generated changelog.
 - Proof Panel: circuit version, public inputs, local verify status, on-chain verify status, proof gen time.
 - Memory & Settlement: CID with copy + gateway link + fetch button, inherited memory citations, Base Sepolia tx hash with explorer link, reward amount.
6.3 Backend: worker exposes /api/runs POST (start), GET /api/runs/:id/stream (SSE), GET /api/registry (reads contract events via viem).
6.4 Persistence: All state in sqlite, survives refresh.
6.5 Redaction: No raw prompts shown in browser.

**TESTING (Phase 6):**
- T6.1: Start new run from UI -> SSE events arrive in order.
- T6.2: Refresh browser -> run reconstructs from DB.
- T6.3: Monaco diff shows actual code change count >0 between V1/V2.
- T6.4: Proof panel shows green check for both local and on-chain.
- T6.5: CID link clickable, fetches valid JSON.
- T6.6: Second agent run shows "Memory reused badge" with parent CID.

### PHASE 7: INTEGRATION, E2E & DEMO REHEARSAL
**Tasks:**
7.1 One-click e2e script: npm run demo:clean -> freeze -> docker build -> deploy contracts (if not deployed) -> run full V1-V3 loop with real Featherless calls -> proof -> IPFS -> chain -> second agent reuse.
7.2 Pre-record fallback: Save sanitized sample run JSON + proof + tx hash for offline demo.
7.3 README: Setup guide, architecture diagram, claim wording (exact: "We prove score arithmetic increase, not LLM inference"), env setup, model verification command `curl /v1/models`, chain explorer links, license MIT.
7.4 Cost & latency dashboard: Show total tokens, cost, time per phase.

**TESTING (Phase 7 - Final Acceptance):**
- T7.1: Cold start (rm -rf node_modules, fresh env) completes e2e < 5 min for mocked models, < 10 min real models.
- T7.2: Second agent avoids failure recorded in first run's failure lesson (collective learning).
- T7.3: All env vars in .env.example, no secrets in repo (gitleaks scan).
- T7.4: Demo fallback loads without API keys or chain.
- T7.5: Judge checklist: 3 versions visible, 2 proofs verified, 1 CID live, 1 tx on Base Sepolia explorer, reward paid, second agent cited parent.

## DELIVERABLES CHECKLIST
- Monorepo with all packages
- Docker benchmark
- Circom circuit + zkey + verifier.sol
- Deployed contracts on Base Sepolia with verified source
- IPFS manifest retrievable
- Next.js dashboard live
- README + LICENSE + sample run
- All phase tests passing

## IMPORTANT PROMPTING RULES FOR CODE GENERATOR
- Do not hallucinate scores; always compute via scorer.ts.
- Do not put system prompts or secrets in public manifest.
- Always canonical JSON stringify before hashing.
- Use viem, not ethers v6, for contract interaction.
- Use pnpm workspaces.
- Every phase ends with testing commands: `pnpm test:phaseX`
