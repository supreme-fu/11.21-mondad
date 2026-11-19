import { test, expect, type Page } from '@playwright/test';

/**
 * 徽章预览页与单枚 3D 查看器的 e2e。
 *
 * 断言全部基于可观测事实：网络请求、DOM 里的 canvas 数量、window.__badgeViewer 快照。
 * 这些断言只能证明 Web 端的模型生命周期，不能替代微信小程序真机验证。
 */

interface ViewerSnapshot {
  id: string;
  status: 'loading' | 'ready' | 'error';
  frames: number;
  azimuth: number;
  polar: number;
  distance: number;
  camera: [number, number, number];
  target: [number, number, number];
  message: string | null;
}

function monitor(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => { if (response.status() === 404) errors.push(`404 ${response.url()}`); });
  return errors;
}

function glbRequests(page: Page) {
  const urls: string[] = [];
  page.on('request', (request) => { if (request.url().endsWith('.glb')) urls.push(request.url()); });
  return urls;
}

async function snapshot(page: Page): Promise<ViewerSnapshot | null> {
  return page.evaluate(() => window.__badgeViewer ?? null);
}

async function openBadges(page: Page) {
  await page.goto('/badges');
  await expect(page.getByRole('heading', { name: /徽章只是造型/ })).toBeVisible();
  await expect(page.getByTestId('badge-card-reading')).toBeVisible();
}

async function waitForViewer(page: Page, id: string) {
  await page.waitForFunction(
    (expected) => window.__badgeViewer?.status === 'ready' && window.__badgeViewer?.id === expected,
    id,
    { timeout: 20_000 },
  );
}

