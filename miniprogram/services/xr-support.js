/**
 * xr-frame 运行环境判断。拆成纯函数，便于在没有微信 IDE 的环境下用 node:test 直接验证。
 */

const MIN_SDK_VERSION = '2.32.0';

/** 比较两段式版本号，返回 -1 / 0 / 1。缺段按 0 处理。 */
function compareVersion(left, right) {
  const parse = (value) => String(value || '0').split('.').map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] || 0) - (b[index] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * @param {{ SDKVersion?: string, hasXrFrameSystem?: boolean }} env
 * @returns {{ supported: boolean, reason: string }}
 */
function checkXrSupport(env) {
  if (!env || !env.SDKVersion) {
    return { supported: false, reason: '读不到客户端版本，无法确认是否支持三维预览。' };
  }
  if (env.hasXrFrameSystem === false) {
    return { supported: false, reason: '当前微信版本没有内置 xr-frame 渲染器。' };
  }
  if (compareVersion(env.SDKVersion, MIN_SDK_VERSION) < 0) {
    return { supported: false, reason: `需要微信基础库 ${MIN_SDK_VERSION} 以上，当前是 ${env.SDKVersion}。` };
  }
  return { supported: true, reason: '' };
}

module.exports = { compareVersion, checkXrSupport, MIN_SDK_VERSION };
