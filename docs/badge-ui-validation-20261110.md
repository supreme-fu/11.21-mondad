# 徽章轻量嵌入验证报告（2026-11-10）

执行范围：徽章在 Web App 与微信小程序的轻量展示与单枚自由旋转查看。本文件只记录本轮**实际跑过**的结果，未验证的部分单独列在「待真机 / 待环境」里，不用别处的结论冒充。

## 结论

- **Web 端已完成**：徽章预览列表页 + 单枚 3D 查看器，`npm run build` 与 `npm run lint` 通过，18 项 Playwright 全通过（其中徽章 11 项）。置信度：**高**（断言全部来自真实 Chromium 的网络请求、DOM 与渲染快照观测）。
- **小程序端源码与逻辑已完成**：徽章列表页、详情页、`xr-frame` 查看器组件、资源目录与配置，24 项逻辑 / 静态检查通过。**原生渲染、模拟器交互、真机预览未验证**，当前主机没有微信开发者工具与 CLI。置信度：源码与逻辑 **中高**，真机三维效果 **未知**。
- **实链本轮不部署**：沿用「仅代码 + 本地 EVM」。本地 EVM 联调 14 项通过；Monad 测试网仍无合约地址、无真实交易哈希。置信度：**高**（本地）/ **未执行**（Monad）。
- **最终资产已同步**：几何团队确认最终导出后，本轮只跑了一次 `node app/scripts/sync-badge-assets.mjs`。`badge-studio/public/models` → `app/public/badges/models` 与 `deliverables/badges/models` 逐文件 SHA-256 一致（10 个 GLB + manifest，含 `contract.glb`、`meeting.glb`），缩略图与 `miniprogram/services/badges.js` 由同一脚本重新生成。置信度：**高**（hash 直接比对，不是目测）。

## 所有权边界（本轮实际遵守）

只改：`app/**`、`miniprogram/**`、`tests/e2e/**`、`tests/miniprogram/` 徽章专用文件、`README.md`、`TEST_PLAN.md`、`miniprogram/README.md`、本文件、`docs/core-validation-20261110.md`（按用户指示只修正 Monad 阻塞项措辞）、`docs/final-validation-20261110.md`（本轮新增）、`deliverables/wechat-source-final.zip`。

未改：`badge-studio/**` 几何源、`server/**`、`contracts/**`、`docs/` 下其他文件。没有读原业务数据库，e2e 用 `server/data/e2e.db` + 端口 7101，不占 7100 / 3100，不改 `server/data/do-something.db`。没有创建子代理，没有对外发布。

> 上面这条边界对应「轻量嵌入」那一轮。收尾的锅体修复由几何侧改 `badge-studio/src/badges.js`，本轮（UI 侧）只做资产同步、构建与徽章 e2e 复跑，边界同上：未碰 `server/**`、`contracts/**` 与业务数据库。

## 实际通过的检查（可复现）

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `npm run build --prefix app` | 通过 | three 运行期被切成独立 chunk：`three.module` 753.31 kB、`GLTFLoader` 47.79 kB、`OrbitControls` 20.22 kB、`RoomEnvironment` 2.17 kB，只在打开徽章时才下载 |
| `npm run lint --prefix app` | 通过，0 error | 含新写的查看器、弹窗、列表页 |
| `npm test` | 服务端 25 + 合约 3 + 小程序 24，全通过 | 小程序 24 项为本轮新增 |
| `npm run test:evm` | 14 项通过 | 本地 Hardhat，真实部署、提交、确认、恢复；不是 Monad 交易 |
| `npx playwright test` | 18 项通过 | 徽章 11 + 产品回归 5 + 截图 2 |

### 徽章 e2e 11 项逐条对应

