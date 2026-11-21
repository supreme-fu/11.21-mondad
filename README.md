# Do Something

一个**面向 Agent 时代的个人链上身份与生活行动档案（`LIFE CONTEXT`）**原型，秉持“独立行动、自愿分享、行动后连接”的人文留白理念。应用内的各个生活行动场景（读书、做菜、相见、出行）作为补充个人档案中“活动执行与多源凭证采集”环节的闭环演示模块；首版不是找搭子、好友监督或连续打卡工具，也不搞惩罚性押金对赌或真实资金炒作。

## 已实现

- **面向 Agent 时代的个人链上身份档案门户（`LIFE CONTEXT`）**：在「我的记录（`/records`）」构建结构化个人身份面板，明确区分**「机构 / 三方 EIP-712 核销层（如共读组织、线上购书、景区门票二维码核销）」**与**「个人主权声明层（`Self-Attested`，如日常下厨、见想见的人）」**，记录链上身份主体（`did:monad:10143`）、凭证信任分层与结构化行为维度，支持一键预览和复制标准化 `Agent Context JSON (JSON-LD / MCP Ready)` 载荷。
- **个人链上「三维器物徽章墙（Badge Wall）」**：支持按**获得时间**、**徽章等级（`Tier SSR / SR / S / A+ / A / B+` 及动态 `Lv.1~3` 进阶）**或**图谱编号**一键排序；每枚徽章卡片及 3D 查看器弹窗均显式提供**徽章等级、徽章来源（签发通道与核验方）以及精确获得时间**。
- **上链费用机制与三层商业模式闭环（无感代付 +「$6 / 60 次链上生活胶卷包」+ B 端核销内嵌）**：
  - **服务端无感代付（Gas Sponsorship）**：前端零钱包弹窗、零单次收银台打扰；利用 Monad 按 `gas_limit` 计费特性及链下正文分离架构（链上仅存固定长度 `bytes32` 与结构化核验锚点），锁定紧凑 `gas_limit`（`65,000 ~ 100,000 Gas`，单次底层成本 `< $0.0003`，60 次总成本仅约 `$0.02`）。
  - **C 端个人主权层（做菜 / 相见等日常记录）**：新人赠送 **10 次免费链上刻痕额度**；后续采用 **$6 装填 1 卷「60 次链上生活胶卷（60 Onchain Life Frames）」**（毛利率约 `99.6%`），后台自动划扣并静默上链点亮 3D 器物。
  - **B 端机构/三方核销层（线上购书共读 / 景区门票二维码核销）**：费用已内嵌于用户的真实消费（购书款、景区门票）中，**C 端用户免费且不扣个人胶卷**，由接入 `ActivityHub` 的合作方（出版社、共读组织、文旅景区）按 `$0.05 / 次` 采购核销签发额度。
  - **Agent 上下文层**：沉淀的结构化 `LIFE CONTEXT` 档案支持个人 AI Agent 高级上下文订阅与第三方授权资质核验变现。
- 四个档案活动执行演示主题：做菜、相见、阅读、出行；均使用真实的完成与凭证采集流程，不伪装第三方集成。
- **读书（`reading`）场景深度共读融合**：围绕 Monad 测试网已部署的《小王子》共读合约（`ReadingChallenge` / `ReadingBadge` / `DemoRewardToken`），实现服务端会话隔离的真实 EIP-712 核验签名、`≥80% 覆盖率 + 正文末章完成` 门槛校验、`10 DSDEMO + ReadingBadge` 与 `2 DSDEMO` 书评奖双奖叠加（最高 `12 DSDEMO`）、链下书评撤回/删除与匿名凭证摘要解耦，以及 `01 阅读 · 一页之间` 3D 器物弹窗的合约溯源锚点联动（Web 与微信小程序端同步支持）。
- 两个演示账户「阿黎 / 小舟」，通过服务端 HttpOnly 会话隔离，不信任前端传入的用户 ID。
- 接受约定、暂时离开、自报完成；完成与正文、分享、凭证申请相互独立。
- 感受正文默认私密，最多 500 字；可主动分享、撤回分享、删除正文。
- 同主题完成后的相似经历：排除本人，只返回有效授权文本；无真实分享时显示明确标注的示例或空状态。
- **五套完整可切换 Web 主题**：生活编辑部、夜色回信、纸片行动、奶油温柔、莫兰迪；共用业务代码，主题选择保存在当前浏览器。
- **徽章轻量预览**：`/badges` 列表只显示 256px WebP 缩略图与标题，首屏不下载任何 GLB、不加载 three.js；点开单枚才动态下载那一个模型，用 OrbitControls 拖转 / 缩放 / 复位，关闭即释放资源。全部标注为系列预览，不代表已获得，也不是 NFT、积分或任何奖励。
- **原生微信小程序演示工程**：WXML / WXSS / JavaScript，复用同一服务端与账户闭环。
- 方案 A 随机凭证：服务端生成随机 32 字节编号，不上链保存姓名、用户 ID、活动名、正文、正文哈希、图片或位置。
- 本地模拟 ReceiptProvider、Monad 测试网 ReceiptProvider、最小 Solidity 合约、部署预检与记录脚本。
- 我的记录、凭证状态、注销账户；注销撤销会话并删除链下关联，取消尚未开始的排队任务。
- 响应式界面、键盘可用弹窗、表单反馈、错误与空状态。

