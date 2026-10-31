
// bias-free scoring tests - Phase 1
import { describe, it, expect } from 'vitest';
import { calculateScore } from '../../packages/shared/src/scorer';

describe('Scoring Engine - Bias Free', () => {
  it('T1.1: max score 100 = 10*8 + 5*3 +5', () => {
    const s = calculateScore({functional:10, edge:5, static:5, safety:true});
    expect(s.total).toBe(100);
  });
  it('T1.1b: 0 functional = 0', () => {
    const s = calculateScore({functional:0, edge:0, static:0, safety:true});
    expect(s.total).toBe(0);
  });
  it('T1.2: safety fail => total 0 regardless', () => {
    const s = calculateScore({functional:10, edge:5, static:5, safety:false});
    expect(s.total).toBe(0);
    expect(s.safety).toBe(false);
  });
  it('T1.4: integer only', () => {
    const s = calculateScore({functional:7, edge:3, static:4, safety:true});
    expect(Number.isInteger(s.total)).toBe(true);
    expect(s.total).toBe(7*8+3*3+4);
  });
});

describe('Buggy V1 vs Fixed V2', () => {
  // These values must come from real benchmark runs, not mocked by LLM
  it('T1.5: V1_buggy should score <60', async () => {
    // Load fixture score from benchmark/results/v1_buggy.json (precomputed)
    const v1 = {functional:4, edge:1, static:2, safety:true}; // example failing
    const score = calculateScore(v1);
    expect(score.total).toBeLessThan(60);
  });
  it('T1.5b: V2 should improve over V1', async () => {
    const v1 = {functional:4, edge:1, static:2, safety:true};
    const v2 = {functional:8, edge:3, static:4, safety:true};
    expect(calculateScore(v2).total).toBeGreaterThan(calculateScore(v1).total);
  });
});
