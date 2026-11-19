# 徽章几何复核记录（2026-11-10 第二轮）

对象：`badge-studio/src/badges.js` 生成的十枚生活徽章。
起因：Astra 审图后否掉第一轮几何——大量浮雕悬空、六角吊环与主体脱开、锅钮与锅面断开。
本文记录改了什么、用什么规则验证、实测数字是多少，以及哪些事**没有**做。

结论先行：**十枚徽章 8 条几何断言全绿，13 项历史缺陷变异全部被断言捕获，40 张真实渲染图人工复核无浮空。** 置信度高——但仅限几何与徽章自身，不含 UI 与小程序（见「范围」）。

> 2026-11-10 收尾追加（第 10 节）：Astra 实拍指出做饭锅体 Lathe 法线 / 绕序朝内，正面图缺整口锅面。已按最小修法反序 profile 修复，并新增第 8 条断言（真实 FrontSide 前方射线）+ 2 项变异。
>
> 2026-11-10 审美与造型升级追加（由 **Gemini** 模型执行）：修正 `TextGeometry` 包围盒中心计算与 `100` 光学居中；为`阅读`新增黄铜燕尾书签丝带（`relief-bookmark`）；将`做饭`蒸汽升级为四控制点 S 形升腾曲线；为`相见`新增两侧异步交汇轨迹弧（`relief-orbit-left/right`）；将`白金珍藏`与`钻石微光`内盘升级为深岩灰高反差表盘并补齐钻石章 `100` 数字；收齐外圈与背圈半径消除背面锯齿露边，并新增背面内盘（`base-back-inner`）与双轨交汇微雕印记（`base-back-hallmark`）。升级后十枚合计 **115 meshes / 38,588 triangles / 49,878 vertices / 1,479,996 B**，8 条几何断言与 13 项变异测试全部通过（详见 `docs/final-validation-20261110.md` 第 0 节）。

---

## 1. 范围与所有权

| 目录 | 归属 | 本次是否写入 |
| --- | --- | --- |
| `badge-studio/**` | 本执行器 | 是（`src/badges.js`、`src/game.js`、`src/review.js`、`scripts/**`） |
| `deliverables/badges/**` | 本执行器 | 是（models / images / 三个 zip / 两份报告） |
| `docs/badge-geometry-validation-20261110.md` | 本执行器 | 是（本文） |
| `app/**`、`miniprogram/**`、根 `README.md`、UI 测试 | 另一执行器 | **否，一字未改** |
| `server/**`、`contracts/**` | 另一执行器 | **否，一字未改** |

未创建子代理，未部署，未读取任何业务数据库。渲染只做本地 Playwright + three.js，不起服务端。

`app/public/badges` 与 `miniprogram/assets/badges` 的缩略图同步归另一执行器，本次不写，避免两个进程互覆。
UI 侧的数据源是 `badge-studio/public/models`（已是最新，16:16 导出），`app/scripts/sync-badge-assets.mjs` 指的就是它。

---

## 2. 第一轮的规则错在哪（这是根因，不是造型问题）

旧 `verify-geometry.mjs` 有两条规则互相打架：

1. 要求**所有 relief 的 `minZ >= 0.115`**（盘前平面）；
2. 要求**任何网格对都不许相交**。

两条同时成立时，浮雕既不能贴在盘面上，也不能嵌入盘面，唯一出路就是整块悬在盘前——
于是引擎交出了爆炸图式的悬浮层。Astra 看到的"浮空"不是建模失误，是这条规则逼出来的。

第二轮把规则改成：**正常浮雕与底面的接触、轻微嵌入一律允许；只禁止三类情况——穿到背面去、声明外的错误互穿、以及真正的悬空（表面既不相交也不接近）。** 悬空判定从"Z 坐标阈值"换成"真实表面距离"，因为阈值判不出悬空，也判不出贴底。

---

## 3. 八条断言（`scripts/verify-geometry.mjs`，403 行）

全部基于真实三角形与世界包围盒，不接受口头声明。

