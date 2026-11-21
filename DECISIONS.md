# 技术与产品决定

## 已决定

1. **产品核心**：独立行动、自愿分享、行动后连接；不做匹配大厅、关注、私聊、排名和连续打卡惩罚。
2. **凭证采用方案 A**：随机 32 字节编号由服务端生成。链上最小字段只有编号与存在状态，交易元数据由链产生；不写用户地址、活动名、正文或其哈希。
3. **默认模拟，真实适配可替换**：`ReceiptProvider` 分离本地模拟与 Monad 测试网，UI 永远区分两者。
4. **服务端权限是必要条件**：Node 内置 SQLite + Express，演示账户通过随机 HttpOnly 会话识别，不采用前端 localStorage 模拟权限。
5. **四个主题都走通用自报闭环**：没有外部平台集成，不声称阅读或行为经过自动验证。
6. **相似经历按主题匹配**：排除本人、只读授权且未删除文本；真实用户分享优先，预置故事明确标注“示例内容”。
7. **完成、正文、分享和凭证分开**：完成不自动写正文，写正文不自动分享，分享不自动申请凭证。
8. **五套视觉均已实现并可切换**：生活编辑部、夜色回信、纸片行动、奶油温柔、莫兰迪共用 React 业务代码，选择仅保存为浏览器视觉偏好。
9. **小程序使用原生微信工程**：不采用 H5 套壳，复用真实 API；原生渲染缺失时不以 Web 预览替代验收。
10. **真实上链先验证适配器**：钱包提供前完成预检、部署记录和本地 EVM 交易联调；不把本地 EVM 结果称为 Monad 测试网结果。
11. **不加入可选轻回应**：首版优先保证权限、删除和凭证闭环，避免增加新的社交压力与数据对象。
12. **人文叙事与三维器物审美升级（2026-11-10，由 Gemini 模型执行）**：去除界面中生硬的防御性免责声明与外露工程标识（如 `self_report`、同步脚本路径），统一为温和克制的生活杂志语态；补齐中文人文衬线字体栈，修正里程碑徽章阶梯排序，并对十枚三维徽章实施几何、对比度与背面印记重构。
13. **「主站四主题通用自报基座 + 读书（`reading`）场景深度 EIP-712 共读核验层」双轨融合（2026-11-19）**：保留主站四个生活主题（做菜、相见、阅读、出行）无外部强制自证的自报基座与方案 A 最小凭证，仅在读书（`reading`）场景可选叠加《小王子》× Monad 测试网 `ReadingChallenge` 合约的 EIP-712 共读核验层；一方面通过主站 HttpOnly 会话 `user.id` 确定性派生独立 `readerWallet` 与活动内匿名 `subjectHash`，彻底解决队友原型中共享口令导致的身份越权问题；另一方面坚持感受正文仅保存在服务端 `reflections` 表、签名 `evidenceHash` 仅对匿名元数据计算哈希，使用户后续撤回分享或删除感受正文时完全不影响已签发的 EIP-712 凭证，守住主站“默认私密、可撤回可删除”的隐私基线。

## 遇到的问题与处理

