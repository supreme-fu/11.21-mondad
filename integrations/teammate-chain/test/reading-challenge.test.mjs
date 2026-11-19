import assert from 'node:assert/strict';
import { after, before, beforeEach, afterEach, test } from 'node:test';
import { Wallet, id, parseEther, ZeroHash } from 'ethers';
import { compile } from '../scripts/compile.mjs';
import { createLocalEnvironment } from '../scripts/local-chain.mjs';
import { achievementTypes, enrollmentTypes } from '../scripts/attestations.mjs';

let env;
let snapshot;
let artifacts;
before(async () => { artifacts = compile(); env = await createLocalEnvironment(artifacts); });
beforeEach(async () => { snapshot = await env.provider.send('evm_snapshot', []); });
afterEach(async () => {
  await env.provider.send('evm_revert', [snapshot]);
  // Ganache restores blocks on revert, but its wall-clock offset needs resetting too.
  await env.provider.send('evm_setTime', [(await env.now()) * 1000]);
});
after(async () => { if (env) { await env.provider.destroy(); await env.rpc.disconnect(); } });

async function rejectsWith(operation, contract, errorName) {
  await assert.rejects(operation, (error) => {
    const data = error.data ?? error.info?.error?.data?.result;
    assert.equal(contract.interface.parseError(data)?.name, errorName, error.shortMessage);
    return true;
  });
}

async function activeCampaign(overrides = {}, enrollmentOverrides = {}) {
  const campaign = await env.createCampaign(overrides);
  await env.join(campaign.campaignId, env.reader, enrollmentOverrides);
  await env.advanceTo(campaign.config.startsAt + 10);
  return campaign;
}

test('sponsor fully funds immutable campaign terms; joining costs no reward tokens', async () => {
  const { campaignId, budget, config } = await activeCampaign();
  assert.equal(await env.token.balanceOf(await env.hub.getAddress()), budget);
  assert.equal(await env.token.balanceOf(await env.reader.getAddress()), 0n);
  const campaign = await env.hub.getCampaign(campaignId);
  assert.equal(campaign.joined, 1n);
  assert.equal(campaign.config.rulesHash, config.rulesHash);
  assert.equal(campaign.remainingBudget, budget);
});

test('review and reading rewards stack in either order, with one badge', async () => {
  for (const order of [[1, 0], [0, 1]]) {
    const { campaignId, budget } = await activeCampaign();
    const beforeBalance = await env.token.balanceOf(await env.reader.getAddress());
    for (const kind of order) {
      const { achievement, signature } = await env.proof(campaignId, kind);
      await (await env.hub.connect(env.reader).claim(achievement, signature)).wait();
      await rejectsWith(() => env.hub.connect(env.reader).claim.staticCall(achievement, signature), env.hub, 'AlreadyClaimed');
    }
    assert.equal(await env.token.balanceOf(await env.reader.getAddress()) - beforeBalance, parseEther('12'));
    assert.equal((await env.hub.getCampaign(campaignId)).remainingBudget, budget - parseEther('12'));
  }
  assert.equal(await env.badge.balanceOf(await env.reader.getAddress()), 2n);
});

test('review alone grants tokens and no badge, with no reading threshold', async () => {
  const { campaignId } = await activeCampaign();
  const { achievement, signature } = await env.proof(campaignId, 1, { coverageBps: 0, lastChapterCompleted: false });
  await (await env.hub.connect(env.reader).claim(achievement, signature)).wait();
  assert.equal(await env.badge.balanceOf(await env.reader.getAddress()), 0n);
  assert.equal(await env.token.balanceOf(await env.reader.getAddress()), parseEther('2'));
});