| # | 规则 | 抓什么 |
| --- | --- | --- |
| 1 | **平面轴**：`coinBase` 圆柱 Z 向厚度必须 = 0.15 | 六边形曾被 Euler `[π/2,0,π/6]` 搞成 30° 斜轴，Z 向包围盒涨到 0.797 |
| 2 | **穿背板**：任何网格局部 Z 下限不得低于背圈平面 | 做饭锅体曾伸到 `z=-0.13` |
| 3 | **连通实体**：整枚必须是一个连通体，边 = 真实表面相接（相交或最近距离 ≤ `CONTACT_EPS`=0.004） | 浮雕悬空、六角吊环脱开。包围盒只做粗筛，判定走三角形——外圈凸出的包围盒比实际表面高 0.0275，拿包围盒当表面会放过近距离浮空 |
| 4 | **设计接合**：实体相交必须由 `userData.joints` 为双方声明，且嵌入深度 ≤ `JOINT_MAX_DEPTH`=0.02 | `disc-mount` 只授权浮雕嵌进内盘；两块浮雕互咬必须另声明零件级接合号（`pot-neck`/`knob-neck`/`plaque-text`/`ring-stack`），否则算错误穿透 |
| 5 | **正面贴底**：relief 只允许从盘前嵌入，`zMin` 不得低于 `DISC_FRONT_Z - 0.02` | 浮雕绕到背面 |
| 6 | **浮雕可见**：relief 必须高出盘前至少 0.004 | 整块埋进内盘导致图案消失 |
| 7 | **书页层级**：阅读页纹路必须是书页面组的子元素，继承 Y/Z 旋转 | 纹路丢了继承旋转，Z 向不展开 |
| 8 | **锅体绕序与法线朝外**：真实 FrontSide 前方射线第一命中必须是锅盖斜面（`z >= 0.1905`）且法线朝观察者，normal 属性在锅盖斜面 87 个顶点上全部 +Z | 锅体 Lathe 绕序 / 法线朝内，正面渲染整口锅消失（见第 10 节） |

规则 3 的判定核心是 Ericson `closestPtPointTriangle` 的 Voronoi 区精确解（`pointTriangleWithin`）+ Möller–Trumbore 线段-三角形求交。
脚本内置 15 个已知答案自检（覆盖点投影的全部 Voronoi 区），任何一处符号写反就直接退出 1——
因为 Voronoi 判定错一处，"未连接（浮空）"这条断言会整体失效，比漏报更危险。

### 曾经漏掉的两个盲区（已修）

- **两块浮雕互相咬时 `disc-mount` 会放水**：相见双环都带 `disc-mount`，共享令牌检查直接通过，只剩深度下限兜底。
  已改为：浮雕×浮雕必须声明非 `disc-mount` 的零件级接合号。
- **包围盒当表面会假连通**：相见前环曾靠 `base-rim` 鼓出来的包围盒"连上"主体，真实表面距离约 0.35。
  已改为规则 3 走三角形真实距离。

---

## 4. Astra 七处反馈 → 修法与实测

