# Do Something 生活徽章收藏室

10 枚独立 3D 徽章与可交互收藏墙。原生 Three.js 几何与 PBR 材质，Edit3D 负责预览、材质编辑、Play 和保存。

## 系列

- 阅读：鼠尾草珐琅、黄铜书脊与暖白书页。
- 做饭：赤铜锅具、奶油搪瓷与蒸汽饰条。
- 旅行：青钛山峰、罗盘与指针。
- 相见：玫瑰金双环与柔光珍珠。
- 合约基础章：拉丝钛、链节与可编辑演示编号。
- 10 次铜章、50 次银章、100 次金章。
- 100 次同级白金与钻石特别材质章。

这些是虚拟物料，不是已发行 NFT，不表示现实行为经过验证。合约编号 `DEMO-0x71A4-9C2F` 是占位，真实部署后在收藏室设置中替换。10／50／100 次是视觉系列，不读取或伪造用户完成次数。

## 操作

进入 Play 后：

- 鼠标拖动旋转视角，移动产生轻微视差。
- 悬停徽章倾斜与放大，点击聚焦。
- A / ← 上一枚，D / → 下一枚。
- 空格切换自动旋转，R 复位并停止旋转。

编辑模式可选择每枚徽章，修改位置、旋转、缩放和材质。收藏室设置支持自动旋转速度与演示合约编号。

## 运行与验证

```bash
npm install
npm run check
npm run build
npm run dev
```

项目通过 Edit3D 场景协议打开。`src/review.js` 记录实际执行的内容检查，不用编译成功代替视觉验收。

## 导出

```bash
node scripts/export-badges.mjs
node scripts/export-badge-images.mjs
```

- `public/models/`：10 个独立 GLB 与 manifest，已逐一通过 GLTFLoader 重载检查。
- `../deliverables/badges/images/`：总览、10 张 1000×1000 单徽章 PNG 与联系表。

GLB 只包含静态模型及可表达的 PBR 材质，不包含鼠标交互、Edit3D 参数、Play 逻辑或 HDRI 环境。预览图的反射效果依赖场景摄影棚。

## 素材许可

摄影棚 HDRI 为 Poly Haven Studio Small 09 CC0，立体文字使用 Three.js 示例字体。详见 `docs/credits.md` 与 `docs/design-brief.md`。