test('reading requires at least 80 percent AND the last chapter', async () => {
  const { campaignId } = await activeCampaign();
  for (const overrides of [
    { coverageBps: 7999, lastChapterCompleted: true },
    { coverageBps: 8000, lastChapterCompleted: false },
    { coverageBps: 10000, lastChapterCompleted: false },
  ]) {
    const { achievement, signature } = await env.proof(campaignId, 0, overrides);
    await rejectsWith(() => env.hub.connect(env.reader).claim.staticCall(achievement, signature), env.hub, 'ReadingIncomplete');
  }
  assert.equal(await env.hub.claimed(campaignId, await env.reader.getAddress(), 0), false);
});

test('claims require authenticated enrollment and caller ownership', async () => {
  const { campaignId } = await activeCampaign();
  const { achievement, signature } = await env.proof(campaignId);
  await rejectsWith(() => env.hub.connect(env.other).claim.staticCall(achievement, signature), env.hub, 'InvalidAchievement');
  const unregistered = await env.proof(campaignId, 0, { reader: await env.other.getAddress() });
  await rejectsWith(() => env.hub.connect(env.other).claim.staticCall(unregistered.achievement, unregistered.signature), env.hub, 'InvalidAchievement');
});

test('invalid, tampered, cross-chain and cross-contract signatures are rejected', async () => {
  const { campaignId } = await activeCampaign();
  const { achievement, signature } = await env.proof(campaignId);
  const wrongSigner = await Wallet.createRandom().signTypedData(env.domain, achievementTypes, achievement);
  const wrongChain = await env.attestor.signTypedData({ ...env.domain, chainId: 143 }, achievementTypes, achievement);
  const wrongContract = await env.attestor.signTypedData({ ...env.domain, verifyingContract: await env.token.getAddress() }, achievementTypes, achievement);
  for (const invalidSignature of [wrongSigner, wrongChain, wrongContract, '0x1234']) {
    await rejectsWith(() => env.hub.connect(env.reader).claim.staticCall(achievement, invalidSignature), env.hub, 'InvalidSignature');
  }
  await rejectsWith(() => env.hub.connect(env.reader).claim.staticCall({ ...achievement, coverageBps: 9000 }, signature), env.hub, 'InvalidSignature');
});

test('proofs cannot be replayed into another campaign', async () => {
  const first = await activeCampaign();
  const firstProof = await env.proof(first.campaignId);
  const second = await activeCampaign();
  const altered = { ...firstProof.achievement, campaignId: second.campaignId, occurredAt: await env.now() };
  await rejectsWith(() => env.hub.connect(env.reader).claim.staticCall(altered, firstProof.signature), env.hub, 'InvalidSignature');
});

test('subject and wallet enrollment are unique per campaign; capacity is enforced', async () => {
  const { campaignId, config } = await activeCampaign({ capacity: 2 });
  const enrollment = { campaignId, reader: await env.other.getAddress(), subject: env.subject, alreadyCompleted: false, deadline: config.endsAt };
  const signature = await env.attestor.signTypedData(env.domain, enrollmentTypes, enrollment);
  await rejectsWith(() => env.hub.connect(env.other).join.staticCall(enrollment, signature), env.hub, 'InvalidEnrollment');
  await env.join(campaignId, env.other, { subject: id('second-reader') });
  const third = await env.provider.getSigner(3);
  const thirdEnrollment = { ...enrollment, reader: await third.getAddress(), subject: id('third-reader') };
  const thirdSignature = await env.attestor.signTypedData(env.domain, enrollmentTypes, thirdEnrollment);
  await rejectsWith(() => env.hub.connect(third).join.staticCall(thirdEnrollment, thirdSignature), env.hub, 'CapacityReached');
});

test('invalid enrollment signatures and tampered baseline are rejected', async () => {
  const { campaignId, config } = await env.createCampaign();
  const enrollment = { campaignId, reader: await env.reader.getAddress(), subject: env.subject, alreadyCompleted: true, deadline: config.endsAt };
  const signature = await env.attestor.signTypedData(env.domain, enrollmentTypes, enrollment);
  await rejectsWith(() => env.hub.connect(env.reader).join.staticCall({ ...enrollment, alreadyCompleted: false }, signature), env.hub, 'InvalidSignature');
  await rejectsWith(() => env.hub.connect(env.reader).join.staticCall(enrollment, '0x'), env.hub, 'InvalidSignature');
});

