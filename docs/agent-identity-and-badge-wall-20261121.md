# 面向 Agent 时代的个人链上身份档案、三维徽章墙与商业闭环基线说明（2026-11-21）

本文档记录 `2026-11-21`（「Monad Blitz@广州」黑客松现场阶段）写入主分支基线的全部新增功能、架构定位、商业费用闭环与代码变更明细，供团队成员同步路演脚本与后续迭代使用。

---

## 一、 核心定位与顶层叙事升级

1. **主体定位（Core Product）**：
   - 本项目的核心是构建**面向 Agent 时代的个人链上身份与生活上下文档案（`Do Something · LIFE CONTEXT`）**。
   - 应用内的四个生活行动场景（读书《小王子》共读、做菜、相见、出行）定位为**档案系统的“活动执行与多源凭证采集演示模块”**，用于在现场闭环演示一条真实行动如何从发生、核验/声明、点亮三维徽章墙，最终沉淀为个人 AI Agent 可读取的结构化可信上下文。
2. **双轨信任分层（Provenance Tiering）**：
   - 秉承“信任是一个长期累积的过程，不能因为河宽就无限加船，也不能因为监管技术强了就侵入私人空间”的人文留白理念，档案在底层数据结构与界面展示上严格区分两类凭证来源：
     - **第一轨：机构 / 三方 `EIP-712` 核销层（`Issuer-Verified`）**：面向有客观发生节点的场景（如《小王子》共读章节完成、出版社线上购书、旅游景区门票二维码核销），由合作方核验节点签发 `EIP-712` 结构化证明并锚定至 Monad 合约（`ReadingChallenge` / `ReadingBadge` / `ActivityHub`）。外部企业对账或发奖时可仅检索特定签发方（`issuer`）的记录。
     - **第二轨：个人主权声明层（`Self-Attested`）**：面向不需要外部监管的私人生活空间（如为在乎的人做一道菜、去见想见的人），过程 100% 留白并无条件信任用户的自我完成声明，生成 Monad 链上随机 32 字节匿名完成凭证（`CompletionReceipt`）。
   - **对个人 AI Agent 的长期价值**：客观机构核销支点与长期连续的个人主权生活轨迹在同一份带签发方标签（Provenance-Tagged）的档案中共存，使未来的个人 AI Agent 既能分辨哪些是经第三方核验的硬事实，又能读懂主人的真实日常生活偏好。

---

## 二、 本次新增功能模块明细

### 1. 首页顶层定位横幅（[app/src/pages/Home.tsx](../app/src/pages/Home.tsx)）
- 在首页主视觉与活动列表之间新增 **`AGENT-ERA ONCHAIN IDENTITY · 个人链上身份档案底座`** 横幅：
  - 明确说明个人链上身份档案（`LIFE CONTEXT`）、三维徽章墙与结构化个人画像载荷的核心地位；
  - 将下方四个主题区域标题升级为「**档案活动执行演示 · 今天可以做的小事**」，并提供一键直达 `/records`（「查看我的链上身份档案与徽章墙」）的主按钮。