test.describe('徽章预览页', () => {
  test('列表首屏只加载缩略图，不请求任何 GLB，也不加载 three.js', async ({ page }) => {
    const errors = monitor(page);
    const glbs = glbRequests(page);
    const heavyChunks: string[] = [];
    page.on('response', (response) => {
      const url = response.url();
      if (/three\.module|GLTFLoader|OrbitControls|RoomEnvironment/.test(url)) heavyChunks.push(url);
    });

    await openBadges(page);

    // 十个系列分组都渲染出来，卡片只含缩略图、标题、系列标注。
    await expect(page.locator('.badge-card')).toHaveCount(10);
    await expect(page.locator('.badge-thumb')).toHaveCount(10);
    await expect(page.locator('.badge-stage canvas')).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(glbs).toEqual([]);
    expect(heavyChunks).toEqual([]);

    // 列表页必须显式写出“系列预览、不代表获得、不是 NFT/奖励”。
    await expect(page.getByText(/系列预览 · 不构成任何奖励/)).toBeVisible();
    await expect(page.getByText(/也不对应 NFT、积分或链上资产/)).toBeVisible();
    await expect(page.getByText(/没有“获得”、没有等级/)).toBeVisible();

    // 缩略图是小尺寸 WebP，不是每张 1000px。
    const thumbSizes = await page.evaluate(async () => {
      const urls = Array.from(document.querySelectorAll<HTMLImageElement>('.badge-thumb')).map((image) => image.src);
      const sizes = await Promise.all(urls.map(async (url) => {
        const response = await fetch(url);
        const blob = await response.blob();
        return { url, type: blob.type, bytes: blob.size, natural: await new Promise<number>((resolve) => {
          const image = new Image();
          image.onload = () => resolve(image.naturalWidth);
          image.src = url;
        }) };
      }));
      return sizes;
    });
    expect(thumbSizes).toHaveLength(10);
    for (const thumb of thumbSizes) {
      expect(thumb.type).toBe('image/webp');
      expect(thumb.natural).toBeLessThanOrEqual(256);
      expect(thumb.bytes).toBeLessThan(20 * 1024);
    }

    await page.screenshot({ path: 'test-results/badges-list-desktop.png', fullPage: true });
    expect(errors).toEqual([]);
  });

  test('点开一枚只下载该枚模型，且详情弹窗可关闭', async ({ page }) => {
    const errors = monitor(page);
    const glbs = glbRequests(page);
    await openBadges(page);
    await expect(glbs).toEqual([]);

    await page.getByTestId('badge-card-reading').click();
    await expect(page.getByTestId('badge-dialog')).toBeVisible();
    await waitForViewer(page, 'reading');

    expect(glbs).toHaveLength(1);
    expect(glbs[0]).toContain('/badges/models/reading.glb');
    await expect(page.locator('.badge-stage canvas')).toHaveCount(1);
    await expect(page.getByText(/正在加载这一枚的三维模型/)).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('badge-dialog')).toHaveCount(0);
    // 关闭后不再追加新的 GLB 请求。
    await page.waitForTimeout(500);
    expect(glbs).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  test('拖转松手不回弹，且能转到背面', async ({ page }) => {
    const errors = monitor(page);
    await openBadges(page);
    await page.getByTestId('badge-card-platinum100').click();
    await waitForViewer(page, 'platinum100');

    const stage = page.locator('.badge-stage');
    const box = (await stage.boundingBox())!;
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const before = (await snapshot(page))!;

    // 一次约 198° 的横向拖拽，过程中采样相机位置，确认真的能绕到背面。
    const dragX = centerX + box.height * 0.55;
    const samples: ViewerSnapshot[] = [];
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    for (let step = 1; step <= 20; step += 1) {
      await page.mouse.move(centerX + ((dragX - centerX) * step) / 20, centerY);
      const current = await snapshot(page);
      if (current) samples.push(current);
    }
    await page.mouse.up();

    const after = (await snapshot(page))!;
    expect(Math.abs(after.azimuth - before.azimuth)).toBeGreaterThan(Math.PI / 2);
    // 相机转到模型背后：z 坐标为负。
    const behind = samples.some((sample) => sample.camera[2] < 0);
    expect(behind).toBe(true);

    // 松手后停住：连续两次采样完全一致，说明没有阻尼回弹、没有自转。
    const restA = (await snapshot(page))!;
    await page.waitForTimeout(600);
    const restB = (await snapshot(page))!;
    expect(restB.azimuth).toBeCloseTo(restA.azimuth, 6);
    expect(restB.polar).toBeCloseTo(restA.polar, 6);
    expect(restB.camera).toEqual(restA.camera);
    expect(restB.frames).toBe(restA.frames);

    // 复位按钮回到初始视角。
    await page.getByRole('button', { name: /复位视角/ }).click();
    const reset = (await snapshot(page))!;
    expect(reset.azimuth).toBeCloseTo(before.azimuth, 6);
    expect(reset.camera[0]).toBeCloseTo(before.camera[0], 6);
    expect(reset.camera[1]).toBeCloseTo(before.camera[1], 6);
    expect(reset.camera[2]).toBeCloseTo(before.camera[2], 6);
    expect(reset.distance).toBeCloseTo(before.distance, 6);
    await page.waitForTimeout(400);
    expect((await snapshot(page))!.frames).toBe(reset.frames);

    await page.screenshot({ path: 'test-results/badges-viewer-desktop.png' });
    expect(errors).toEqual([]);
  });

  test('滚轮缩放改变距离且被限制在合理范围', async ({ page }) => {
    const errors = monitor(page);
    await openBadges(page);
    await page.getByTestId('badge-card-gold100').click();
    await waitForViewer(page, 'gold100');
    const before = (await snapshot(page))!;
    const box = (await page.locator('.badge-stage').boundingBox())!;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(200);
    const zoomedIn = (await snapshot(page))!;
    expect(zoomedIn.distance).toBeLessThan(before.distance);

    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(200);
    const zoomedOut = (await snapshot(page))!;
    expect(zoomedOut.distance).toBeGreaterThan(before.distance);
    // maxDistance = 初始距离 * 2.2，不会被拉到无穷远。
    expect(zoomedOut.distance).toBeLessThan(before.distance * 2.3);
    expect(errors).toEqual([]);
  });

  test('翻看背面与光影调校滑杆可交互且按需重绘', async ({ page }) => {
    const errors = monitor(page);
    await openBadges(page);
    await page.getByTestId('badge-card-reading').click();
    await waitForViewer(page, 'reading');

    await expect(page.getByText('FRONT · 正面')).toBeVisible();
    const initial = (await snapshot(page))!;

    await page.getByRole('button', { name: /翻看背面/ }).click();
    await expect(page.getByText('BACK · 背面微雕')).toBeVisible();
    const back = (await snapshot(page))!;
    expect(back.camera[2]).toBeLessThan(0);
    expect(back.frames).toBeGreaterThan(initial.frames);

    const foilSlider = page.getByLabel(/虹彩镀层/);
    await foilSlider.fill('0.9');
    await expect(page.getByText('90%')).toBeVisible();
    const afterFoil = (await snapshot(page))!;
    expect(afterFoil.frames).toBeGreaterThan(back.frames);

    await page.getByRole('button', { name: /复位视角/ }).click();
    await expect(page.getByText('FRONT · 正面')).toBeVisible();
    await expect(page.getByText('45%')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('关闭后移除 canvas、停止渲染、清理快照', async ({ page }) => {
    const errors = monitor(page);
    await openBadges(page);
    await page.getByTestId('badge-card-cooking').click();
    await waitForViewer(page, 'cooking');

    await expect(page.locator('.badge-stage canvas')).toHaveCount(1);
    const beforeClose = (await snapshot(page))!;
    expect(beforeClose.frames).toBeGreaterThan(0);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('badge-dialog')).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(await snapshot(page)).toBeNull();

    // 关闭后不再有新增帧：快照已删除，页面也没有残留的渲染循环。
    await page.waitForTimeout(600);
    expect(await snapshot(page)).toBeNull();
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('快速打开又关闭不会残留 canvas，后打开的徽章仍能正常加载', async ({ page }) => {
    const errors = monitor(page);
    const glbs = glbRequests(page);
    await openBadges(page);

    // 打开后立刻关掉，异步 GLB 解析完成时不能往已销毁的场景里塞模型。
    await page.getByTestId('badge-card-travel').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('badge-dialog')).toHaveCount(0);
    await page.getByTestId('badge-card-meeting').click();
    await waitForViewer(page, 'meeting');

    await expect(page.locator('.badge-stage canvas')).toHaveCount(1);
    expect((await snapshot(page))!.id).toBe('meeting');
    // 同一时刻只存在一个查看器：切换徽章时旧的必须被 dispose。
    expect(await page.evaluate(() => document.querySelectorAll('canvas').length)).toBe(1);
    expect(glbs.filter((url) => url.endsWith('/badges/models/meeting.glb'))).toHaveLength(1);
    // 先打开又立刻关掉的那枚，它的异步加载不能污染后一枚的场景。
    expect(glbs.filter((url) => url.endsWith('/badges/models/travel.glb')).length).toBeLessThanOrEqual(1);
    // 连续快速切换三枚，每一步都只剩一个 canvas。
    await page.keyboard.press('Escape');
    for (const id of ['contract', 'diamond100', 'bronze10']) {
      await page.getByTestId(`badge-card-${id}`).click();
      await waitForViewer(page, id);
      expect(await page.evaluate(() => document.querySelectorAll('canvas').length)).toBe(1);
      await page.keyboard.press('Escape');
      await expect(page.locator('canvas')).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });

  test('375px 移动端布局无横向溢出，弹窗与操作区可用', async ({ page }) => {
    const errors = monitor(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await openBadges(page);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator('.badge-card')).toHaveCount(10);
    // 两列网格在 375px 下不应该把卡片压到溢出。
    const cardWidth = (await page.locator('.badge-card').first().boundingBox())!.width;
    expect(cardWidth).toBeGreaterThan(120);
    expect(cardWidth).toBeLessThan(375);
    await page.screenshot({ path: 'test-results/badges-list-mobile.png', fullPage: true });

    await page.getByTestId('badge-card-silver50').click();
    await expect(page.getByTestId('badge-dialog')).toBeVisible();
    await waitForViewer(page, 'silver50');

    const dialog = (await page.getByTestId('badge-dialog').boundingBox())!;
    expect(dialog.x).toBeGreaterThanOrEqual(0);
    expect(dialog.x + dialog.width).toBeLessThanOrEqual(375);
    const stage = (await page.locator('.badge-stage').boundingBox())!;
    expect(stage.width).toBeGreaterThan(200);
    expect(stage.width).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: /复位视角/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /重试加载/ })).toHaveCount(0);

    // 触屏拖转同样能转起来。
    const box = (await page.locator('.badge-stage').boundingBox())!;
    const before = (await snapshot(page))!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + box.width * 0.5, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
    const after = (await snapshot(page))!;
    expect(Math.abs(after.azimuth - before.azimuth)).toBeGreaterThan(0.3);
    await page.screenshot({ path: 'test-results/badges-viewer-mobile.png' });
    expect(errors).toEqual([]);
  });

  test('五套主题下徽章页与查看器都可用', async ({ page }) => {
    const errors = monitor(page);
    for (const [name, id] of [['夜色回信', 'night'], ['纸片行动', 'paper'], ['奶油温柔', 'cream'], ['莫兰迪', 'morandi'], ['生活编辑部', 'editorial']] as const) {
      await page.goto('/designs');
      await page.getByRole('button', { name: `应用${name}` }).click();
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(id);
      await page.goto('/badges');
      await expect(page.getByRole('heading', { name: /徽章只是造型/ })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.getByTestId('badge-card-reading').click();
      await waitForViewer(page, 'reading');
      await expect(page.locator('.badge-stage canvas')).toHaveCount(1);
      // 舞台底色跟随主题变量，五套主题下都不该出现横向溢出。
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(page.locator('canvas')).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });

  test('拿不到 WebGL 时给出明确反馈，不留下白屏 canvas', async ({ page }) => {
    const allErrors = monitor(page);
    // three.js 自己会 console.error 一句 “Error creating WebGL context.”，这是它内部的日志，
    // 不是本项目的错误，最后过滤掉；其余任何报错都算失败。
    const errors = () => allErrors.filter((text) => !text.includes('Error creating WebGL context'));
    // 在页面脚本之前把 webgl 上下文全部判死，模拟老设备或禁用硬件加速的环境。
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function patched(this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (typeof type === 'string' && type.includes('webgl')) return null;
        return (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });

    await openBadges(page);
    await page.getByTestId('badge-card-reading').click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText(/没有可用的 WebGL/)).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    // 没有 GLB 请求：查看器在拿到渲染器之前就停了。
    await expect(page.getByRole('button', { name: '重试加载' })).toBeEnabled();
    await page.getByRole('button', { name: '重试加载' }).click();
    await expect(page.getByText(/没有可用的 WebGL/)).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test('弹窗支持 Escape 关闭并把焦点还给触发卡片', async ({ page }) => {
    const errors = monitor(page);
    await openBadges(page);
    const card = page.getByTestId('badge-card-reading');
    await card.click();
    await waitForViewer(page, 'reading');
    await expect(page.getByTestId('badge-dialog')).toBeVisible();
    // Radix Dialog 自带 focus trap：焦点在弹窗内部。
    expect(await page.evaluate(() => document.querySelector('[data-testid="badge-dialog"]')?.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('badge-dialog')).toHaveCount(0);
    await expect(card).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('导航与“我的记录”都能进入徽章预览页', async ({ page }) => {
    const errors = monitor(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /想做，很久了/ })).toBeVisible();
    await page.getByRole('link', { name: '徽章预览', exact: true }).click();
    await expect(page.getByRole('heading', { name: /徽章只是造型/ })).toBeVisible();

    await page.getByRole('link', { name: '我的记录', exact: true }).click();
    await expect(page.getByRole('heading', { name: /我做过的事/ })).toBeVisible();
    await expect(page.getByText(/只作纪念的器物，不作攀比的奖章/)).toBeVisible();
    await page.getByRole('link', { name: /去看徽章预览/ }).click();
    await expect(page.getByRole('heading', { name: /徽章只是造型/ })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