test('already completed readers can earn review rewards but cannot earn a new reading badge', async () => {
  const { campaignId } = await activeCampaign({}, { alreadyCompleted: true });
  const reading = await env.proof(campaignId, 0);
  await rejectsWith(() => env.hub.connect(env.reader).claim.staticCall(reading.achievement, reading.signature), env.hub, 'AlreadyCompletedBeforeJoining');
  const review = await env.proof(campaignId, 1);
  await (await env.hub.connect(env.reader).claim(review.achievement, review.signature)).wait();
});

test('zero evidence, wrong subject and out-of-range coverage are rejected', async () => {
  const { campaignId } = await activeCampaign();
  for (const overrides of [{ evidenceHash: ZeroHash }, { subject: id('wrong-person') }, { coverageBps: 10001 }]) {
    const { achievement, signature } = await env.proof(campaignId, 0, overrides);
    await rejectsWith(() => env.hub.connect(env.reader).claim.staticCall(achievement, signature), env.hub, 'InvalidAchievement');
  }
});

test('completion must happen after joining, during the activity, and in the past', async () => {
  const { campaignId, config } = await activeCampaign();
  for (const occurredAt of [config.startsAt - 1, config.endsAt + 1, await env.now() + 1]) {
    const { achievement, signature } = await env.proof(campaignId, 1, { occurredAt });
    await rejectsWith(() => env.hub.connect(env.reader).claim.staticCall(achievement, signature), env.hub, 'InvalidAchievement');
  }
  const late = await env.createCampaign();
  await env.advanceTo(late.config.startsAt + 100);
  await env.join(late.campaignId);
  const proof = await env.proof(late.campaignId, 1, { occurredAt: late.config.startsAt + 50 });
  await rejectsWith(() => env.hub.connect(env.reader).claim.staticCall(proof.achievement, proof.signature), env.hub, 'InvalidAchievement');
});

test('expired attestations are rejected; eligible activity can be claimed in the grace period', async () => {
  const { campaignId, config } = await activeCampaign();
  const expired = await env.proof(campaignId, 1, { deadline: await env.now() - 1 });
  await rejectsWith(() => env.hub.connect(env.reader).claim.staticCall(expired.achievement, expired.signature), env.hub, 'Expired');
  const valid = await env.proof(campaignId, 1);
  await env.advanceTo(config.endsAt + 1);
  await (await env.hub.connect(env.reader).claim(valid.achievement, valid.signature)).wait();
  const reading = await env.proof(campaignId, 0, { occurredAt: config.endsAt });
  await env.advanceTo(config.claimDeadline + 1);
  await rejectsWith(() => env.hub.connect(env.reader).claim.staticCall(reading.achievement, reading.signature), env.hub, 'Expired');
});

test('enrollment closes at activity end and enrollment credentials expire', async () => {
  const { campaignId, config } = await env.createCampaign();
  const enrollment = { campaignId, reader: await env.reader.getAddress(), subject: env.subject, alreadyCompleted: false, deadline: await env.now() - 1 };
  const signature = await env.attestor.signTypedData(env.domain, enrollmentTypes, enrollment);
  await rejectsWith(() => env.hub.connect(env.reader).join.staticCall(enrollment, signature), env.hub, 'Expired');
  await env.advanceTo(config.endsAt);
  const late = { ...enrollment, deadline: config.claimDeadline };
  const lateSignature = await env.attestor.signTypedData(env.domain, enrollmentTypes, late);
  await rejectsWith(() => env.hub.connect(env.reader).join.staticCall(late, lateSignature), env.hub, 'Expired');
});

