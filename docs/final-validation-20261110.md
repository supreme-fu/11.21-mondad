# 最终集成与回归验证记录（2026-11-10）

本文记录项目最终集成验证，以及随后由 **Gemini（Google DeepMind）** 模型执行的**全站审美、人文文案与三维徽章升级**基线结果。

---

## 0. Gemini 模型审美、文案与三维徽章升级基线（2026-11-10 最新基线）

- **执行模型**：**Gemini**（Google DeepMind）
- **核心改动**：
  1. **全站文案温润化（Web + 微信小程序）**：移除界面直接外露的 `self_report` 枚举与构建脚本路径 `app/scripts/sync-badge-assets.mjs`；将防御性免责语句（如“由你认真声明，而不是由算法审判”、“造型可以看，奖励不存在”、“它们不会替你记住什么”）统一改写为温和克制的生活杂志表达（“由你向自己确认，无需向他人自证”、“只作纪念的器物，不作攀比的奖章”、“真正的纪念，留在你做完那件事的时刻”）。
  2. **排版、主题与里程碑排序修复**：在 `app/tailwind.config.js` 补齐中文宋体/人文衬线字体栈；修复 `app/src/lib/badges.ts` 与 `app/scripts/sync-badge-assets.mjs` 中因字典序导致 `100 次` 排在 `50 次` 前面的问题，固定为 `10 → 50 → 100 金 → 100 白金 → 100 钻石`；升级 `EchoPanel` 双曲线交汇 SVG 与 `.badge-stage` 径向光影舞台。
  3. **十枚三维徽章造型与材质重构（`badge-studio/src/badges.js`）**：
     - 修正 `TextGeometry` 水平/垂直居中算法（改用 `(max + min) / 2` 并加 `-0.014` 光学补偿），彻底修复 `100` 数字偏右问题；
     - `阅读`新增黄铜燕尾书签丝带（`relief-bookmark`）与末行短句细节；
     - `做饭`蒸汽升级为四控制点 S 形升腾曲线；
     - `相见`新增两侧异步交汇轨迹弧（`relief-orbit-left/right`）拥抱顶部珍珠节点；
     - `白金珍藏`与`钻石微光`改用深岩灰哑光内盘（`#364549` / `#3b4d54`）提升反差，为`钻石微光`补齐 `100` 数字，并将里程碑刻度升级为主次分明表盘刻度；
     - 全系列收齐外圈与背圈半径消除背面锯齿露边，新增背面内盘（`base-back-inner`）与双轨交汇微雕印记（`base-back-hallmark`）。

### Gemini 升级后实测几何与资产基线

- **几何规模**：10 枚合计 **115 meshes / 38,588 triangles / 49,878 vertices**（8 项几何断言全通过，13 项缺陷变异全部被捕获）。
- **GLB 体积**：10 枚合计 **1,479,996 B（1.41 MB，低于 2 MB 预算）**，单枚最大 `contract.glb` **202,864 B**（低于 204,800 B 预算）。
- **同步一致性**：`badge-studio/public/models`、`app/public/badges/models`、`app/dist/badges/models`、`deliverables/badges/models` 四处 10 个 GLB + `manifest.json` 逐文件 SHA-256 完全一致。

| 文件 | 字节数 | SHA-256 前 16 位 | 文件 | 字节数 | SHA-256 前 16 位 |
| --- | --- | --- | --- | --- | --- |
| `bronze10.glb` | 111,616 B | `6dbec6c3a01a6a0e` | `meeting.glb` | 152,188 B | `ac867b6a12a0d566` |
| `contract.glb` | 202,864 B | `11aa16ef7dcf6c15` | `platinum100.glb` | 124,888 B | `2ed44b25ef09d4f3` |
| `cooking.glb` | 179,700 B | `a08ffb947569963b` | `reading.glb` | 180,952 B | `c011f323af384a22` |
| `diamond100.glb` | 126,608 B | `2f8bdcf5788f0238` | `silver50.glb` | 133,944 B | `89828685fccd7cf5` |
| `gold100.glb` | 124,848 B | `c5414181f3bea777` | `travel.glb` | 142,388 B | `a08be9e813af2c7d` |
| `manifest.json` | 4,799 B | `ac549fefb40ab4f0` | — | — | — |

### Gemini 升级后验证命令与退出码

| 命令 | 退出码 | 实测结果 |
| --- | --- | --- |
| `node badge-studio/scripts/verify-geometry.mjs` | 0 | 8 条断言全绿，10 枚 115 meshes / 38,588 tris / 49,878 verts |
| `node badge-studio/scripts/verify-geometry-mutations.mjs` | 0 | 13 项缺陷变异全部被断言捕获 |
| `node badge-studio/scripts/verify-viewer-state.mjs` | 0 | 查看器聚焦隔离 / 祖先链拾取 / 复位与返回集合分离通过 |
| `node badge-studio/scripts/export-badges.mjs` | 0 | 10 GLB 重导 + GLTFLoader 重载通过，合计 1,479,996 B |
| `node badge-studio/scripts/package-badges.mjs` | 0 | `badge-models.zip`（303,464 B）、`badge-source.zip`（6,758,551 B）、`badge-images.zip`（8,716,903 B）重打包通过 |
| `node app/scripts/sync-badge-assets.mjs` | 0 | 10 GLB + `manifest.json` + `miniprogram/services/badges.js` 同步完成 |
| `npm run check --prefix badge-studio && npm run build --prefix badge-studio` | 0 | `badge-studio/dist` 编译通过 |
| `npm run build` | 0 | `app`（tsc + vite）与 `server`（tsc）生产构建通过 |
| `npm run lint` | 0 | 前端 ESLint 0 error |
| `cd server && node --import ./node_modules/tsx/dist/loader.mjs --test ../tests/miniprogram/badge-viewer.test.ts` | 0 | 小程序徽章目录、排序与 `xr-frame` 组件 23 项测试全通过 |

---

## 1. 历史基线：最终资产同步（锅体修复轮）

命令：`node app/scripts/sync-badge-assets.mjs`（退出码 0）。

- 来源 `badge-studio/public/models` → `app/public/badges/models`、`app/dist/badges/models`、`miniprogram/assets/badges`、`deliverables/badges/models` 五处 **10 个 GLB + manifest.json 逐文件 SHA-256 完全一致**。
- 缩略图 10 张 256px WebP 合计 **55,778 B（54.5 kB）**，Web 端与 `miniprogram/assets/badges/` 逐张同 hash；`miniprogram/services/badges.js` 由最终 manifest 重新生成。
- `deliverables/wechat-source-final.zip` 已用最新 `miniprogram/` 重打包（96,009 B）。

## 2. 明确未验证（不冒充通过）

1. **微信原生渲染 / 模拟器 / 真机**：xr-scene 是否真的起来、单指拖转与双指捏合、真机 GLTF 解析与显存、切后台 pause/resume，全部未验证。当前主机没有微信开发者工具与 CLI，本轮也没有重跑静态编译。
2. **真机模型加载**：`badgeModelBase` 仍是开发期 `http://localhost:7100/badges/models`，真机 HTTPS 合法域名未配置。
3. **Monad 测试网**：未部署、无合约地址、无交易哈希。官方默认 RPC `https://testnet-rpc.monad.xyz` 在本机网络区域被拒（`blocked: restricted region`），Ankr 镜像 `https://rpc.ankr.com/monad_testnet` 实测返回 chainId 10143 可读；实链未执行的原因是等待专用测试钱包与测试 MON 配置。
