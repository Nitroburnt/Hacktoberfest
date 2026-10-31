
// Phase 4 Contract Bias-Free Tests (Hardhat)
// Run with: npx hardhat test

import { expect } from "chai";
import { ethers } from "hardhat";

describe("ImprovementRegistry - Bias Free", function() {
  let verifier, registry, owner, agent;
  const reward = ethers.parseEther("0.0001");

  beforeEach(async () => {
    [owner, agent] = await ethers.getSigners();
    const Verifier = await ethers.getContractFactory("Groth16Verifier");
    verifier = await Verifier.deploy();
    const Registry = await ethers.getContractFactory("ImprovementRegistry");
    registry = await Registry.deploy(await verifier.getAddress(), reward);
    await owner.sendTransaction({to: await registry.getAddress(), value: ethers.parseEther("0.001")});
  });

  it("T4.2 Replay protection", async () => {
    // use valid proof fixture from packages/zk/test/fixtures/validProof.json
    const fixture = require("../../packages/zk/test/fixtures/validProof.json");
    const tx = await registry.connect(agent).submitImprovement(
      "transition-001", 60,85, "bafy...cid1", fixture.manifestCommitment, 12345, 111,222, fixture.proof
    );
    await expect(
      registry.connect(agent).submitImprovement("transition-001",60,85,"bafy...cid1", fixture.manifestCommitment,12345,111,222, fixture.proof)
    ).to.be.revertedWith("Transition used");
  });

  it("T4.3 Invalid proof reverts", async () => {
    const fakeProof = {a: [0,0], b: [[0,0],[0,0]], c: [0,0]};
    await expect(
      registry.connect(agent).submitImprovement("t2",60,85,"bafy...cid", 333,12345,111,222, fakeProof)
    ).to.be.reverted;
  });

  it("T4.4 Decreasing scores revert before verifier", async () => {
    const fixture = require("../../packages/zk/test/fixtures/validProof.json");
    await expect(
      registry.connect(agent).submitImprovement("t3",85,60,"bafy...cid", 333,12345,111,222, fixture.proof)
    ).to.be.revertedWith("Must improve");
  });

  it("T4.7 CID stored", async () => {
    const fixture = require("../../packages/zk/test/fixtures/validProof.json");
    await registry.connect(agent).submitImprovement("t4",60,85,"bafybeigdyr...", 333,12345,111,222, fixture.proof);
    const rec = await registry.getRecord("t4");
    expect(rec.cid).to.equal("bafybeigdyr...");
  });
});