| # | 测试 | 证明什么 | 不能证明什么 |
| --- | --- | --- | --- |
| 1 | 列表首屏只加载缩略图 | 10 张卡片、0 个 `.glb` 请求、0 个 three/GLTFLoader/OrbitControls/RoomEnvironment 请求、0 个 canvas；缩略图全部 `image/webp`、≤256px、<20 kB；页面写出「系列预览」「不代表已获得」「不是 NFT / 积分」 | 不能证明微信端同样零预载 |
| 2 | 点开一枚只下载该枚 | 点击后 `.glb` 请求恰好 1 次且是 `reading.glb`，canvas 恰好 1 个 | 不能证明真机网络表现 |
| 3 | 拖转松手不回弹且能转到背面 | 拖拽采样中相机 z < 0（真的绕到背面），松手后连续两次采样 azimuth / polar / camera / frames 完全一致；复位按钮回到初始位姿且不再产生新帧 | 不能证明触摸手势在 iOS / Android 上的触感 |
| 4 | 滚轮缩放 | 距离可变，且被 `maxDistance = 初始距离 × 2.2` 夹住，不会拉到无穷远 | 不能证明 pinch 手感 |
| 5 | 关闭后清理 | Escape 后 canvas 归 0、`window.__badgeViewer` 快照被删除、后续 600ms 无新帧 | 不能证明 GPU 上下文在所有浏览器都立即释放 |
| 6 | 快速打开又关闭 | 先开 `travel` 立刻关，再开 `meeting`：异步 GLB 解析完成时不往已销毁场景塞模型，同一时刻 canvas 恒为 1；连续切换 `contract` / `diamond100` / `bronze10` 每步都只剩 1 个 canvas | — |
| 7 | 375px 移动端 | 无横向溢出，两列网格卡片宽度 120–375px，弹窗不超出视口，触屏拖转能把 azimuth 推动 > 0.3 rad | — |
| 8 | 五套主题 | `night` / `paper` / `cream` / `morandi` / `editorial` 下都能进列表、都能开出查看器、canvas 恒为 1、关闭归 0、无横向溢出、无 console error / pageerror / 404 | 不能证明主题在微信端生效 |
| 9 | 拿不到 WebGL | 预先把 `getContext('webgl')` 判死：弹出明确提示「当前浏览器没有可用的 WebGL」，不留白屏 canvas，不发出 GLB 请求，重试按钮可点且再次尝试 | 不能覆盖所有真实失败原因（显驱黑名单、上下文丢失等） |
| 10 | Escape 与焦点 | Escape 关闭，焦点回到触发它的那张卡片；Radix focus trap 生效（焦点在弹窗内） | — |
| 11 | 入口 | 顶部导航「徽章预览」与「我的记录」页的入口都能进入 `/badges` | — |

## 资源与体积

- **缩略图**：10 张，256px WebP，合计 **55,778 B（54.5 kB）**；`miniprogram/assets/badges/` 是同批文件（逐张 SHA-256 与 Web 端相同），同样 54.5 kB，直接进包，不占主包多少体积。
- **模型**：10 个 GLB 合计 **1,205,356 B（1.15 MB）**，单枚最大 `contract.glb` 186,468 B；manifest 统计 29,644 三角面 / 41,302 顶点 / 91 mesh。GLB **不进小程序主包**，由 `badgeModelBase` 按需网络拉取；Web 端由服务端托管 `app/dist` 下的 `/badges/models/**`。
- **系列分布**：主题徽章 4、链上完成 1、10/50/100 里程碑 5。列表只显示缩略图 + 标题 + 系列标注，页面与弹窗都写明「系列预览，只用于查看造型；不代表已获得，也不是 NFT、积分或任何奖励」；没有新增任何获得、等级或奖励逻辑。
- 小程序整个工程 52 个文件，按文件字节合计 **120,749 B（117.9 KB）**（`du -sk` 因 4 KB 块分配显示 252 KB），含缩略图；主包远低于 2 MB 上限。

## 小程序实现要点（与官方示例对齐）

xr-frame 是微信原生 renderer，没有安装任何 npm 包。组件与宿主页面的写法逐条对齐 `wechat-miniprogram/miniprogram-demo` 的 `packageXRFrame`：

| 本项目 | 官方参照 | 对齐点 |
| --- | --- | --- |
| `components/badge-viewer/index.json` | `xr-gltf-damageHelmet/index.json` | `{"component":true,"usingComponents":{},"renderer":"xr-frame"}` 完全一致 |
| `pages/badge-detail/badge-detail.json` | 同仓库中宿主页面 | `renderer:"webview"`、`disableScroll:true`、`usingComponents` 注册组件 |
| 详情页传 `width="{{renderWidth}}" height="{{renderHeight}}"` + `style="width:{{width}}px;height:{{height}}px"` | `pages/template/xr-template-loading/index.wxml` | 官方就是这个写法：CSS px 排版，render 像素决定分辨率 |
| `renderWidth = width * pixelRatio` | `pages/behavior-scene/scene-ready.js` | 官方同一个公式 |
| `scene.assets.loadAsset({type:'gltf',assetId,src})` | `components/template/xr-template-loading/index.js` | 同一 API、同一调用形状 |
| 释放时先 `setData({gltfLoaded:false})` 再 `releaseAsset('gltf', id)` | 同文件 `releaseGLTF()` | 官方同一个顺序，先摘节点再释放 |
| `scene.getElementById('camera').getComponent(Transform)` + `quaternion.setFromYawRollPitch(0,0,0)` | `components/template/xr-template-control/index.js` | 官方复位相机的同一套 API |
| `xr-camera ... camera-orbit-control="" target="camera-target"` | `xr-gltf-damageHelmet/index.wxml` | 同一属性写法 |

