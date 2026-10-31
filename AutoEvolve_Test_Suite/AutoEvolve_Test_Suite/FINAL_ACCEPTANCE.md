
# FINAL ACCEPTANCE CHECKLIST - JUDGE READY (Phase 7)

This file is bias-free: it defines observable outcomes, not LLM internals.

- [ ] T0.1 Deterministic scoring: 3 runs same file -> same score
- [ ] T0.2 Reference solution 100%
- [ ] T1.1 Max 100 formula correct
- [ ] T1.5 V1 <60, V2 > V1, V3 >= V2 (real benchmark, not mocked by agent)
- [ ] T2.1 Generator model != Critic model (check logs)
- [ ] T2.2 Critic input does NOT contain hidden test bodies
- [ ] T3.1 Valid proof verifies locally
- [ ] T3.2 Equal scores fail
- [ ] T3.3 Decreasing fails
- [ ] T4.1 Valid proof + CID -> event ImprovementVerified + reward paid (check Base Sepolia explorer)
- [ ] T4.2 Replay same transitionId reverts
- [ ] T5.1 No secrets in IPFS JSON
- [ ] T5.2 CID fetch returns same content
- [ ] T5.3 Second agent fetches first agent CID from chain
- [ ] T6.1 SSE order correct
- [ ] T6.3 Monaco diff shows real change count
- [ ] T7.1 Cold start e2e <10 min real models
- [ ] T7.2 Second agent avoids previous failure
- [ ] T7.4 Fallback sample run loads without keys

Judge-visible artifacts:
1. Execution tree with 3 versions
2. Side-by-side diff V1->V2, V2->V3
3. Proof panel: local PASS + on-chain PASS
4. CID clickable, gateway fetch OK
5. Base Sepolia tx: https://sepolia.basescan.org/tx/<hash>
6. Reward event: agent wallet +0.0001 ETH testnet
7. Second agent run shows inherited CID badge

Claim wording to use in pitch:
"AutoEvolve records each version and its benchmark evidence, proves that the published integer score increased under a fixed rubric (Score(Vn+1) > Score(Vn)), and settles a testnet reward. The proof hides private metric witness and public memory omits system prompts. We do NOT claim proof of LLM inference."

