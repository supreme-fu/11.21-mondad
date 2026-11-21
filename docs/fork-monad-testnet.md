# Fork 的 Monad 测试网部署与验收

网络为 Monad Testnet，Chain ID 为 10143。活动 #1 用演示阅读数据进行验收。已确认凭证存在，演示账号拥有徽章 #1，阅读及书评合计到账 12 DSDEMO。

| 流程 | 证据 |
| --- | --- |
| 完成凭证 | [合约](https://testnet.monadvision.com/address/0xC2C6d6CcDabAc4D9aB273Aa2F31E2BA6A4799fCC) · [登记交易](https://testnet.monadvision.com/tx/0x5243190b3f00d307102dc7d4a50b26a3c20fb2e5c95b48af3db1ef651a0f4ac2) |
| 共读挑战 | [合约](https://testnet.monadvision.com/address/0xded334e897C4F15c6Db63608C837c0dAC445dF71) · [活动创建](https://testnet.monadvision.com/tx/0x08044a700582e22d4150b822a7b89c5bbc12e58c9be86e5e3eaba443fd692661) |
| 阅读奖 | [徽章合约](https://testnet.monadvision.com/address/0x917d025494E1CB5a6254D386B1626b6025dB6235) · [徽章 #1 和 10 DSDEMO](https://testnet.monadvision.com/tx/0x761424f78cf107abf6a82da8ea6101e95abdffd4afbee1c7f7e3959c6686e336) |
| 书评奖 | [2 DSDEMO](https://testnet.monadvision.com/tx/0xc7554babfd2bcfc74053b7fb014fce37ab960b2ec633a90095a6e4d2c21a18ef) |

## 本地测试网启动

从仓库根目录安装 `app` 和 `server` 依赖并构建。使用独立数据库，避免混用模拟环境的签名和凭证。把以下配置写入本机的 `.env`：

```dotenv
RECEIPT_MODE=monad-testnet
MONAD_CHAIN_ID=10143
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
MONAD_CONTRACT_ADDRESS=0xC2C6d6CcDabAc4D9aB273Aa2F31E2BA6A4799fCC
FORK_READING_DEPLOYMENT_PATH=contracts/deployments/fork-reading-monad-testnet.json
SEED_DEMO_PROFILE=false
```

另在本机环境中提供 `MONAD_TESTNET_PRIVATE_KEY`，其公开地址须同时匹配凭证合约提交者和共读部署记录里的签名账户。已有部署记录只包含公开信息。运行 `npm run build` 和 `npm start`。活动 #1 于北京时间 2026 年 11 月 28 日 15:32 结束，过期后需配置新活动。

积分、普通 3D 徽章、里程碑和「我的记录」余额/生活胶卷模拟装填留在链下；主站 4 个场景统一支持「接受约定 → 确认完成 → 是否上链（-1 点数）→ 高光 3D 铸造仪式 → 是否分享感受弹窗 → 直接弹窗展示同路人字条」。`ReadingTestnet` 的已领奖幂等事件回溯已适配 Monad Testnet 公共 RPC 单次 `eth_getLogs` 100 区块窗口限制。前后端构建通过，服务端测试 30/30 通过。
