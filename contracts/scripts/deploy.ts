import { mkdirSync, writeFileSync } from 'node:fs';
import { ethers } from 'hardhat';
import { fail, report } from './monad';

/**
 * 部署写入命令：必须显式执行，且需要专用测试私钥。
 * 部署记录只含公开信息（链、合约地址、提交地址、部署交易哈希），不含私钥。
 */
async function main() {
  if (!process.env.MONAD_TESTNET_PRIVATE_KEY) {
    throw new Error('请为专用测试账户设置 MONAD_TESTNET_PRIVATE_KEY；不要使用真实资产钱包。');
  }
  const [submitter] = await ethers.getSigners();
  if (!submitter) throw new Error('没有可用的测试网提交账户。');
  const network = await ethers.provider.getNetwork();
  if (Number(network.chainId) !== 10143) throw new Error(`链 ID 不匹配：期望 10143，实际 ${network.chainId}`);
  const balance = await ethers.provider.getBalance(submitter.address);
  if (balance === 0n) throw new Error('测试账户余额为 0，请先领取测试 MON。');

  const Receipt = await ethers.getContractFactory('CompletionReceipt');
  const receipt = await Receipt.deploy(submitter.address);
  await receipt.waitForDeployment();
  const contractAddress = await receipt.getAddress();

  const code = await ethers.provider.getCode(contractAddress);
  if (!code || code === '0x') throw new Error('部署后未在链上读到合约字节码，请重试。');

  const deployment = {
    network: 'Monad Testnet',
    chainId: 10143,
    contractAddress,
    submitter: submitter.address,
    deploymentTxHash: receipt.deploymentTransaction()?.hash || null,
    deployedAt: new Date().toISOString(),
    explorer: 'https://testnet.monadvision.com',
    note: '记录只含公开信息，不含私钥；提交地址为专用测试钱包地址。',
  };
  mkdirSync('deployments', { recursive: true });
  writeFileSync('deployments/monad-testnet.json', `${JSON.stringify(deployment, null, 2)}\n`);
  report(deployment);
}

main().catch(fail);
