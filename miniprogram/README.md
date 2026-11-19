# Do Something 微信小程序演示版

原生 WXML / WXSS / JavaScript 工程，复用根目录 Express + SQLite 服务端。视觉采用“生活编辑部”，不是 H5 套壳。

## 页面与能力

- 发现：四个主题、参与状态、下拉刷新。
- 主题：接受约定、暂时离开、进入完成流程。
- 完成：自报完成、感受编辑、分享开关、授权经历、模拟／测试网凭证。
- 记录：我的档案、切换阿黎／小舟、注销账户。
- 徽章预览：`pages/badges/badges` 列表只显示包内 256px WebP 缩略图与标题，**不初始化任何三维组件**；点一枚进入 `pages/badge-detail/badge-detail`，由 `components/badge-viewer` 加载这一个 GLB，返回页面即释放资源。
- 边界：链上与链下数据说明，凭证模式从服务端读取。

## 徽章预览的实现边界

- 查看器是微信原生 `xr-frame` 组件（`components/badge-viewer/index.json` 声明 `"renderer": "xr-frame"`），**不需要安装任何 npm 包**；宿主详情页声明 `"renderer": "webview"`。
- 组件与页面写法逐条对齐官方示例 `wechat-miniprogram/miniprogram-demo` 的 `packageXRFrame`：`xr-gltf-damageHelmet`（gltf + camera-orbit-control）、`xr-template-loading`（loadAsset / releaseAsset、宽高与 pixelRatio）、`xr-template-control`（相机 Transform 复位）。
- 基础库要求 ≥ 2.32.0，低于该版本走 `unsupported` 提示，不白屏；判断逻辑在 `services/xr-support.js`。
- 加载中显示文字遮罩，失败给出「重试加载」，不支持三维时明确提示并引导回列表看缩略图。
- 小程序全部是源码与逻辑检查（`npm run test:miniprogram`，24 项），**没有在真机或微信 IDE 上验证过原生渲染与手势**。

## 本地运行

1. 在仓库根目录启动服务：

   ```bash
   npm run dev
   ```

2. 使用微信开发者工具导入本目录 `miniprogram/`。
3. 没有正式 AppID 时可使用游客模式进行源码与静态编译检查；真机预览、上传和发布需要你自己的有效 AppID 与账号权限。
4. 桌面模拟器默认请求 `http://localhost:3100/api`，配置位于 `services/config.js`。开发者工具需要允许本地 HTTP 调试，当前 `urlCheck: false` 仅用于本地演示。
5. 徽章 GLB 的地址在 `services/config.js` 的 `badgeModelBase`，开发期是 `http://localhost:7100/badges/models`（Vite 托管 `app/public/badges/models`）。**真机必须改成已在 mp 后台配置为请求合法域名的 HTTPS 地址**，手机不能用电脑的 localhost。
6. 徽章缩略图在 `assets/badges/`，10 张 256px WebP 合计 54 kB，直接进包；GLB 不进包，按需网络加载。

## 验证边界

- `deliverables/wechat-compiled-final.zip` 是静态编译证据，不是可发布安装包。
- 当前环境没有微信开发者工具与 CLI，原生渲染、模拟器交互和真机预览尚未验证。
- 已通过 Node 模拟 `wx.request` 与存储，执行小程序 API 服务层到真实服务端的双账户完成、分享、相遇和模拟凭证测试。
- 徽章相关的 24 项检查覆盖目录逻辑、xr-frame 组件加载 / 释放 / 重试 / 复位 / 陈旧加载 / 销毁、基础库门槛，以及 JSON / WXML / 资源路径的静态一致性；这些都不能替代真机三维验证。
- 游客 AppID 不代表微信登录、支付、定位、健康数据等原生能力已经接入或验证。

## 数据说明

小程序不另建用户数据库，会话 Cookie 保存在微信本地存储并随请求发送。正文默认私密；注销会删除服务端链下关联。真实测试网历史不可由平台删除，本地模拟不是链上交易。徽章只是造型预览，不代表已获得，也不是 NFT、积分或任何奖励。
