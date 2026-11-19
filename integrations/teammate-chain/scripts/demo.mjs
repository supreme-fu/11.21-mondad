import { formatEther } from 'ethers';
import { createLocalEnvironment } from './local-chain.mjs';

const env = await createLocalEnvironment();
try {
  const { campaignId, config } = await env.createCampaign();
  await env.join(campaignId);
  await env.advanceTo(config.startsAt + 1);
  for (const kind of [1, 0]) {
    const { achievement, signature } = await env.proof(campaignId, kind);
    const receipt = await (await env.hub.connect(env.reader).claim(achievement, signature)).wait();
    console.log(`${kind === 1 ? '书评奖励' : '阅读奖励与勋章'}领取成功，本地交易 ${receipt.hash}`);
  }
  console.log(`奖励余额 ${formatEther(await env.token.balanceOf(await env.reader.getAddress()))} DSDEMO`);
  console.log(`勋章数量 ${await env.badge.balanceOf(await env.reader.getAddress())}`);
  console.log('此演示使用本地临时链与模拟阅读数据，尚未向 Monad 公共测试网发送交易。');
} finally {
  await env.provider.destroy();
  await env.rpc.disconnect();
}