## 快速启动

要求 Node.js 22.18 或更高版本（使用 Node 内置 SQLite）。当前开发环境为 Node.js 24。

```bash
npm install
npm install --prefix app
npm install --prefix server
npm install --prefix contracts
npm run dev
```

打开 `http://localhost:7100`。根目录开发命令会同时启动 Vite 前端 `7100` 与 Express API `3100`。

首次打开自动进入「阿黎」，右上角可切换「小舟」。右上角菜单或页脚的「视觉方案」进入 `/designs`，可应用五套主题。演示数据保存在 `server/data/do-something.db`，只在本机使用。

### 本地生产方式运行

```bash
npm run build
npm start
```

服务端会直接托管 `app/dist`，仍使用 `http://localhost:7100`。

## 微信小程序

原生工程位于 `miniprogram/`，导入说明见 `miniprogram/README.md`。

- 本地桌面模拟器默认请求 `http://localhost:3100/api`，先启动根目录 `npm run dev`。
- 徽章预览：`pages/badges/badges` 列表页不初始化任何三维组件，点一枚进入 `pages/badge-detail/badge-detail`，由 `components/badge-viewer`（`renderer: 'xr-frame'`）加载这一个 GLB，返回即释放。
- 徽章缩略图在包内（10 张 256px WebP，合计 54.5 kB / 55,778 B）；GLB 不进包，按需从 `services/config.js` 的 `badgeModelBase` 拉取，开发期是 `http://localhost:7100/badges/models`。**真机必须改成已在 mp 后台配置的 HTTPS 合法域名**。
- xr-frame 是微信原生 renderer，不需要安装 npm 包，基础库要求 ≥ 2.32.0。
- 真机必须改用已配置为微信合法请求域名的 HTTPS 服务端，不能使用电脑的 localhost。
- `deliverables/wechat-source.zip` 是可导入源码包。
- `deliverables/wechat-source-final.zip` 是含徽章预览的最新源码包。
- `deliverables/wechat-compiled-final.zip` 是静态编译证据，不是可发布安装包。
- 当前主机没有微信开发者工具和 CLI，**原生渲染、模拟器交互与真机预览尚未验证**。小程序 API 服务层已通过到真实后端的双账户闭环测试。

## 徽章预览

- 入口：Web 顶部导航「徽章预览」或「我的记录」页；小程序「记录」页的徽章面板。
- Web：`/badges` 列表 → 点卡片开单枚查看器。three / GLTFLoader / OrbitControls / RoomEnvironment 走独立 chunk，只在打开徽章时下载；列表首屏 0 个 GLB 请求、0 个 canvas。
- 交互：拖拽或触摸旋转（可看到背面）、滚轮或双指缩放、复位视角、Escape 关闭并把焦点还给卡片；不开阻尼、不开 autoRotate，松手即停不回弹；DPR 上限 2。
- 资产：模型从 `badge-studio/public/models` 由 `app/scripts/sync-badge-assets.mjs` 同步到 `app/public/badges` 与 `miniprogram/assets/badges`，缩略图在同一次同步里渲染成 256px WebP。
- 验证结果与复验命令见 `docs/badge-ui-validation-20261110.md`，最终资产同步与全量回归见 `docs/final-validation-20261110.md`。

## 测试

```bash
npm run lint          # 前端静态检查
npm test              # 服务端 30 项 + 合约 3 项 + 小程序 25 项（共 58 项）
npm run test:evm      # 本地 EVM 部署、提交、确认与恢复联调（14 项）
npx playwright install chromium  # 首次运行浏览器测试前
npm run test:e2e      # 22 项真实浏览器测试，独立 7101 端口与数据库
npm run test:all      # 全部自动化回归（含 58 + 14 + 22 = 94 项；另 integrations/teammate-chain 含 19 项合约测试）
```

浏览器测试覆盖双账户授权相遇、撤回、模拟凭证、恶意 HTML 纯文本显示、375 / 768 / 1024 / 1440 四档宽度、五套主题切换、注销弹窗 Escape 与实际注销，以及读书主题《小王子》共读门槛锁定、`10 + 2 DSDEMO` 叠加领奖、书评联动与 `01 阅读 · 一页之间` 3D 器物合约溯源，以及徽章列表零预载、单枚按需下载、松手不回弹、可看背面、关闭清理、快速切换、375px 布局、五主题可用、无 WebGL 反馈。测试不会占用当前 Web 预览的 7100 / 3100 端口，也不改 `server/data/do-something.db`。

徽章截图由 `npx playwright test tests/e2e/badge-screenshots.spec.ts` 重新生成，写入 `test-results/`。

详细验收结果见 `TEST_PLAN.md`，徽章专项见 `docs/badge-ui-validation-20261110.md`。