其他约束：

- 列表页 `badges.wxml` 不含 `badge-viewer`、不含 `xr-scene`，列表不初始化 3D；只有详情页挂载组件，返回时 `detached` 里 `releaseAsset`。
- `app.json` 注册 `pages/badges/badges`、`pages/badge-detail/badge-detail`，并开 `"lazyCodeLoading":"requiredComponents"`。
- 基础库要求 ≥ 2.32.0（`services/xr-support.js` 的 `checkXrSupport`），低于该版本走 `unsupported` 提示，不白屏。
- `services/config.js` 新增 `badgeThumbBase: '/assets/badges'`、`badgeModelBase: 'http://localhost:7100/badges/models'`、`xrFrameMinSDKVersion: '2.32.0'`。**真机必须把 `badgeModelBase` 改成已在 mp 后台配置的 HTTPS 合法域名**，手机不能用电脑的 localhost。
- `services/badges.js` 由 `app/scripts/sync-badge-assets.mjs` 从 manifest 生成，不是手写副本。

## 复验入口

```bash
# Web：构建后用隔离端口跑浏览器测试（不占 7100 / 3100，用 server/data/e2e.db）
npm run build --prefix app
npx playwright test                                  # 18 项
npx playwright test tests/e2e/badges.spec.ts         # 只看徽章 11 项
npx playwright test tests/e2e/badge-screenshots.spec.ts   # 重新生成截图

# 手动看：npm run dev 后开 http://localhost:7100/badges
# 小程序：微信开发者工具导入 miniprogram/（游客 AppID 可做源码与静态编译检查）

# 小程序逻辑与静态检查
npm run test:miniprogram                             # 24 项
```

截图（`test-results/`，已被 `.gitignore` 忽略，每次跑测试重新生成）：

| 文件 | 内容 |
| --- | --- |
| `badges-list-desktop.png` / `badges-list-mobile.png` | 徽章列表桌面 / 375px |
| `badges-viewer-desktop.png` / `badges-viewer-mobile.png` | 单枚查看器桌面 / 375px |
| `badge-viewer-{night,paper,cream,morandi,editorial}.png` | 五套主题下的查看器 |
| `badge-viewer-front.png` / `badge-viewer-back.png` | 同一枚的正视与绕到背面 |

## 待真机 / 待环境（未验证，不冒充通过）

1. **微信原生渲染与交互**：xr-scene 是否真的起来、`camera-orbit-control` 的单指拖转与双指捏合、GLTF 在真机的解析与显存、切后台 `bind:pause` / 回前台 `bind:resume`——全部未验证。当前主机没有微信开发者工具与 CLI。
2. **真机模型加载**：`badgeModelBase` 指向 `http://localhost:7100/badges/models`，只是开发期配置；真机 HTTPS 合法域名尚未配置，未验证真实网络加载。
3. **基础库版本门槛**：2.32.0 是查官方文档得出的门槛值，未在低版本真机上实测降级提示。
4. **WebGL 失败路径**：e2e 用「预先把 `getContext('webgl')` 判死」覆盖了代码路径，但真实环境下的驱动黑名单、上下文丢失等场景未覆盖。
5. **Monad 测试网**：未部署、无合约地址、无交易哈希。官方默认 RPC `https://testnet-rpc.monad.xyz` 在本机返回 `blocked: restricted region`——这是官方按区域默认受限，不是链不可用；Ankr 镜像 `https://rpc.ankr.com/monad_testnet` 实测返回 chainId 10143，可读。真实部署按用户选择等专用测试钱包与测试 MON 配好后再做，阻塞点在钱包 / MON 配置，不在「没有可用 RPC」。
6. **后端结论**：`docs/core-validation-20261110.md` 由 core 工程师撰写，未经 Astra 最后复审前，本文件不把它当作最终通过结论引用。

