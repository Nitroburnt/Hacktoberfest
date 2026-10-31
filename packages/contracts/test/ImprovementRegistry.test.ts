import { expect } from 'chai';
import { ethers } from 'hardhat';
import fixture from '../../zk/test/fixtures/validProof.json';

const REWARD = ethers.parseEther('0.0001');

async function deploy() {
  const [owner, agent, stranger] = await ethers.getSigners();
  const verifier = await (await ethers.getContractFactory('Groth16Verifier')).deploy();
  const registry = await (
    await ethers.getContractFactory('ImprovementRegistry')
  ).deploy(await verifier.getAddress(), REWARD);
  await owner.sendTransaction({ to: await registry.getAddress(), value: ethers.parseEther('0.001') });
  return { owner, agent, stranger, verifier, registry };
}

const submit = (
  registry: any,
  signer: any,
  id: string,
  oldScore = 60,
  newScore = 85,
  cid = 'bafy...cid1',
  overrides: Record<string, unknown> = {},
) =>
  registry
    .connect(signer)
    .submitImprovement(
      id,
      oldScore,
      newScore,
      cid,
      fixture.manifestCommitment,
      12345,
      111,
      222,
      fixture.proof,
      overrides,
    );

describe('ImprovementRegistry', () => {
  it('T4.1 pays the reward and emits the event', async () => {
    const { agent, registry } = await deploy();
    const registryAddress = await registry.getAddress();
    const escrowBefore = await ethers.provider.getBalance(registryAddress);
    const agentBefore = await ethers.provider.getBalance(agent.address);

    const tx = await submit(registry, agent, 'tx-1');
    const receipt = await tx.wait();
    const gasCost = receipt.gasUsed * receipt.gasPrice;

    await expect(tx).to.emit(registry, 'ImprovementVerified');
    const parsed = receipt.logs
      .map((log: any) => {
        try {
          return registry.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log: any) => log?.name === 'ImprovementVerified');
    expect(parsed.args.agent).to.equal(agent.address);
    expect(parsed.args.reward).to.equal(REWARD);

    const escrowAfter = await ethers.provider.getBalance(registryAddress);
    expect(escrowBefore - escrowAfter).to.equal(REWARD);
    // Balance delta is exactly +reward - gas, which proves the payout landed.
    const agentAfter = await ethers.provider.getBalance(agent.address);
    expect(agentBefore + REWARD - gasCost).to.equal(agentAfter);
    expect(await registry.rewardsByAgent(agent.address)).to.equal(REWARD);
    expect(await registry.totalRewardsPaid()).to.equal(REWARD);
  });

  it('records scores, cid and commitment', async () => {
    const { agent, registry } = await deploy();
    await submit(registry, agent, 'tx-2');
    const record = await registry.getRecord('tx-2');
    expect(record.oldScore).to.equal(60n);
    expect(record.newScore).to.equal(85n);
    expect(record.cid).to.equal('bafy...cid1');
    expect(record.manifestCommitment).to.equal(333n);
    expect(record.rubricDigest).to.equal(12345n);
    expect(await registry.transitionCount()).to.equal(1n);
  });

  it('blocks submissions while paused', async () => {
    const { owner, agent, registry } = await deploy();
    await registry.connect(owner).pause(true);
    await expect(submit(registry, agent, 'tx-3')).to.be.revertedWith('Paused');
    await registry.connect(owner).pause(false);
    await expect(submit(registry, agent, 'tx-3')).to.emit(registry, 'ImprovementVerified');
  });

  it('only the owner may pause, withdraw or change the reward', async () => {
    const { stranger, registry } = await deploy();
    await expect(registry.connect(stranger).pause(true)).to.be.revertedWith('Not owner');
    await expect(registry.connect(stranger).withdraw(1n)).to.be.revertedWith('Not owner');
    await expect(registry.connect(stranger).setRewardAmount(1n)).to.be.revertedWith('Not owner');
  });

  it('rejects out-of-range and equal scores', async () => {
    const { agent, registry } = await deploy();
    await expect(submit(registry, agent, 'tx-4', 80, 80)).to.be.revertedWith('Must improve');
    await expect(submit(registry, agent, 'tx-5', 60, 101)).to.be.revertedWith('Score out of range');
  });

  it('does not pay twice for the same transition', async () => {
    const { agent, registry } = await deploy();
    await submit(registry, agent, 'tx-6');
    await expect(submit(registry, agent, 'tx-6')).to.be.revertedWith('Transition used');
    expect(await registry.totalRewardsPaid()).to.equal(REWARD);
  });
});
