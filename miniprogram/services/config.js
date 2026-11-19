module.exports = {
  // 本地开发先启动根目录 npm run dev；真机必须改成已备案的 HTTPS 请求域名。
  apiBase: 'http://localhost:3100/api',
  // 徽章缩略图放在包内（每张 256px WebP，几 kB），不占主包多少体积。
  badgeThumbBase: '/assets/badges',
  // 徽章 GLB 不走包体，按需从本项目服务端的 app/public/badges/models 拉取。
  // 开发期指向 localhost:7100；真机必须换成已在 mp 后台配置的 HTTPS 合法域名。
  badgeModelBase: 'http://localhost:7100/badges/models',
  // xr-frame 需要基础库 2.32.0 以上（组件 renderer: 'xr-frame' 自该版本内置）。
  xrFrameMinSDKVersion: '2.32.0',
};
