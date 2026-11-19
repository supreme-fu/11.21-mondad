# 队友原型审查与基线同步

2026-11-19 审查 `main` 的提交 `5c4734578c53793a6f6786fcc1b00f7d54d73f28`。该提交作于 2026-11-18 19:16（北京时间），本地完整检出位于 `teammate-review-20261119/`。多活动和独立共读已经达到测试网演示原型阶段。合约源码、本地演示和公共测试网部署证据已复核，托管服务与网页发交易流程仍待验收。 [审查提交](https://github.com/supreme-fu/do-something/commit/5c4734578c53793a6f6786fcc1b00f7d54d73f28)

## 完成程度

| 模块 | 已实现 | 本次验证 |
| --- | --- | --- |
| 多活动原型 | 像素活动卡、活动发布与报名、模拟成果、完成奖及贡献奖、勋章库、头像、好友邀请、链上后台 | 服务端及界面静态审查。`ActivityHub` 本地测试通过，公共测试网已存在活动和勋章。浏览器发奖、头像和好友流程尚未复测。 |
| 独立《小王子》共读 | 阅读覆盖与末章门槛、书评和阅读分别领奖、不可转让勋章、测试网后台、重开演示轮次 | 共读合约 18 项测试通过。本地演示发出 12 DSDEMO 和 1 枚勋章。依赖演示私钥的网页签名和重开流程仅做源码审查。 |
| 架构文档 | 交互数据流、操作字段、模块关系图、合约关系图、容器部署说明 | Chromium 验证数据流、模块图和合约图加载。「成果与领奖」场景的图和字段区联动。Docker、HTTPS 托管和状态卷迁移尚未实测。 |
| 外部数据与权益 | 使用模拟阅读、模拟成果及演示身份。合约校验核验方签名和领取规则 | 微信读书授权与数据核验、实际权益兑换仍处于方案阶段。 |

## Monad 公共测试网核验

通过公开 RPC 只读查询链 ID `10143`。下列收据状态均为成功。三笔部署交易的创建输入与本提交编译产物加构造参数逐字节一致。四个地址均有运行时代码。多活动与独立共读共用 DSDEMO，核验地址与记录一致。`ReadingBadge` 由 `ReadingChallenge` 构造时部署，链上 `badge()` 返回记录中的地址。

| 部署 | 确认区块 | 确认时间（北京时间） | 证据 |
| --- | ---: | --- | --- |
| `DemoRewardToken` | 80,681,391 | 2026-11-18 13:14:38 | [交易回执](https://testnet.monadexplorer.com/tx/0x27485f76ce117ccfad83f581250144435bcf2a15c9c4b19fa868c41cbf015d29) |
| `ReadingChallenge` 与 `ReadingBadge` | 80,681,401 | 2026-11-18 13:14:41 | [交易回执](https://testnet.monadexplorer.com/tx/0x4d584c9d1fa52ba47ea80fd8c15e5373a84e3c85c5fcb7cf7f166cb514caa164) |
| `ActivityHub` | 80,719,812 | 2026-11-18 16:42:39 | [交易回执](https://testnet.monadexplorer.com/tx/0x79f6ae78867eab00b8c96816afdd23a8f4505523e7dda1084b3d406114718633) |

在区块 `80,923,423`，`ActivityHub` 的累计活动数为 4、累计勋章数为 2，`ReadingChallenge` 的累计活动数为 2。队友 README 中的「当前链上活动数为 0」已过时。这些计数涵盖已创建的历史活动。 [多活动合约](https://testnet.monadexplorer.com/address/0x8dF8d96F6C855D0946F72AC4878f2A92C5bb8AFd) · [共读合约](https://testnet.monadexplorer.com/address/0x3ed53Ec76b80F4f387401C3e86C1be06b4682ed2)

## 影响集成的审查发现

1. **共享演示口令无法隔离居民身份。** 多活动服务用一个 HTTP Basic 口令控制托管入口，进入后从查询参数 `as` 选择虚拟居民。服务端持有各演示身份的钱包并代签，口令持有人可以操作这些演示身份，部分操作会支出测试 MON 或 DSDEMO。作为共享主持演示时符合当前设计。接入主应用需要将钱包和签名权限绑定到服务端会话。 [身份选择](https://github.com/supreme-fu/do-something/blob/5c4734578c53793a6f6786fcc1b00f7d54d73f28/scripts/prototype-server.mjs#L317) · [代签与补充手续费](https://github.com/supreme-fu/do-something/blob/5c4734578c53793a6f6786fcc1b00f7d54d73f28/scripts/prototype-chain.mjs#L30)
2. **贡献正文、凭证和徽章的公开范围与基线冲突。** 多活动状态接口会返回参与人的贡献正文，成果摘要参与链上领奖，钱包和勋章归属公开。主应用基线要求正文默认私密、分享可撤回，链上凭证使用独立的随机编号。直接接入会改变既有的数据授权和链上字段。 [状态响应](https://github.com/supreme-fu/do-something/blob/5c4734578c53793a6f6786fcc1b00f7d54d73f28/scripts/prototype-server.mjs#L146) · [成果摘要](https://github.com/supreme-fu/do-something/blob/5c4734578c53793a6f6786fcc1b00f7d54d73f28/scripts/prototype-server.mjs#L277) · [本项目产品决策](../DECISIONS.md)
3. **共读演示重开后缺少旧轮次奖池回收入口。** 重开把当前轮次归档并清空前台状态，但旧活动继续存在。再次创建会锁定新一轮 36 DSDEMO。旧轮次未发完的余额须等领取期结束后由主办方调用 `withdrawRemainder`，当前共读界面没有这项操作。 [重开实现](https://github.com/supreme-fu/do-something/blob/5c4734578c53793a6f6786fcc1b00f7d54d73f28/scripts/demo-server.mjs#L138) · [余额回收](https://github.com/supreme-fu/do-something/blob/5c4734578c53793a6f6786fcc1b00f7d54d73f28/contracts/ReadingChallenge.sol#L193)

## 已同步到基线

- `docs/teammate-prototype/` 收录队友架构文档和图，HTML 页面补充内联 favicon，以便本地静态预览。 [交互架构](teammate-prototype/index.html)
- `integrations/teammate-chain/` 收录四份合约、锁定依赖、19 项合约测试、本地共读演示及两份测试网地址记录。保留合约原文，将测试所需的 EIP-712 类型从公共测试网连接脚本提取为独立模块。验证包只提供本地编译、测试和演示入口。 [运行指引](../integrations/teammate-chain/README.md)
- 主目录 README 补充队友进度入口。业务接入继续沿用本地 Web、小程序、SQLite 和 `CompletionReceipt`。队友的两个网页及其后端保留在独立检出中。未运行测试网写入，也未部署服务。

主基线复跑结果为 55 项服务端、合约和小程序逻辑测试，14 项本地 EVM 测试，21 项浏览器测试全部通过。构建与 lint 通过。微信小程序真机仍待验证。当前工作区根目录没有 Git 元数据，基线同步已写入本地文件，队友仓库的独立检出保留其 Git 历史。

## 读书场景融合落地状态

2026-11-19 已围绕主站「读书（`reading`）」主题完成与队友 Monad 测试网《小王子》共读合约（`ReadingChallenge` / `ReadingBadge` / `DemoRewardToken`）的深度融合，前述审查发现中的两项核心集成阻塞已在主应用闭环解决：

1. **会话隔离问题已解决**：在 [reading-challenge.ts](../server/src/reading-challenge.ts) 中严格基于主站服务端 HttpOnly 会话 `user.id`（`user-a` 阿黎 / `user-b` 小舟）确定性派生各自的演示读者钱包 `readerWallet` 与活动内匿名 `subjectHash`，不再使用共享口令或前端传参选择身份；所有读书共读状态查询、进度同步与领奖接口均受 `requireAuth` 与记录归属校验保护，跨账户越权返回 `404`，并在 `DELETE /api/account` 时通过 `reading_challenges` 外键级联自动清理链下关联。
2. **隐私边界与撤回/删除冲突已解决**：在主站 [CompletionPage](../app/src/pages/CompletionPage.tsx) 与 [ReadingChallengePanel](../app/src/components/ReadingChallengePanel.tsx)（以及微信小程序 [complete.wxml](../miniprogram/pages/complete/complete.wxml)）中保持感受正文仅存链下 `reflections` 表、`evidenceHash` 仅对匿名元数据计算哈希；用户后续撤回分享或删除感受正文不会影响已签发的 EIP-712 凭证，同时保留 `≥80% 覆盖率 + 末章完成` 合约门槛拦截、`10 + 2 DSDEMO` 叠加激励与 `01 阅读 · 一页之间` 3D 器物弹窗溯源联动。
3. **最新全量验证计数**：融合后复跑 `integrations/teammate-chain`（19 项合约测试 + 本地演示）、`npm run lint`、`npm run build` 与 `npm run test:all`（服务端 30 项 + 主合约 3 项 + 小程序 25 项 + 本地 EVM 14 项 + Playwright 浏览器 22 项 = 94 项）全部通过。