| # | 反馈 | 修法 | 实测（`deliverables/badges/geometry-report.json`） |
| --- | --- | --- | --- |
| 1 | 锅钮与锅面断开 | 加 0.026 直径短颈，坐回锅面 | `relief-pot` z≤0.2185 → `relief-knob-neck` z∈[0.2105, 0.2365]，重叠 0.008 |
| 2 | 蒸汽 / COOK 文字浮空 | 蒸汽改浅浮雕贴内盘，文字嵌进盘面 | `relief-steam-*` z∈[0.1066, 0.1625]、`relief-label` z∈[0.1065, 0.1315]，内盘前在 0.1145，嵌入 0.008 |
| 3 | 相见双环 + 珍珠浮空 | 圆环改 TorusGeometry；后环贴内盘，前环坐下层环顶面并压进去 0.006，两个管实体相咬 | `relief-ring-back` z∈[0.1065,0.1365]、`relief-ring-front` z∈[0.1305,0.1605]，**z 重叠 0.006**（导出的 GLB 实测），双双嵌入内盘 |
| 4 | 链上圆环铭牌文字浮空 | 铭牌文字挂 `plaque-text` 接合号嵌进铭牌 | `relief-plaque` z≤0.1515 → `relief-contract-id` z∈[0.1435,0.1575]，重叠 0.008 |
| 5 | 旅行双山 + 罗盘浮空 | 两山同盘前深度但横向错开，不互叠；罗盘浅背衬贴盘 | `relief-mountain-back/front` 均 z∈[0.1065,0.1765]，投影不重叠，`declaredPairs` 里无山峰互咬 |
| 6 | 金色系文字/刻度浮空 | 刻度嵌入内盘前 0.011，数字嵌 0.008 | `relief-ticks` z∈[0.1065,0.1285]、`relief-count` z∈[0.1065,…]，五枚 task 系全部同值 |
| 7 | 六角吊环悬空（v1 环底 0.689 > 六角上沿 0.667） | 环心下移到 0.78，环底 0.649 | 六角 `base-body` max y = 0.6668，环底 0.649，**嵌入 0.0178**；圆形环底 0.689 vs 主体 0.77，嵌入 0.081 |
| 8 | （规则）minZ≥0.115 + 禁相交逼出爆炸图 | 见第 2 节 | 规则已重写，变异测试逐条证明新规则仍然抓得住真缺陷 |

没有新增任何复杂机械结构：所有连接都是"贴底 / 嵌入 0.008 / 短颈 / 叠层嵌入 0.006"四种手法的组合。

### 关于叠层：从"留缝靠容差"改成"真嵌入"

第一轮修完后，相见/链上的前环是坐下层环顶面再留 0.002 净空。视觉上看不出问题，但它的"相连"
完全依赖 `CONTACT_EPS=0.004` 这个容差——把阈值收紧到 0.001，前环立刻变成浮空，`components` 从 1 变 2。
也就是说那是个"断言认为它连上了"的连接，不是"实体连上了"的连接。

第二轮把 `LAYER_CLEAR=0.002` 换成 `LAYER_EMBED=0.006`：前环往下多压 0.006，两个管在投影重叠处
实体相咬，双方声明 `ring-stack` 接合号。导出的 GLB 里实测 z 重叠 0.0060（相见 `relief-ring-back`
z∈[0.1065,0.1365] 对 `relief-ring-front` z∈[0.1305,0.1605]；链上同理 0.0060）。
这走的正是规则 4 允许的那条路——"声明了接合号的浅嵌入"，而不是靠容差将就。
侧视图看不出差别（0.006 在这个尺度不可见），差别在断言不再依赖阈值。

---

## 5. 实测指标

### 几何（`node scripts/verify-geometry.mjs`，退出码 0）

```
status: passed   failures: []
十枚合计：91 meshes / 29,644 triangles / 41,302 vertices
```

| id | meshes | tris | verts | 接触对 | 连通体 |
| --- | --- | --- | --- | --- | --- |
| reading | 11 | 3800 | 5115 | 11 | 1 |
| cooking | 11 | 4860 | 4755 | 11 | 1 |
| travel | 10 | 3668 | 3588 | 10 | 1 |
| meeting | 9 | 4528 | 3364 | 9 | 1 |
| contract | 10 | 3848 | 6885 | 10 | 1 |
| bronze10 | 8 | 1712 | 3459 | 8 | 1 |
| silver50 | 8 | 2052 | 4359 | 8 | 1 |
| gold100 | 8 | 1956 | 3951 | 8 | 1 |
| platinum100 | 8 | 1956 | 3951 | 8 | 1 |
| diamond100 | 8 | 1264 | 1875 | 8 | 1 |

接触对数等于网格数——每个网格都至少与一个网格真实相接，没有孤立零件。

### GLB 体积（`node scripts/export-badges.mjs`）