test('only the sponsor can recover remaining funds after claims close, with campaign isolation', async () => {
  const first = await activeCampaign();
  const review = await env.proof(first.campaignId, 1);
  await (await env.hub.connect(env.reader).claim(review.achievement, review.signature)).wait();
  const second = await env.createCampaign({ endsAt: first.config.endsAt + 3000, claimDeadline: first.config.claimDeadline + 3000 });
  await rejectsWith(() => env.hub.withdrawRemainder.staticCall(first.campaignId), env.hub, 'WithdrawalUnavailable');
  await env.advanceTo(first.config.claimDeadline + 1);
  await rejectsWith(() => env.hub.connect(env.other).withdrawRemainder.staticCall(first.campaignId), env.hub, 'WithdrawalUnavailable');
  const beforeBalance = await env.token.balanceOf(await env.sponsor.getAddress());
  await (await env.hub.withdrawRemainder(first.campaignId)).wait();
  assert.equal(await env.token.balanceOf(await env.sponsor.getAddress()) - beforeBalance, first.budget - parseEther('2'));
  assert.equal(await env.token.balanceOf(await env.hub.getAddress()), second.budget);
  await rejectsWith(() => env.hub.withdrawRemainder.staticCall(first.campaignId), env.hub, 'WithdrawalUnavailable');
});

test('badge metadata and artwork are on-chain; transfer, approval and arbitrary mint fail', async () => {
  const { campaignId } = await activeCampaign();
  const proof = await env.proof(campaignId);
  await (await env.hub.connect(env.reader).claim(proof.achievement, proof.signature)).wait();
  const reader = await env.reader.getAddress();
  const other = await env.other.getAddress();
  const badge = env.badge.connect(env.reader);
  const uri = await badge.tokenURI(1);
  const metadata = JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString());
  assert.equal(metadata.name, 'Read Together #1');
  assert.match(metadata.image, /^data:image\/svg\+xml;base64,/);
  assert.equal(await badge.ownerOf(1), reader);
  await rejectsWith(() => badge.transferFrom.staticCall(reader, other, 1), badge, 'Soulbound');
  await rejectsWith(() => badge['safeTransferFrom(address,address,uint256)'].staticCall(reader, other, 1), badge, 'Soulbound');
  await rejectsWith(() => badge.approve.staticCall(other, 1), badge, 'Soulbound');
  await rejectsWith(() => badge.setApprovalForAll.staticCall(other, true), badge, 'Soulbound');
  await rejectsWith(() => badge.mint.staticCall(reader, { campaignId, bookHash: id('book'), evidenceHash: id('evidence'), completedAt: 1, coverageBps: 8000 }), badge, 'OnlyIssuer');
  assert.equal(await badge.tokenURI(1), uri);
});


test('invalid campaign terms and unknown campaigns fail', async () => {
  const { config } = await env.createCampaign();
  for (const overrides of [
    { capacity: 0 }, { bookHash: ZeroHash }, { rulesHash: ZeroHash },
    { endsAt: config.startsAt }, { claimDeadline: config.endsAt },
    { readingReward: 0 }, { reviewReward: 0 }, { startsAt: 0 },
  ]) {
    await rejectsWith(() => env.hub.createCampaign.staticCall({ ...config, ...overrides }), env.hub, 'InvalidConfiguration');
  }
  await rejectsWith(() => env.hub.getCampaign(999), env.hub, 'UnknownCampaign');
});

test('rejected claims roll back state and a later valid claim succeeds', async () => {
  const { campaignId, budget } = await activeCampaign();
  const incomplete = await env.proof(campaignId, 0, { lastChapterCompleted: false });
  await assert.rejects(async () => {
    const transaction = await env.hub.connect(env.reader).claim(incomplete.achievement, incomplete.signature, { gasLimit: 700000 });
    await transaction.wait();
  });
  assert.equal((await env.hub.getCampaign(campaignId)).remainingBudget, budget);
  assert.equal(await env.badge.totalSupply(), 0n);
  const valid = await env.proof(campaignId, 0);
  await (await env.hub.connect(env.reader).claim(valid.achievement, valid.signature)).wait();
  assert.equal(await env.badge.totalSupply(), 1n);
});
