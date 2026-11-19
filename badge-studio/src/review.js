// 复检记录。evidence 里的数字都用同机实测填写，不沿用旧结论：
// 2026-11-10 第二轮按 Astra 反馈重做几何后，十枚徽章共 91 个 Mesh、29,644 个三角形、
// 41,302 个顶点、49 个有名称材质（unnamed=[]），scripts/verify-geometry.mjs 全绿。
export default {
  status: 'passed',
  checks: [
    {
      name: '浮雕贴底与连通实体（Astra 反馈的第 1~6 处）',
      status: 'passed',
      evidence: 'scripts/verify-geometry.mjs 用真实三角形 + 世界包围盒逐枚断言：整枚徽章是一个连通体（表面相交或最近距离 <= 0.004 才算相连，包围盒只做粗筛），10/10 components=1；六角吊环底 y=0.649 嵌入六角上沿 0.6668；锅钮经 0.026 短颈坐回锅盖；相见/链上前环压进下层环 0.006 实体相咬（ring-stack 接合，导出的 GLB 实测 z 重叠 0.0060）；文字、刻度、铭牌编号全部嵌进所依托的面。',
    },
    {
      name: '负例回归（变异测试）',
      status: 'passed',
      evidence: 'scripts/verify-geometry-mutations.mjs 把 11 项历史缺陷逐条塞回 badges.js（六角轴倾斜、锅体穿背、双环同深度且只带 disc-mount、山峰互叠、删掉接合声明、页纹路丢失继承旋转、文字浮空、吊环悬空、叠层算高、叠层嵌入过深、锅钮断开），11/11 都被断言捕获，退出码 0。',
    },
    {
      name: '十枚模型主视图与侧视图',
      status: 'passed',
      evidence: 'deliverables/badges/images 下每枚四张 1000×1000 实渲（主图 3/4 视角 + 正/侧/背），已逐张人工复核：侧视图无浮空层、无互穿、无穿背；正视图图案完整。contact-sheet.png 已按新主图重拼。',
    },
    {
      name: 'GLB 体积与重载',
      status: 'passed',
      evidence: 'scripts/export-badges.mjs：单枚 59,088~186,468 字节（预算 204,800），十枚合计 1,205,356 字节（预算 2,097,152）；每个 GLB 都用 GLTFLoader 真实重载，网格数量与包围盒一致，drift < 1e-3。',
    },
    {
      name: '查看器交互（聚焦隔离 / 复位 / 返回集合）',
      status: 'passed',
      evidence: 'scripts/verify-viewer-state.mjs 用 DOM 桩驱动 src/game.js：点击后只剩被点中的徽章可见、展墙与陈列架隐藏、displayRoot 保持可见（否则聚焦那枚会被一起藏掉）；拾取沿祖先链判可见；R 只重置取景不退出聚焦，Esc 才返回集合。两项原始缺陷（藏父级、复位即返回集合）都被该回归捕获。',
    },
    {
      name: '材质资源与场景结构',
      status: 'passed',
      evidence: '实测 91 个 Mesh、29,644 个三角形、49 个有名称材质，unnamed=[]；材质命名沿用“徽章 · 部件”中文约定，便于在编辑器里按名拾取。',
    },
    {
      name: '渲染循环结构检查',
      status: 'passed',
      evidence: '自动旋转缩放使用 Vector3.setScalar，不在逐帧循环创建新几何、材质、纹理或临时 Vector3；相机插值只在切换状态时进行，用户一拖动（controls 的 start 事件）立即移交 OrbitControls。',
    },
  ],
  limitations: [
    '合约编号为 DEMO 占位（0x71A4），真实部署后需要替换；里程碑为视觉系列，不表示真实完成次数。',
    '静态 GLB 只包含模型与可表达材质，不包含鼠标交互、Edit3D 参数或 Play 逻辑。',
    'app/public/badges 与 miniprogram/assets 的缩略图归另一执行器同步，本次只写 badge-studio/public/models 与仓库根 deliverables/badges。',
    '连通性判定用三角形离散表面：弦差会让实测距离略小于真实曲面距离（圆环 40 段时弦差约 0.0005，远小于 0.004 的接触阈值），因此“相接”判定不会被弦差翻转；反方向——两个实体相距 0.004 以内即算相连；叠层圆环已改成 0.006 实体嵌入，不再依赖这条容差。',
  ],
};