单枚预算 204,800 B，十枚合计预算 2,097,152 B。

| id | 修复前 B | 现在 B | 倍数 | 修复前 tris | 现在 tris |
| --- | --- | --- | --- | --- | --- |
| reading | 917,880 | 149,840 | 6.1× | 12,336 | 3,800 |
| cooking | 485,424 | 150,020 | 3.2× | 9,576 | 4,860 |
| travel | 345,744 | 114,636 | 3.0× | 7,040 | 3,668 |
| meeting | 254,024 | 115,568 | 2.2× | 7,972 | 4,528 |
| contract | 1,317,276 | 186,468 | 7.1× | 15,400 | 3,848 |
| bronze10 | 383,256 | 95,228 | 4.0× | 4,576 | 1,712 |
| silver50 | 455,024 | 117,556 | 3.9× | 5,356 | 2,052 |
| gold100 | 347,440 | 108,460 | 3.2× | 4,268 | 1,956 |
| platinum100 | 347,468 | 108,492 | 3.2× | 4,268 | 1,956 |
| diamond100 | 146,700 | 59,088 | 2.5× | 2,168 | 1,264 |
| **合计** | **5,000,236** | **1,205,356** | 4.1× | 74,400 | 29,644 |

体积下降来自圆环换实现：`ExtrudeGeometry` 用 shape 挖洞时每个斜角层都要复制一整圈顶点（相见/链上的环实测 3,840 顶点 / 1,280 三角形），`TorusGeometry` 同样 40 段圆周只要 369 顶点，管径不变，视觉仍是立在内盘前面的圆环。
每个 GLB 都用 `GLTFLoader` 真实重载校验，网格数与包围盒一致，drift < 1e-3。

### 渲染（`node scripts/export-badge-images.mjs`，40 张 PNG，全部 ≥ 20 KB）

`deliverables/badges/images/` 下每枚四张 1000×1000：主图（3/4 视角）+ 正 / 侧 / 背。
侧视图是判断浮雕是否贴底的主视角，已逐张人工复核：做饭、相见、旅行、链上、reading、gold100、diamond100 的侧视图无浮空层、无互穿、无穿背；正视图图案完整。
`contact-sheet.png` 已按新主图重拼（2000×990）。

### 工具链

```
npm run check   → 退出码 0（.edit3d/run.mjs 走仓库内 CLI 回退，不依赖他机绝对路径）
npm run build   → 退出码 0（badge-studio/dist 生成）
```

`.edit3d/run.mjs` 已核实使用本地回退：`plugin.json` 里那台机器的绝对入口不存在时，回退到 `node_modules/@edit3d/cli/dist/cli.js`，日志里打印了回退行。

---

## 6. 负例回归（`scripts/verify-geometry-mutations.mjs`）

把 13 项历史缺陷逐条塞回 `badges.js`，每一条都必须被断言捕获：

| 变异 | 期望断言 | 结果 |
| --- | --- | --- |
| 六角轴改回 Euler `[π/2,0,π/6]` | 平面轴失败 | 捕获 |
| 锅体穿背板 | 穿背板失败 | 捕获 |
| 相见双环回到同一深度且只带 `disc-mount` | 错误穿透 | 捕获 |
| 旅行两山互叠 | 错误穿透 | 捕获 |
| 删掉锅体的接合声明 | 错误穿透 | 捕获 |
| 阅读纹路丢失继承旋转 | 书页层级失败 | 捕获 |
| 文字浮空 | 未连接 | 捕获 |
| 六角吊环悬空 | 未连接 | 捕获 |
| 叠层按 band 而非环高算，浮起 0.012 | 未连接 | 捕获 |
| 叠层嵌入加深到 0.03，超过浅嵌上限 | 接合过深 | 捕获 |
| 锅钮断开 | 未连接 | 捕获 |
| 锅体 Lathe profile 回到正序（绕序 + 法线一起朝内） | 第一命中不是锅盖斜面 | 捕获 |
| 只把锅体 normal 属性取反、绕序不动 | normal 属性朝内 | 捕获 |