| 问题 | 处理 |
| --- | --- |
| 初始模板锁文件与依赖清单不同步 | 重新安装并生成锁文件，后续构建可重复。 |
| Express 5 路由参数类型包含数组 | 在数据库调用前显式转换为字符串，TypeScript 编译通过。 |
| Hardhat 默认源码目录与 ESM 配置不匹配 | 移入 `contracts/contracts`，移除 Hardhat 2 不兼容配置，合约测试通过。 |
| SQLite 返回 null-prototype 行对象导致测试深比较失败 | 改为逐字段断言，不修改正确的业务代码。 |
| 当前环境访问 Monad RPC 返回地区限制 | 保留可配置适配器与预检／部署脚本，默认模拟并清楚标注；新增本地 EVM 真实交易联调。 |
| 浏览器插件命令不可用 | 使用项目内 Playwright Chromium 完成真实浏览器与截图验收。 |
| 首页标题把“开始”拆行 | 调整响应式字级并复拍桌面和手机截图。 |
| 全页截图在滚动位置合成 sticky 导航 | 截图前回到顶部，确认不是实际页面遮挡。 |
| 前端生产依赖出现 lodash / zod 告警 | 非强制更新后生产审计清零；保留并披露开发工具链传递告警。 |
| 注销测试故意重登已注销账户产生预期 403 | API 覆盖负向场景；浏览器测试聚焦弹窗与实际注销。 |
| WXML 不支持页面方法调用和任意 JavaScript 表达式 | 在逻辑层预先计算主题 glyph 和状态，空记录访问增加保护条件。 |
| 小程序首次编译出现 app.json 未使用文件分析警告 | 关闭该演示项目的未使用文件分析，第二次编译无结构警告。 |
| 小程序测试与当前 Web 预览争用 3100 端口 | 测试改用随机空闲端口，API 服务层支持测试注入地址；不停止用户预览。 |
| 小程序测试进程未退出 | 定位端口冲突并补充 HTTP 连接清理，最终测试正常退出。 |
| 本机没有微信开发者工具与 CLI | 继续完成源码、静态编译和真实后端联调；原生渲染与真机预览明确暂缓。 |
| 页面防御性免责声明与工程枚举外露冲淡人文感（Gemini 审查） | 将 `self_report`、“算法审判”、“造型可以看，奖励不存在”等工程/对抗式措辞重构为温润的产品语言，隐藏前端脚本路径外露。 |
| 里程碑徽章按汉字字典序导致 `100` 排在 `50` 前面（Gemini 审查） | 在 `app/src/lib/badges.ts` 与 `app/scripts/sync-badge-assets.mjs` 引入显式阶梯顺序（`10 → 50 → 100 金 → 100 白金 → 100 钻石`）。 |
| 白金珍藏徽章白底白字无对比度、数字 `100` 右偏且背面空白锯齿（Gemini 审查） | 重构 `badge-studio/src/badges.js`：修正 `TextGeometry` 包围盒中心计算与 `100` 光学居中；白金与钻石章改用深岩灰哑光内盘；收齐外圈与背圈半径并新增背面双轨交汇微雕印记。 |

## 本轮审美、文案与三维徽章升级基线记录（2026-11-10）