## 已知取舍与缺陷（主动说明）

1. **浅色舞台是有意选择**。按协调器「以清晰浅背景可见为准」，缩略图与查看器都用透明渲染 + 浅色舞台底色（`--secondary` 即 `--paper-100`，五套主题一致）。代价：`night` 主题下弹窗里有一块亮色面板，与深色对话框有边界；高反光材质（白金、钻石）在浅背景下的边缘对比度低于深背景。已截图人工复核，判定为可接受。
2. **背面补光**。第一版背面偏暗、只剩剪影，已在查看器里补一盏背向方向光（`back`，强度 1.15，位置 `(0.4, 1.4, -4.2)`）；正面法线朝前，这盏灯基本不影响正面亮度，已用前后两张截图对比确认。
3. **WebGL 缺失时的重试会再次失败**。重试按钮真实触发了重建查看器，但环境仍然没有 WebGL，结果还是同一条提示。这是诚实反馈，不是假装成功。
4. **three 主 chunk 753 kB（gzip 191 kB）**。这是 three.js 本身的大小，已在打开徽章时才下载，列表首屏零请求；没有进一步做按需拆包（例如只引 GLTFLoader 需要的 three 子模块），因为收益有限且改动面大。
5. **小程序 `bind:progress` 没有展示百分比**。组件把进度透传成了 `progress` 事件，宿主页面只绑了 ready / loaded / error / unsupported。加载中是「正在加载这一枚的三维模型…」的文字遮罩，没有进度条。轻量展示足够，未加。
6. **模型源已定版**。此前 `badge-studio/public/models/` 的 `contract.glb`、`meeting.glb` 与 `manifest.json` 一度和 `app/public/badges/` 的副本不同（几何工程师还在修浮雕接触与吊环）。最终确认后本轮只同步一次：现在 `badge-studio/public/models`、`app/public/badges/models`、`app/dist/badges/models`、`deliverables/badges/models` 四处逐文件 SHA-256 相同，缩略图按最终 GLB 重新渲染，`miniprogram/services/badges.js` 由最终 manifest 重新生成。
7. **锅体修复后再次同步过一次**（见下节）。除 `cooking.glb` 外 9 个 GLB 与 `manifest.json` 逐字节未变，缩略图合计 55,396 → 55,778 B（唯一变化是 `cooking.webp` 7,018 → 7,400 B，锅体真的进图后熵增加），小程序工程 120,367 → 120,749 B。

## 锅体绕序修复后的复跑（2026-11-10 收尾）

几何侧按 Astra 实拍修掉做饭锅体 `LatheGeometry` 的绕序 / 法线朝内（正序 profile 让 FrontSide 只剩被内盘挡住的锅底，正面图缺整口锅面；修法是反序 profile，材质仍是 FrontSide，未用 DoubleSide 掩盖）。本轮侧只重跑受影响的部分：

| 动作 | 结果 |
| --- | --- |
| `node app/scripts/sync-badge-assets.mjs` | 退出码 0，10 GLB + 10 WebP + `miniprogram/services/badges.js` 一次到位 |
| `npm run build` | 退出码 0，`app/dist/badges/models` 与 `app/public` 同 hash |
| `npx playwright test tests/e2e/badges.spec.ts` | 退出码 0，11 项全通过，22.5 s（列表零预载、单枚按需下载在最终资产上仍成立） |
| `deliverables/wechat-source-final.zip` | 按新 `miniprogram/` 重打包：65 条目，未压缩 120,749 B，与工程树 `diff -rq` 无差异 |

服务端 25 / 合约 3 / 小程序 24 / 本地 EVM 14 与全量 e2e 18 项是上一轮已通过的结果，本次改动不触及这些路径，未重跑。

## 需要协调器 / 用户输入

1. **几何最终导出已同步（已完成）**：跑了 `node app/scripts/sync-badge-assets.mjs`，模型 + 缩略图 + 小程序目录一次到位，并重跑 e2e 确认列表零预载与单枚按需下载在最终资产上仍然成立。
2. 真机预览需要一个 HTTPS 合法域名（或内网穿透地址）来配 `badgeModelBase`；这一项我做不了，需要用户提供。
3. Monad 部署需要专用测试钱包与测试 MON，以及可访问的 RPC。