输出：`13 项缺陷变异全部被断言捕获`，退出码 0。第 9 项专门复现"包围盒会掩盖的近距离浮空"；
第 10 项是唯一一条正向压测 `JOINT_MAX_DEPTH` 的用例——否则深度上限没有任何变异覆盖。
第 12、13 项成对存在：前者证明 FrontSide 射线断言活着，后者证明 normal 属性断言不是绕序断言的副产品——
只反法线不动绕序时射线照样命中锅面，只有 normal 属性断言会失败。

### 查看器状态回归（`scripts/verify-viewer-state.mjs`，新增）

最小 DOM 桩驱动 `src/game.js`，13 项检查，其中两项是真实缺陷：

- **聚焦时隐藏 `displayRoot`**：徽章全部挂在 `displayRoot` 下，藏父级会把聚焦的那枚一起藏掉，整个聚焦视图变空。已改为只隐藏展墙与陈列架。
- **复位与返回集合混为一谈**：复位（R）现在只重置取景，聚焦态不退出；返回集合走 Esc / 按钮。另加 `visibleChain()` 沿祖先链判可见，否则 Raycaster 会命中被父级藏起来的网格。

---

## 7. 已知限制（不含糊）

1. **合约编号是 `0x71A4` 占位**，非真实部署；里程碑系列（10/50/100 次）是视觉设定，不表示真实完成次数。
2. **GLB 是静态资产**，只含几何与可表达材质，不含鼠标交互、Edit3D 参数或 Play 逻辑。
3. **`app/public/badges` 与 `miniprogram/assets/badges` 本次未刷新**，归另一执行器；根 `README.md`、`docs/badge-ui-validation-20261110.md` 同样未动。
4. **连通性判定基于三角形离散表面**：圆环 40 段时弦差约 0.0005，远小于 0.004 接触阈值，不会把"相接"误判成"悬空"。反方向——相距 0.004 以内即算相连。叠层圆环已经不走这条路了（改为 0.006 实体嵌入），该容差现在只对"真的贴住但没嵌入"的零件对生效；目前十枚里没有这样的零件对，`contactPairs` 全部来自实体相交。
5. **`deliverables/badges/images/overview.png` 已删除**：它是第一轮展厅场景的旧渲染，与新主图不同源，且全库无引用，留着会让人误当最新物料。
6. **未做微信真机验证**：本次没有任何小程序端运行结果，不对此作任何声明。

---

## 8. 交付物路径

| 内容 | 路径 |
| --- | --- |
| 几何报告 | `deliverables/badges/geometry-report.json` |
| 渲染报告 | `deliverables/badges/render-report.json` |
| 模型（10 GLB + manifest） | `deliverables/badges/models/` |
| 查看器数据源（同内容副本） | `badge-studio/public/models/` |
| 图像（10×4 主/正/侧/背 + contact-sheet） | `deliverables/badges/images/` |
| 模型包 | `deliverables/badges/badge-models.zip` |
| 源码包 | `deliverables/badges/badge-source.zip` |
| 图像包 | `deliverables/badges/badge-images.zip` |

`badge-studio/deliverables/badges/` 与 `deliverables/badges/badge-studio/` 两份嵌套副本已删除，`scripts/package-badges.mjs` 每次打包前都会再清一次：

- `badge-studio/deliverables/badges/`——早期 `verify-geometry.mjs` 的报告路径按 cwd 解析，在 `badge-studio/` 下跑会写到嵌套位置，同一份报告两处且新旧不一致（旧副本停在 07:19Z，根副本 08:37Z）。现在报告路径按脚本位置解析，固定落到仓库根。
- `deliverables/badges/badge-studio/`——有人把 `badge-models.zip` 解压到了 `deliverables/` 里，装的是第一轮 GLB（4.5 MB/枚）。现在的模型只在 `deliverables/badges/models/` 与 `badge-studio/public/models/` 两处，内容一致。

