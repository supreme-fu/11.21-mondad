import { ethers } from 'hardhat';
import type { Contract, JsonRpcProvider } from 'ethers';

export const EXPECTED_CHAIN_ID = 10143;
export const EXPLORER_URL = 'https://testnet.monadvision.com';

export const RECEIPT_ABI = [
  'function registerReceipt(bytes32 receiptId)',
  'function exists(bytes32 receiptId) view returns (bool)',
  'function submitter() view returns (address)',
];

export function rpcUrl() {
  return process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';
}

export function isBytes32(value: string) {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

/** 读取或生成凭证编号：显式提供时校验格式，否则生成新的随机编号。 */
export function resolveReceiptId() {
  const provided = process.env.MONAD_RECEIPT_ID;
  if (!provided) return ethers.hexlify(ethers.randomBytes(32));
  if (!isBytes32(provided)) {
    throw new Error(`MONAD_RECEIPT_ID 必须是 32 字节十六进制字符串，当前值长度 ${provided.length}。`);
  }
  return provided;
}

export function contractAddressOrThrow() {
  const address = process.env.MONAD_CONTRACT_ADDRESS;
  if (!address) {
    throw new Error('缺少 MONAD_CONTRACT_ADDRESS；请先执行 deploy:monad 或从部署记录中填入合约地址。');
  }
  if (!ethers.isAddress(address)) {
    throw new Error(`MONAD_CONTRACT_ADDRESS 格式不正确：${address}`);
  }
  return ethers.getAddress(address);
}

export interface ReadOnlyContext {
  provider: JsonRpcProvider;
  contract: Contract;
  address: string;
  chainId: number;
}

/** 只读检查：RPC 可达、链 ID 匹配、合约地址有字节码。不发送任何交易。 */
export async function readOnlyChecks(): Promise<ReadOnlyContext> {
  const provider = new ethers.JsonRpcProvider(rpcUrl());
  let chainId: number;
  try {
    chainId = Number((await provider.getNetwork()).chainId);
  } catch (error) {
    provider.destroy();
    throw new Error(`无法连接 RPC ${rpcUrl()}：${error instanceof Error ? error.message : String(error)}`);
  }
  if (chainId !== EXPECTED_CHAIN_ID) {
    provider.destroy();
    throw new Error(`链 ID 不匹配：期望 ${EXPECTED_CHAIN_ID}，实际 ${chainId}；停止，不发送任何交易。`);
  }
  const address = contractAddressOrThrow();
  const code = await provider.getCode(address);
  if (!code || code === '0x') {
    provider.destroy();
    throw new Error(`合约地址 ${address} 在链 ${chainId} 上没有字节码；停止，不发送任何交易。`);
  }
  const contract = new ethers.Contract(address, RECEIPT_ABI, provider);
  return { provider, contract, address, chainId };
}

export function report(payload: Record<string, unknown>) {
  console.log(JSON.stringify(payload, null, 2));
}

export function fail(error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
