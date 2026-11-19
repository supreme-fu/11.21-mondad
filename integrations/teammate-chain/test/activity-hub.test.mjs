import assert from 'node:assert/strict';
import { test } from 'node:test';
import { id, parseEther } from 'ethers';
import { compile } from '../scripts/compile.mjs';
import { createLocalEnvironment } from '../scripts/local-chain.mjs';
import { joinTypes, proofTypes } from '../scripts/activity-attestations.mjs';

test('activity pools, membership and claim proofs remain independent across campaigns', async () => {
  const env = await createLocalEnvironment(compile());
  try {
    const hub = await env.deploy('ActivityHub', [await env.token.getAddress(), env.attestor.address]);
    const host = await env.sponsor.getAddress();
    const member = await env.reader.getAddress();
    const domain = { name: 'DoSomethingActivities', version: '1', chainId: 10143, verifyingContract: await hub.getAddress() };
    const endsAt = await env.now() + 3600;
    const claimDeadline = endsAt + 60;
    const completionReward = parseEther('10');
    const contributionReward = parseEther('2');
    const budget = (completionReward + contributionReward) * 2n;
    await (await env.token.approve(hub.target, budget * 2n)).wait();
    for (const [name, minScore, requiresFinalCheck] of [['reading', 8000, true], ['photo', 10000, false]]) {
      await (await hub.publish({ rulesHash: id(name), endsAt, claimDeadline, capacity: 2, minScore, requiresFinalCheck, completionReward, contributionReward })).wait();
    }
    for (const activityId of [1, 2]) {
      const signature = await env.attestor.signTypedData(domain, joinTypes, { activityId, member, deadline: endsAt });
      await (await hub.connect(env.reader).join(activityId, endsAt, signature)).wait();
    }
    const baseProof = { member, kind: 0, score: 8000, finalCheck: true, occurredAt: await env.now(), deadline: claimDeadline, evidenceHash: id('mock evidence') };
    const withSignature = async (fields) => {
      const proof = { ...baseProof, ...fields };
      return [proof, await env.attestor.signTypedData(domain, proofTypes, proof)];
    };
    const [unqualified, unqualifiedSignature] = await withSignature({ activityId: 1, finalCheck: false });
    await assert.rejects(() => hub.connect(env.reader).claim.staticCall(unqualified, unqualifiedSignature), /Incomplete/);
    const [reading, readingSignature] = await withSignature({ activityId: 1 });
    await assert.rejects(() => hub.connect(env.reader).claim.staticCall({ ...reading, activityId: 2 }, readingSignature), /InvalidProof/);
    await (await hub.connect(env.reader).claim(reading, readingSignature)).wait();
    await assert.rejects(() => hub.connect(env.reader).claim.staticCall(reading, readingSignature), /AlreadyClaimed/);
    assert.equal(await hub.ownerOf(1), member);
    assert.equal(await hub.badgeActivity(1), 1n);
    await assert.rejects(() => hub.connect(env.reader).transferFrom.staticCall(member, host, 1), /LockedBadge/);
    const [contribution, contributionSignature] = await withSignature({ activityId: 2, kind: 1, score: 0, finalCheck: false });
    await (await hub.connect(env.reader).claim(contribution, contributionSignature)).wait();
    assert.equal(await hub.balanceOf(member), 1n);
    assert.equal((await hub.activities(1)).remaining, budget - completionReward);
    assert.equal((await hub.activities(2)).remaining, budget - contributionReward);
    await env.advanceTo(claimDeadline + 5);
    await assert.rejects(() => hub.connect(env.reader).returnPool.staticCall(2), /InvalidMember/);
    await (await hub.returnPool(2)).wait();
    assert.equal((await hub.activities(2)).remaining, 0n);
    assert.equal((await hub.activities(1)).remaining, budget - completionReward);
  } finally {
    await env.provider.destroy();
    await env.rpc.disconnect();
  }
});
