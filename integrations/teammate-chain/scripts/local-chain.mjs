import ganache from 'ganache';
import { BrowserProvider, Contract, ContractFactory, Wallet, id, parseEther } from 'ethers';
import { compile } from './compile.mjs';
import { attestationDomain, enrollmentTypes, achievementTypes } from './attestations.mjs';

export async function createLocalEnvironment(artifacts = compile()) {
  const rpc = ganache.provider({
    logging: { quiet: true },
    chain: { chainId: 10143, hardfork: 'shanghai' },
    wallet: { totalAccounts: 8 },
  });
  const provider = new BrowserProvider(rpc, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = 10;
  const sponsor = await provider.getSigner(0);
  const reader = await provider.getSigner(1);
  const other = await provider.getSigner(2);
  // Local-only, ephemeral signing key. Never printed or written to disk.
  const attestor = Wallet.createRandom();
  const deploy = async (name, args = []) => {
    const artifact = artifacts[name];
    const contract = await new ContractFactory(artifact.abi, artifact.bytecode, sponsor).deploy(...args);
    await contract.waitForDeployment();
    return contract;
  };
  const token = await deploy('DemoRewardToken', [await sponsor.getAddress(), parseEther('1000000')]);
  const hub = await deploy('ReadingChallenge', [await token.getAddress(), attestor.address]);
  const badge = new Contract(await hub.badge(), artifacts.ReadingBadge.abi, provider);
  const domain = attestationDomain(10143, await hub.getAddress());
  const subject = id('local-demo-campaign-reader');
  const now = async () => Number((await provider.getBlock('latest')).timestamp);
  const advanceTo = async (timestamp) => {
    await provider.send('evm_setTime', [timestamp * 1000]);
    await provider.send('evm_mine', []);
  };
  const createCampaign = async (overrides = {}) => {
    const start = await now() + 10;
    const config = {
      bookHash: id('demo-book-edition-1'),
      rulesHash: id('coverage>=8000 AND lastChapter; eligible review; fixed rewards; v1'),
      startsAt: start,
      endsAt: start + 1000,
      claimDeadline: start + 1500,
      capacity: 3,
      readingReward: parseEther('10'),
      reviewReward: parseEther('2'),
      ...overrides,
    };
    const budget = BigInt(config.capacity) * (config.readingReward + config.reviewReward);
    await (await token.approve(await hub.getAddress(), budget)).wait();
    await (await hub.createCampaign(config)).wait();
    return { campaignId: await hub.campaignCount(), config, budget };
  };
  const join = async (campaignId, signer = reader, overrides = {}) => {
    const campaign = await hub.getCampaign(campaignId);
    const enrollment = {
      campaignId,
      reader: await signer.getAddress(),
      subject,
      alreadyCompleted: false,
      deadline: campaign.config.endsAt,
      ...overrides,
    };
    const signature = await attestor.signTypedData(domain, enrollmentTypes, enrollment);
    await (await hub.connect(signer).join(enrollment, signature)).wait();
    return enrollment;
  };
  const proof = async (campaignId, kind = 0, overrides = {}) => {
    const campaign = await hub.getCampaign(campaignId);
    const achievement = {
      campaignId,
      reader: await reader.getAddress(),
      subject,
      kind,
      coverageBps: 8000,
      lastChapterCompleted: true,
      evidenceHash: id(`local-mock-${campaignId}-${kind}`),
      occurredAt: await now(),
      deadline: campaign.config.claimDeadline,
      ...overrides,
    };
    const signature = await attestor.signTypedData(domain, achievementTypes, achievement);
    return { achievement, signature };
  };
  return { rpc, provider, sponsor, reader, other, attestor, token, hub, badge, domain, subject, now, advanceTo, createCampaign, join, proof, deploy };
}