- **执行模型**：**Gemini**（Google DeepMind）
- **修改范围与明细**：
  1. **全站文案温润化（Web + 微信小程序同步）**：
     - `app/src/components/Layout.tsx`：顶部横幅由“本地演示 · 凭证为模拟模式，不是真实链上交易”优化为“演示环境 · 当前使用本地模拟凭证（不上链、无资产属性）”。
     - `app/src/pages/ActivityPage.tsx` & `miniprogram/pages/activity/activity.wxml`：将“由你认真声明，而不是由算法审判”改为“由你向自己确认，无需向他人自证”；将 `self_report` 工程说明改为“记录保存在服务端，只代表你向自己守了一次约，不苛求任何外部证明”。
     - `app/src/pages/CompletionPage.tsx` & `miniprogram/pages/complete/complete.wxml`：将“自报完成 · self_report”改为“自报完成 · 无需自证”；将“正在寻找一条获准分享的经历…”改为“正在翻看同路人留下的字条…”；将回响底注改为“这里只停留同主题下自愿敞开的文字。不必寒暄，看见即是重逢。”
     - `app/src/pages/RecordsPage.tsx`、`miniprogram/pages/records/records.wxml` & `tests/e2e/badges.spec.ts`：将“造型可以看，奖励不存在。”改为“只作纪念的器物，不作攀比的奖章。”
     - `app/src/pages/BadgesPage.tsx` & `miniprogram/pages/badges/badges.wxml`：将“它们不会替你记住什么。”改为“真正的纪念，留在你做完那件事的时刻。”；移除页面底部直接暴露的 `app/scripts/sync-badge-assets.mjs` 脚本路径，改为“全系列共十枚三维器物预览 · 按需加载，轻盈呈现。”
  2. **界面排版与舞台视觉升级**：
     - `app/tailwind.config.js` & `app/src/index.css`：补齐中文人文衬线字体栈（`Songti SC`, `STSong`, `Noto Serif SC`, `Source Han Serif SC` 等），开启 `font-feature-settings: 'palt' 1` 并微调大标题字距 `-0.015em`。
     - `app/src/lib/badges.ts` & `app/scripts/sync-badge-assets.mjs`：修复 `localeCompare` 导致 `100 次` 排在 `50 次` 前面的顺序错乱，显式按 `10 → 50 → 100 金 → 100 白金 → 100 钻石` 阶梯排列。
     - `app/src/App.css` & `app/src/themes.css`：将 `EchoPanel` 左侧生硬直线替换为与首页呼应的双曲线交汇 SVG 图形，优化引文左边框与留白；为 `.badge-stage` 增加径向暗角光影渐变（含 `night` 主题深色适配）。
  3. **三维徽章几何与材质重构（`badge-studio/src/badges.js`）**：
     - **文字与数字光学居中**：修复 `textMesh` 与 `countText` 仅減去半宽 `(max - min)/2` 而忽略 `min.x` 偏移的缺陷，改用包围盒中心 `(max + min)/2` 并为 `100` 增加 `-0.014` 光学修正。
     - **01 阅读 · 一页之间**：调整双页展开倾角与末行短句排版，在书脊下方新增浅嵌入黄铜燕尾书签丝带（`relief-bookmark`）。
     - **02 做饭 · 烟火日常**：将蒸汽升级为四控制点 S 形升腾曲线浮雕，调暖搪瓷与赤铜色阶。
     - **03 相见 · 环环相扣**：新增两侧异步交汇轨迹弧（`relief-orbit-left` / `relief-orbit-right`）环抱顶部柔光珍珠，与链上合约章区分视觉语义。
     - **04 100 次 · 白金珍藏 & 钻石微光**：将白金章与钻石章内盘升级为深岩灰哑光表盘（`#364549` / `#3b4d54`），解决白底白字看不清的问题；为钻石章补齐 `100` 浮雕数字；里程碑刻度区分每 5 格主刻度与次刻度。
     - **05 全系列徽章背面微雕**：外圈与背圈半径对齐至 `0.77` 边缘消除背面锯齿穿模，新增背面内盘（`base-back-inner`）与双轨交汇微雕印记（`base-back-hallmark`）。

## 尚未完成 / 需要下一阶段

- Monad 真实测试网部署、真实回执和端到端联调：需要可用 RPC、专用测试钱包与测试 MON。
- 微信开发者工具原生渲染、模拟器交互、有效 AppID 与真机预览。
- 生产级持久化队列、备份删除重放、安全审计、内容举报和处置。
- 正式账户体系、商标与名称查重、公开部署。
- 真实奖励、第三方阅读或运动平台接入均不在首版。

## 2026-11-19 读书场景链上共读核验融合基线记录

