import '@nomicfoundation/hardhat-toolbox';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HardhatUserConfig } from 'hardhat/config';

// 确定路径读取仓库根目录 .env（不依赖当前工作目录）。
// 已存在于 process.env 的值优先，文件不会覆盖它；文件内容不进日志。
const rootEnvPath = join(__dirname, '..', '.env');
if (existsSync(rootEnvPath)) {
  for (const line of readFileSync(rootEnvPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const raw = trimmed.slice(separator + 1).trim();
    const quoted = raw.length >= 2
      && ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")));
    const value = quoted ? raw.slice(1, -1) : raw;
    if (!(key in process.env)) process.env[key] = value;
  }
}

const privateKey = process.env.MONAD_TESTNET_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    monadTestnet: {
      url: process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz',
      chainId: 10143,
      accounts: privateKey ? [privateKey] : [],
    },
  },
};

export default config;