## 队友原型进度

2026-11-19 已审查队友提交 `5c47345` 并完成「读书（`reading`）」场景深度融合。已同步其多活动架构、操作字段和测试网部署记录，将共读及多活动奖励合约纳入独立的本地验证包（19 项合约测试与本地演示全部通过）；同时在主应用（`server/` + `app/` + `miniprogram/`）的读书主题中落地了《小王子》共读挑战：采用服务端会话隔离的真实 EIP-712 核验签名、`80% 覆盖率 + 末章完成` 合约门槛拦截、`10 DSDEMO + ReadingBadge` 与 `2 DSDEMO` 书评奖励叠加（最高 `12 DSDEMO`），以及 `01 阅读 · 一页之间` 3D 器物弹窗的 Monad 测试网合约溯源锚点，其余主题继续沿用自报完成和随机凭证底座。

- [审查结论与同步清单](docs/teammate-prototype-review-20261119.md)
- [多活动原型交互架构](docs/teammate-prototype/index.html)
- [共读与多活动合约本地验证](integrations/teammate-chain/README.md)

## 凭证模式

### 默认：本地模拟

```bash
RECEIPT_MODE=simulation
```

模拟标识以 `simulation-` 开头，界面明确显示“非链上”，不会生成真实区块浏览器链接。

### 本地 EVM 真实交易联调

```bash
npm run test:evm
```

该命令启动隔离的 Hardhat EVM，实际部署 `CompletionReceipt`，用随机测试账户提交并确认一笔凭证交易，再以既有交易哈希验证恢复逻辑。它是 EVM 联调证据，**不是 Monad 测试网交易**。

### Monad 测试网

官方参数：Chain ID `10143`，RPC `https://testnet-rpc.monad.xyz`，浏览器 `https://testnet.monadvision.com`。

1. 准备只用于测试的账户和测试 MON，不使用真实资产钱包。
2. 在根目录 `.env` 配置专用测试私钥与 RPC，然后执行预检：

```bash
npm run preflight:monad --prefix contracts
```

预检只读取链 ID、提交地址和余额，不会部署。余额为零或链 ID 不匹配会停止。

3. 预检通过后部署：

```bash
npm run deploy:monad --prefix contracts
```

部署脚本再次检查链 ID 和余额，并将合约地址、提交地址与部署交易哈希写入 `contracts/deployments/monad-testnet.json`，不记录私钥。

4. 在根目录 `.env` 完成配置：

```bash
RECEIPT_MODE=monad-testnet
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
MONAD_CHAIN_ID=10143
MONAD_CONTRACT_ADDRESS=部署返回的地址
MONAD_TESTNET_PRIVATE_KEY=仅服务端专用测试私钥
MONAD_EXPLORER_URL=https://testnet.monadvision.com
```

5. 重新构建并启动。私钥只在服务端读取，不进入前端、日志或公开仓库。

**主应用的 `CompletionReceipt` 尚无本项目的 Monad 测试网部署地址或交易哈希。** 需要配置专用测试钱包与测试 MON。`MONAD_CONTRACT_ADDRESS` 或 `MONAD_TESTNET_PRIVATE_KEY` 为空时，服务端会拒绝发送。队友原型使用独立的 `ActivityHub` 和 `ReadingChallenge`，部署证据见上方审查记录。

## 删除边界

- 撤回分享：新访问者不再通过相似经历接口读取该正文。
- 删除正文：清空服务端正文与分享资格，保留自报完成声明。
- 注销：删除会话、参与与完成关联、正文及凭证链下映射；未开始的队列任务会取消。
- 已广播或确认的真实链记录、交易时间和提交地址无法由平台抹除；他人此前复制或截图的内容也无法收回。
- 当前是单机原型，尚未实现生产备份重放、持久化分布式队列或公开内容治理。

## 目录

```text
app/                 React + TypeScript + Vite 前端与五套主题
server/              Express、SQLite、权限与 ReceiptProvider
contracts/           Solidity、Hardhat 测试、预检与部署脚本
miniprogram/         原生微信小程序工程
badge-studio/        十枚 3D 徽章、材质编辑与鼠标交互收藏室
docs/                原始产品方案、视觉方向与本轮验证报告
scripts/             本地开发与 EVM 联调编排
tests/               浏览器与小程序 API 验收
deliverables/        小程序包，以及徽章模型、图片和源项目素材包
README.md            启动与模式说明
DECISIONS.md         技术选择、问题处理与待办边界
TEST_PLAN.md         验收清单与结果
CREDITS.md           字体和图标来源
```

构建产物、数据库、测试截图、依赖、私有小程序配置与 `.env` 均已加入 `.gitignore`。

## 依赖安全说明

前端、服务端和合约包的生产依赖审计均为 0 告警。开发工具链仍存在传递依赖告警，主要来自模板 lint 工具与 Hardhat 2；未使用 `npm audit fix --force` 降级或破坏工具链。真实公开部署前应升级合约工具链并重新审计。
