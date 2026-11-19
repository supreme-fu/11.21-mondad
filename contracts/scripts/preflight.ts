import { ethers } from 'hardhat';
import { fail, report, rpcUrl } from './monad';

/**
 * 只读预检：先在不依赖私钥的情况下诊断 RPC 与链 ID，再说明钱包是否缺失。
 * 不部署、不登记、不发送任何交易。
 */
async function main() {
  const privateKey = process.env.MONAD_TESTNET_PRIVATE_KEY;
  const provider = new ethers.JsonRpcProvider(rpcUrl());

  const payload: Record<string, unknown> = {
    network: 'Monad Testnet',
    rpcUrl: rpcUrl(),
    expectedChainId: 10143,
    walletConfigured: Boolean(privateKey),
    contractConfigured: Boolean(process.env.MONAD_CONTRACT_ADDRESS),
  };

  let chainId: number;
  try {
    chainId = Number((await provider.getNetwork()).chainId);
  } catch (error) {
    payload.reachable = false;
    payload.error = error instanceof Error ? error.message : String(error);
    report(payload);
    throw new Error(`无法连接 RPC：${payload.error}`);
  } finally {
    provider.destroy();
  }

  payload.reachable = true;
  payload.chainId = chainId;
  if (chainId !== 10143) {
    report(payload);
    throw new Error(`链 ID 不匹配：期望 10143，实际 ${chainId}；不要部署或登记。`);
  }

  if (!privateKey) {
    report(payload);
    throw new Error('RPC 与链 ID 正常，但缺少 MONAD_TESTNET_PRIVATE_KEY；请在根目录 .env 配置专用测试私钥后重跑预检。');
  }

  const walletProvider = new ethers.JsonRpcProvider(rpcUrl());
  try {
    const wallet = new ethers.Wallet(privateKey, walletProvider);
    const balance = await walletProvider.getBalance(wallet.address);
    payload.submitter = wallet.address;
    payload.balanceMon = ethers.formatEther(balance);
    payload.readyToDeploy = balance > 0n;
    report(payload);
    if (balance === 0n) {
      throw new Error('测试账户余额为 0，请先通过官方水龙头领取测试 MON。');
    }
  } finally {
    walletProvider.destroy();
  }
}

main().catch(fail);