- **融合目标**：围绕「读书（`reading`）」核心展示场景，将 `integrations/teammate-chain/` 在 Monad 公共测试网（Chain ID `10143`）已部署的《小王子》共读合约能力（`ReadingChallenge` `0x3ed53Ec76b80F4f387401C3e86C1be06b4682ed2`、`ReadingBadge` `0xf584037417B6A4734656641904B009C0BAB4E720`、`DemoRewardToken` `0xAEc92f5A8D121b6e3FaFcB429dC4B7Cc24781353`）深度融合进主应用（`server/` + `app/` + `miniprogram/`）。
- **涉及文件与接口**：
  1. **服务端（`server/`）**：
     - [db.ts](file:///Users/abeam/一些尝试/区块链黑客松/server/src/db.ts)：在 `Store.migrate()` 平滑新增 `reading_challenges` 表及 `user_id` 索引，外键级联 `ON DELETE CASCADE` 保证 `DELETE /api/account` 自动清理。
     - [reading-challenge.ts](file:///Users/abeam/一些尝试/区块链黑客松/server/src/reading-challenge.ts)：固化 Monad 测试网部署地址、复用一致的 EIP-712 `attestationDomain` / `enrollmentTypes` / `achievementTypes`，按会话隔离派生 `readerWallet` 与 `subjectHash`，实现 `getOrInitState`、`syncProgress`（`baseline` / `partial` / `complete`）与 `claimReward`（`reading` / `review`）。
     - [app.ts](file:///Users/abeam/一些尝试/区块链黑客松/server/src/app.ts)：新增受 `requireAuth` 保护的 `GET /api/reading-challenge/:participationId`、`POST /api/reading-challenge/:participationId/progress`、`POST /api/reading-challenge/:participationId/claim`。
     - [api.test.ts](file:///Users/abeam/一些尝试/区块链黑客松/server/test/api.test.ts)：新增 2 项共读端到端 API 测试（覆盖门槛拦截、双奖叠加、重复领取 409、删除正文独立、跨账户越权 404 与注销级联清理）。
  2. **Web 前端（`app/`）**：
     - [types/index.ts](file:///Users/abeam/一些尝试/区块链黑客松/app/src/types/index.ts)、[api.ts](file:///Users/abeam/一些尝试/区块链黑客松/app/src/lib/api.ts)、[reading-contracts.ts](file:///Users/abeam/一些尝试/区块链黑客松/app/src/lib/reading-contracts.ts)：新增 `ReadingChallengeState` 类型、客户端 API 与 Monad 合约常量。
     - [ActivityPage.tsx](file:///Users/abeam/一些尝试/区块链黑客松/app/src/pages/ActivityPage.tsx)：在 `reading` 主题详情页增加「本期共读实验 · 《小王子》× Monad 链上核验」预告卡与合约浏览器链接。
     - [ReadingChallengePanel.tsx](file:///Users/abeam/一些尝试/区块链黑客松/app/src/components/ReadingChallengePanel.tsx) & [CompletionPage.tsx](file:///Users/abeam/一些尝试/区块链黑客松/app/src/pages/CompletionPage.tsx)：在读书完成页渲染进度同步（62% / 80% 末章锁定 / 88% 末章完成）、阅读奖（10 DSDEMO + `ReadingBadge`）、书评奖（与 `ReflectionEditor` 联动并支持一键填入示例书评，2 DSDEMO）及链上账本摘要。
     - [badges.ts](file:///Users/abeam/一些尝试/区块链黑客松/app/src/lib/badges.ts) & [BadgeViewerDialog.tsx](file:///Users/abeam/一些尝试/区块链黑客松/app/src/components/BadgeViewerDialog.tsx)：在 `01 阅读 · 一页之间` 3D 器物弹窗右侧「档案溯源与跨应用门户」补充 `ReadingBadge` 与 `ReadingChallenge` 合约锚点。
  3. **微信小程序与测试（`miniprogram/` & `tests/`）**：
     - [miniprogram/services/api.js](file:///Users/abeam/一些尝试/区块链黑客松/miniprogram/services/api.js)、[complete.js](file:///Users/abeam/一些尝试/区块链黑客松/miniprogram/pages/complete/complete.js)、[complete.wxml](file:///Users/abeam/一些尝试/区块链黑客松/miniprogram/pages/complete/complete.wxml)、[complete.wxss](file:///Users/abeam/一些尝试/区块链黑客松/miniprogram/pages/complete/complete.wxss)：同步上线读书共读进度与领奖卡片。
     - [tests/miniprogram/api-flow.test.ts](file:///Users/abeam/一些尝试/区块链黑客松/tests/miniprogram/api-flow.test.ts) & [tests/e2e/product.spec.ts](file:///Users/abeam/一些尝试/区块链黑客松/tests/e2e/product.spec.ts)：分别新增小程序共读 API 测试与 Playwright 浏览器全流程 E2E 测试。
- **验证结果**：
  - `npm test --prefix integrations/teammate-chain`（19 项通过）与 `npm run demo --prefix integrations/teammate-chain`（本地交易发放 12.0 DSDEMO + 1 枚勋章）通过。
  - `npm run lint` 与 `npm run build` 零告警、零错误通过。
  - `npm run test:all` 全绿通过：服务端 30 项 + 主合约 3 项 + 小程序 25 项 + 本地 EVM 联调 14 项 + Playwright 真实浏览器 22 项，合计 94 项主工程自动化测试全部通过。

## 2026-11-21 面向 Agent 时代的个人链上身份档案与三维徽章墙基线记录

- **核心定位升级**：明确主产品为**面向 Agent 时代的个人链上身份档案（`LIFE CONTEXT · Onchain Personal Identity & Agent Context Archive`）**；将读书（《小王子》共读）、做菜、相见、出行统一收敛为补充个人档案中“活动执行与多源凭证采集”环节的交互演示模块。
- **涉及文件与能力**：
  1. **三维器物徽章墙（[badges.ts](file:///Users/abeam/一些尝试/区块链黑客松/app/src/lib/badges.ts)、[HoloBadgeCard.tsx](file:///Users/abeam/一些尝试/区块链黑客松/app/src/components/HoloBadgeCard.tsx)、[BadgeViewerDialog.tsx](file:///Users/abeam/一些尝试/区块链黑客松/app/src/components/BadgeViewerDialog.tsx)、[RecordsPage.tsx](file:///Users/abeam/一些尝试/区块链黑客松/app/src/pages/RecordsPage.tsx)）**：
     - 为 10 枚三维器物建立档案等级与动态进阶计算（`Tier SSR / SR / S / A+ / A / B+` + `Lv.1 初识 / Lv.2 笃行 / Lv.3 恒常`），自动提取每枚徽章的首次解锁/获得时间（`acquiredAt`）、徽章来源（`sourceLabel`）与签发/核验方（`issuerLabel`）。
     - 在个人档案页徽章墙支持按**徽章等级**、**获得时间**、**图谱编号**三种方式实时排序，并在卡片及 3D 弹窗中显式展示等级、来源与获得时间。
  2. **结构化个人身份与 Agent 可信上下文面板（[RecordsPage.tsx](file:///Users/abeam/一些尝试/区块链黑客松/app/src/pages/RecordsPage.tsx)、[Home.tsx](file:///Users/abeam/一些尝试/区块链黑客松/app/src/pages/Home.tsx)）**：
     - 实行**双轨信任分层（Provenance Tiering）**：清晰区分第三方/机构 `EIP-712` 核销凭证（如共读组织、线上购书、景区门票二维码核销）与个人主权声明（`Self-Attested`，如日常下厨、见想见的人的留白约定），在行动时间轴与结构化面板中逐条标注来源。
     - 新增 `STRUCTURED IDENTITY & AGENT CONTEXT` 面板，记录用户的链上 `DID`（`did:monad:10143:user-...`）、凭证信任分层计数、结构化行为维度与已获徽章资产索引，支持一键展开并复制 `JSON-LD / MCP Ready` 标准上下文载荷。
  3. **上链费用机制、Monad `gas_limit` 紧凑优化与三层商业闭环（[RecordsPage.tsx](file:///Users/abeam/一些尝试/区块链黑客松/app/src/pages/RecordsPage.tsx)、[CompletionPage.tsx](file:///Users/abeam/一些尝试/区块链黑客松/app/src/pages/CompletionPage.tsx)）**：
     - **交互原则**：拒绝单次行动完成时弹窗收 Gas 费打断情绪，全流程采用服务端 Relayer / Sponsor 无感代付上链。
     - **Monad `gas_limit` 紧凑优化**：针对 Monad 异步执行按 `gas_limit`（上限）而非 `gas_used` 收费的机制，利用本项目“500 字正文留链下、链上仅写固定长度 `bytes32` 与结构化锚点”的确定性开销，锁定紧凑 `gas_limit`（`65,000 ~ 100,000 Gas`），单次底层 Gas 成本约 `$0.0003`，60 次上链底层总成本仅约 `$0.02`。
     - **双轨商业闭环落地**：在个人档案页与 Agent JSON 载荷中实装「链上生活胶卷账本」——① **C 端个人主权层**提供新人 10 次免费额度，支持一键模拟装填 **$6 / 60 次「链上生活胶卷包」**（毛利率约 `99.6%`）；② **B 端机构核销层**（如《小王子》购书共读、景区门票二维码核销）由合作方通过 `ActivityHub` 按次代付，不消耗个人胶卷额度。