顺带修掉 `package-badges.mjs` 初版两个会静默出错的地方：`spawnSync` 的 `cwd` 只决定待打包文件的相对起点，归档写在 cwd 下，给相对名会把 zip 落到 `badge-studio/`；`walk()` 不传 base 会把 `deliverables/badges/images/` 前缀切掉，zip 拿到裸文件名直接报 13。

## 9. 复现

```bash
cd badge-studio
node scripts/verify-geometry.mjs              # 8 条断言，退出码 0
node scripts/verify-geometry-mutations.mjs    # 13 项变异全捕获
node scripts/verify-viewer-state.mjs          # 查看器状态 13 项
node scripts/export-badges.mjs                # GLB + 重载校验 + 体积预算
node scripts/export-badge-images.mjs          # 40 张真实渲染
python3 scripts/make-badge-sheet.py           # contact-sheet.png
node scripts/package-badges.mjs               # 重打包三个 zip，先删嵌套旧副本
npm run check && npm run build
```

以上命令全部保留退出码，任何一步失败即非零结束；没有用 tail 输出充当通过证据。
`package-badges.mjs` 先写 `.tmp` 再替换，中途失败不会把上一版交付包删掉。

---

## 10. 收尾修复：做饭锅体 Lathe 绕序 / 法线朝内（Astra 实拍，2026-11-10）

**症状**：`cooking-front.png` 与主图里没有锅面，只剩双耳、锅钮与蒸汽；不是灯光问题。

**实证**（同一渲染器、同一光照，512px 正面对比，`docs/assets/cooking-pot-before-fix.png` vs `cooking-pot-after-fix.png`）：

| | FrontSide 前方射线 | DoubleSide |
| --- | --- | --- |
| 修复前 | 第一命中 `z=0.1065`（锅底，被内盘前面 0.1145 挡住） | 命中锅面 `z≈0.2128` 但 `face.normal.z=-0.9984` |
| 修复后 | 第一命中 `z=0.2128`，`face.normal.z=+0.9984` | 同左 |

**根因**：`LatheGeometry` 的法线由 profile 走向解析求出（`normal = (dy, -dx)`）。正序 profile 让整个壳体的法线与三角绕序同时朝内——FrontSide 下只剩锅底那圈背面，而锅底在背板方向，正面永远看不到。注意这跟浮雕贴底、连通性、接合深度全都无关：`relief-pot` 的包围盒、三角数、连通性在修复前后一字不变，所以前 7 条断言一条都抓不到它。绕序和法线是渲染层面的缺陷，只有射线 / 法线断言能抓。

**修法**（`src/badges.js` 一行，未用 DoubleSide 掩盖，未改任何几何设计）：

```js
const pot = new THREE.LatheGeometry([...profile].reverse(), 28);
```

反序同时翻转解析法线与三角绕序，`gl_FrontFacing` 与 normal 属性一致朝外。实测锅盖斜面 87 个顶点法线 z ∈ [0.9475, 0.9984]，全部 +Z。

**断言**（第 8 条）：`THREE.Raycaster` + 显式 `material.side = FrontSide`，从 `z=0.6` 沿 -Z 打 4 个采样点，要求第一命中 `z >= 0.1905`（锅盖斜面最外沿）且 `face.normal.z > 0.5`；另查 normal 属性在锅盖斜面全部 +Z。四个采样点实测命中 z = 0.2128 / 0.2114 / 0.2118 / 0.1976，normal.z = +0.9984 / +0.9984 / +0.9984 / +0.9803，已写入 `deliverables/badges/geometry-report.json` 的 `checks.potFrontHits` 与 `checks.potLidNormalsOutward`（`87/87`）。

**变异**：2 项新增（profile 回正序、只反 normal 属性），均被捕获，见第 6 节。

**受影响范围**：只有 `cooking.glb` 与其四张渲染图、`cooking.webp` 变化；其余 9 个 GLB 与 `manifest.json` 逐字节未变。
