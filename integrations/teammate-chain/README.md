# 共读与多活动合约本地验证

来源为队友仓库提交 `5c4734578c53793a6f6786fcc1b00f7d54d73f28`。本目录包含 `ActivityHub`、`ReadingChallenge`、`ReadingBadge`、`DemoRewardToken` 的源码、编译脚本、测试和本地共读演示。独立安装依赖，编译产物写入本目录的 `artifacts/`。

从项目根目录执行：

```bash
npm ci --prefix integrations/teammate-chain --ignore-scripts
npm run compile --prefix integrations/teammate-chain
npm test --prefix integrations/teammate-chain
npm run demo --prefix integrations/teammate-chain
```

测试与演示使用进程内 Ganache 和临时钱包，编译目标为 Shanghai，链 ID 采用 10143 以覆盖 EIP-712 签名域。演示完成后输出 12 DSDEMO 和 1 枚共读勋章。`scripts/` 中的两份 `*-network.json` 是队友公共测试网部署记录，供核对地址与回执；本目录的命令不读取它们。

同步时保留了合约和锁文件，入口只提供编译、测试和本地演示。多活动测试直接从 `scripts/activity-attestations.mjs` 读取上游 EIP-712 类型声明。审查结论与产品边界见[队友进度同步记录](../../docs/teammate-prototype-review-20261119.md)。