### 2. 个人链上「三维器物徽章墙（Badge Wall）」（[app/src/lib/badges.ts](../app/src/lib/badges.ts)、[app/src/components/HoloBadgeCard.tsx](../app/src/components/HoloBadgeCard.tsx)、[app/src/components/BadgeViewerDialog.tsx](../app/src/components/BadgeViewerDialog.tsx)、[app/src/pages/RecordsPage.tsx](../app/src/pages/RecordsPage.tsx)）
- **徽章等级与动态进阶计算（`computeBadgeGrading`）**：
  - 为全部 10 枚三维器物建立分级权重（`levelRank`）与等级标识（`tierCode` / `levelLabel`），并随用户在同一主题下的完成次数自动从 `Lv.1 初识` → `Lv.2 笃行` → `Lv.3 恒常` 动态晋升：
    - `01 阅读 · 一页之间`：`Tier S · Lv.1~3（机构 EIP-712 核验）`（来源：《小王子》共读挑战 · 章节进度 / 购书核验；签发方：共读主理方 `EIP-712` 核验节点 · `ReadingBadge` 合约）
    - `05 契约 · 链上凭证`：`Tier S · Lv.1~3（链上协议锚点）`（来源：Monad 跨场景链上凭证存证；签发方：Monad `CompletionReceipt` 协议合约 · Chain 10143）
    - `03 出行 · 山海皆可`：`Tier A+ · Lv.1~3（出行/门票核销）`（来源：档案活动执行 · 城市出行 / 景区门票二维码核销；签发方：文旅门票核销方 / 本人主权声明 · `ActivityHub`）
    - `02 下厨 · 一日三餐` & `04 相见 · 如约而至`：`Tier A · Lv.1~3（个人主权声明）`（来源：档案活动执行；签发方：本人主权声明 · `CompletionReceipt`）
    - `06 ~ 10 里程碑系列（10 / 50 / 100 次）`：`Tier B+` / `Tier SR` / `Tier SSR`（来源：`LIFE CONTEXT` 档案累计行动里程碑；签发方：`Do Something` 链上档案聚合器派生）
- **获得时间自动提取（`acquiredAt`）**：
  - 自动按完成记录正序计算每枚徽章首次达成解锁条件的精确时间戳（里程碑徽章取达成第 $N$ 次阈值的那条记录时间），格式化展示于卡片表面与 3D 弹窗中。
- **徽章墙三向排序控制（`badgeSortMode`）**：
  - 在 `/records` 徽章墙头部提供 **`按徽章等级排序`**、**`按获得时间排序`**、**`按图谱编号`** 三个实时排序切换按钮（已点亮徽章优先置顶，再按等级权重或获得时间倒序排列）。

### 3. 面向 Agent 的个人结构化档案与可信上下文面板（[app/src/pages/RecordsPage.tsx](../app/src/pages/RecordsPage.tsx)）
在 `/records` 页面中部新增 **`STRUCTURED IDENTITY & AGENT CONTEXT · 结构化个人档案`** 区域，包含四大结构化模块与实时 JSON 载荷视图：
1. **链上身份主体（`Identity Subject`）**：展示用户档案 `DID`（`did:monad:10143:user-a` / `user-b`）、Monad Testnet (`Chain ID 10143`) 及已部署的 `ReadingBadge` (`0xf584037417B6A4734656641904B009C0BAB4E720`) 与 `ReadingChallenge` (`0x3ed53Ec76b80F4f387401C3e86C1be06b4682ed2`) 合约地址。
2. **凭证信任分层（`Provenance Tiers`）**：独立统计「机构 / 三方核销层（`EIP-712`）」与「个人主权声明层（`Self-Attested`）」记录条数及 32 字节链上匿名凭证数；下方行动时间轴的每条记录同步渲染来源标签。
3. **结构化行为画像（`Agent Context`）**：汇总已激活的生活维度与频次、公开共鸣与私密留白比例、已解锁徽章资产数及链下 500 字感悟的隐私边界。
4. **上链费用机制与三层商业闭环（`Gas Sponsorship & Commercial Model`）**：
   - **服务端无感代付（Gas Sponsorship）**：前端零钱包弹窗、零单次付费收银台（在完成页 [CompletionPage.tsx](../app/src/pages/CompletionPage.tsx) 凭证申请区同步展示无感代付说明）。
   - **Monad `gas_limit` 紧凑优化**：针对 Monad 异步执行按 `gas_limit`（上限）而非 `gas_used` 收费的机制，利用“500 字正文留链下、链上仅写固定长度 `bytes32` 与结构化锚点”的确定性开销，锁定紧凑 `gas_limit`（`65,000 ~ 100,000 Gas`），单次底层 Gas 成本 `< $0.0003`，60 次上链底层总成本仅约 `$0.02`。
   - **C 端「$6 / 60 次链上生活胶卷包」**：新人默认赠送 10 次免费链上刻痕额度，实时显示当前账户剩余次数（如 `9 / 10 次`），并提供 **`模拟装填 1 卷生活胶卷（$6 / +60 次无感刻痕）`** 交互按钮（点击后总额度实时增加 `+60 次`，毛利率约 `99.6%`）。
   - **B 端机构核销费内嵌**：购书共读与景区门票二维码核销费用内嵌于真实消费中，由出版社或景区按 `$0.05 / 次` 采购 `ActivityHub` 核销额度代付，C 端用户免费且不扣个人胶卷。
