import { ethers } from 'hardhat';
import type { Contract } from 'ethers';
import {
  EXPLORER_URL,
  fail,
  readOnlyChecks,
  report,
  resolveReceiptId,
} from './monad';

/**
 * 写入命令：在 Monad 测试网登记一个凭证编号。必须显式执行，且需要专用测试私钥。
 * 链上只写入随机 32 字节编号，不包含用户、活动或正文。
 */
async function main() {
  if (!process.env.MONAD_TESTNET_PRIVATE_KEY) {
    throw new Error('缺少 MONAD_TESTNET_PRIVATE_KEY；这是写入命令，请仅在专用测试账户上执行。');
  }
  const { provider, contract, address, chainId } = await readOnlyChecks();
  try {
    const wallet = new ethers.Wallet(process.env.MONAD_TESTNET_PRIVATE_KEY!, provider);
    const authorized = String(await contract.submitter());
    if (authorized.toLowerCase() !== wallet.address.toLowerCase()) {
      throw new Error(`钱包 ${wallet.address} 不是合约授权提交者 ${authorized}；未发送任何交易。`);
    }
    const balance = await provider.getBalance(wallet.address);
    if (balance === 0n) throw new Error('测试账户余额为 0，请先通过官方水龙头领取测试 MON。');

    const receiptId = resolveReceiptId();
    if (await contract.exists(receiptId)) {
      report({
        action: 'register',
        status: 'already_registered',
        receiptId,
        chainId,
        contractAddress: address,
        submitter: wallet.address,
        explorer: EXPLORER_URL,
        note: '该编号已在链上登记，未发送新交易。',
      });
      return;
    }

    const transaction = await (contract.connect(wallet) as Contract).registerReceipt(receiptId);
    const confirmation = await transaction.wait();
    if (!confirmation || confirmation.status !== 1) throw new Error('交易未确认，请重试或查询浏览器。');
    report({
      action: 'register',
      status: 'confirmed',
      receiptId,
      txHash: transaction.hash,
      blockNumber: confirmation.blockNumber,
      chainId,
      contractAddress: address,
      submitter: wallet.address,
      explorer: `${EXPLORER_URL}/tx/${transaction.hash}`,
      note: '链上只保存随机编号，不含用户、活动或正文。',
    });
  } finally {
    provider.destroy();
  }
}

main().catch(fail);
