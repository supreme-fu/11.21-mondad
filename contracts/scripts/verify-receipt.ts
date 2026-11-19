import { fail, report, EXPLORER_URL, resolveReceiptId, readOnlyChecks } from './monad';

/**
 * 只读验证命令：检查 RPC、链 ID、合约字节码与授权提交者；
 * 提供 MONAD_RECEIPT_ID 时额外查询该编号是否已在链上。不发送任何交易。
 */
async function main() {
  const { provider, contract, address, chainId } = await readOnlyChecks();
  try {
    const authorizedSubmitter = String(await contract.submitter());
    const payload: Record<string, unknown> = {
      action: 'verify',
      network: 'Monad Testnet',
      chainId,
      contractAddress: address,
      authorizedSubmitter,
      explorer: EXPLORER_URL,
    };
    const receiptId = process.env.MONAD_RECEIPT_ID;
    if (receiptId) {
      payload.receiptId = receiptId;
      payload.existsOnChain = await contract.exists(receiptId);
    } else {
      payload.receiptId = null;
      payload.note = '未提供 MONAD_RECEIPT_ID；已只读验证合约与授权提交者，可继续执行 register:monad 登记新编号。';
    }
    report(payload);
  } finally {
    provider.destroy();
  }
}

main().catch(fail);