5. **Agent 结构化 JSON 载荷（`JSON-LD / MCP Ready`）**：
   - 支持点击 **`查看 Agent 结构化 JSON 载荷`** 展开实时生成的完整 JSON（含 `subject`、`trustArchitecture`、`gasSponsorshipAndCommercialModel`、`badgeWallSummary`、`structuredBehavioralContext`），并支持 **`复制 Agent 上下文`**。

### 4. 黑客松技能与工程基线配置（[.agents/skills/](../.agents/skills) & [AGENTS.md](../AGENTS.md)）
- 已在项目级 `.agents/skills/` 安装完整的 **MONSKILLS**（10 项 Monad 官方开发技能包）与 **MOJO skills**（`mojo`、`mojo-mentor`、`mojo-submit`）。
- 已在 [AGENTS.md](../AGENTS.md) 写入「Monad Blitz@广州」（`eventId=18`，截止时间 `2026-11-21 18:30 UTC+8`）参赛提醒块，并通过根 [.gitignore](../.gitignore) 与 `.mojo/.gitignore` 双重保护 `.mojo/agent.json` 凭证不被提交。

---

## 三、 涉及代码与文档变更列表

| 文件路径 | 变更类型 | 说明 |
| :--- | :--- | :--- |
| [app/src/lib/badges.ts](../app/src/lib/badges.ts) | 修改 | 新增 `BadgeTrustTier`、`computeBadgeGrading`、`getEarliestDeclaredAt`，在 `BadgeState` 中输出等级、权重、来源、签发方与首次获得时间。 |
| [app/src/components/HoloBadgeCard.tsx](../app/src/components/HoloBadgeCard.tsx) | 修改 | 支持在个人档案徽章墙卡片上渲染等级角标（`holo-tier-pill`）及等级/来源/获得时间元数据框（`holo-wall-meta`），保持 `/badges` 预览页原有纯粹造型展示不变。 |
| [app/src/components/BadgeViewerDialog.tsx](../app/src/components/BadgeViewerDialog.tsx) | 修改 | 在 3D 器物查看器弹窗右侧新增 `badge-provenance-specs`，展示档案等级、徽章来源、签发/核验方与获得时间。 |
| [app/src/pages/RecordsPage.tsx](../app/src/pages/RecordsPage.tsx) | 修改 | 升级为面向 Agent 时代的个人链上身份档案门户；实现徽章墙三向排序、结构化个人身份面板、`$6 / 60 次` 生活胶卷包交互账本、Agent JSON 载荷展开/复制及时间轴来源标签。 |
| [app/src/pages/Home.tsx](../app/src/pages/Home.tsx) | 修改 | 新增 `home-archive-banner` 面向 Agent 时代的个人链上身份档案顶层定位横幅。 |
| [app/src/pages/CompletionPage.tsx](../app/src/pages/CompletionPage.tsx) | 修改 | 在凭证面板新增 `receipt-sponsorship-note` 服务端无感代付与胶卷/合作方核销费用说明。 |
| [app/src/App.css](../app/src/App.css) | 修改 | 新增首页档案横幅、徽章墙排序与元数据、结构化 Agent 身份面板及无感代付胶卷横幅的响应式与多主题兼容样式。 |
| [tests/e2e/product.spec.ts](../tests/e2e/product.spec.ts) | 修改 | 新增徽章墙元数据、按获得时间/等级排序切换、`gas-sponsorship-banner` 生活胶卷装填及 Agent JSON 载荷面板的 Playwright E2E 断言。 |
| [README.md](../README.md) / [DECISIONS.md](../DECISIONS.md) / [TEST_PLAN.md](../TEST_PLAN.md) | 修改 | 同步更新项目顶层定位、技术决策基线与验收清单。 |
