import { test, expect, type Page } from '@playwright/test';

function monitor(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => { if (response.status() === 404) errors.push(`404 ${response.url()}`); });
  return errors;
}

async function switchAccount(page: Page, name: '阿黎' | '小舟') {
  await page.getByRole('button', { name: '切换演示账户' }).click();
  const recordsResponse = page.waitForResponse((response) => response.url().endsWith('/api/me/records') && response.status() === 200);
  await page.getByRole('menuitem', { name, exact: true }).click();
  await recordsResponse;
}

async function joinAndCompleteCooking(page: Page) {
  await page.goto('/');
  await page.getByRole('link', { name: /给在乎的人做一道菜/ }).first().click();
  await page.getByRole('button', { name: /接受这个约定/ }).click();
  await page.getByRole('link', { name: '我完成了', exact: true }).click();
  await page.getByRole('button', { name: /确认我已完成/ }).click();
  await expect(page.getByRole('heading', { name: '这件事，已经算数。' })).toBeVisible();
}

test('双账户完成、授权相遇、模拟凭证与撤回分享完整闭环', async ({ page }) => {
  const errors = monitor(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /想做，很久了/ })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'test-results/home-desktop.png', fullPage: true });
  const performance = await page.evaluate(() => {
    const navigation = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return { requests: window.performance.getEntriesByType('resource').length, domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd) };
  });
  console.log('Home performance:', performance);
  expect(performance.requests).toBeLessThan(100);
  expect(performance.domContentLoadedMs).toBeLessThan(5000);

  await page.getByRole('link', { name: '如何相遇', exact: true }).click();
  await expect(page.getByRole('heading', { name: /连接，不必发生在/ })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'test-results/about-desktop.png', fullPage: true });
  await page.getByRole('link', { name: '我的记录', exact: true }).click();
  await expect(page.getByRole('heading', { name: /我做过的事/ })).toBeVisible();
  await page.getByRole('link', { name: '发现主题', exact: true }).click();

  await page.getByRole('link', { name: /给在乎的人做一道菜/ }).first().click();
  await expect(page.getByRole('heading', { name: '给在乎的人做一道菜' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'test-results/activity-desktop.png', fullPage: true });
  await page.getByRole('button', { name: /接受这个约定/ }).click();
  await page.getByRole('link', { name: '我完成了', exact: true }).click();
  await page.getByRole('button', { name: /确认我已完成/ }).click();
  await expect(page.getByRole('heading', { name: '这件事，已经算数。' })).toBeVisible();
  const sharedText = '阿黎第一次认真做了番茄炖牛腩，慢慢吃饭也很值得。';
  await page.getByLabel(/你的感受/).fill(sharedText);
  await page.getByLabel(/允许完成同一主题的人/).check();
  await page.getByRole('button', { name: '保存感受与分享选择' }).click();
  await expect(page.getByText(/感受已保存，并允许/)).toBeVisible();
  await page.getByLabel(/我理解：当前仅生成/).check();
  await page.getByRole('button', { name: '申请本地模拟凭证' }).click();
  await expect(page.getByText('本地模拟已登记（非链上）')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'test-results/completion-desktop.png', fullPage: true });

  await page.getByRole('link', { name: '我的记录', exact: true }).click();
  await expect(page.getByText(sharedText)).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'test-results/records-desktop.png', fullPage: true });

  await switchAccount(page, '小舟');
  await joinAndCompleteCooking(page);
  await expect(page.locator('blockquote')).toContainText(sharedText);
  await expect(page.locator('blockquote')).not.toContainText('示例内容');

  await switchAccount(page, '阿黎');
  await page.goto('/records');
  await page.getByRole('link', { name: /查看给在乎的人做一道菜/ }).click();
  await page.getByLabel(/允许完成同一主题的人/).uncheck();
  await page.getByRole('button', { name: '保存感受与分享选择' }).click();
  await expect(page.getByText('感受已保存，仅自己可见。')).toBeVisible();

  await switchAccount(page, '小舟');
  await page.goto('/records');
  await page.getByRole('link', { name: /查看给在乎的人做一道菜/ }).click();
  await expect(page.locator('blockquote')).toContainText('示例内容');
  await expect(page.locator('blockquote')).not.toContainText(sharedText);
  expect(errors).toEqual([]);
});

test('移动端无横向溢出，长文本安全显示且主要页面可用', async ({ page }) => {
  const errors = monitor(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /想做，很久了/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'test-results/home-mobile.png', fullPage: true });

  await page.getByRole('link', { name: /读完一本想读的短书/ }).first().click();
  await page.getByRole('button', { name: /接受这个约定/ }).click();
  await page.getByRole('link', { name: '我完成了', exact: true }).click();
  await page.getByRole('button', { name: /确认我已完成/ }).click();
  const unsafeText = '<img src=x onerror=alert(1)> 今晚读完了一个短篇。';
  await page.getByLabel(/你的感受/).fill(unsafeText);
  await page.getByLabel(/允许完成同一主题的人/).check();
  await page.getByRole('button', { name: '保存感受与分享选择' }).click();
  await expect(page.getByText(/感受已保存，并允许/)).toBeVisible();
  expect(await page.locator('img[src="x"]').count()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'test-results/completion-mobile.png', fullPage: true });

  await page.getByRole('link', { name: '我的记录', exact: true }).click();
  await expect(page.getByText(new RegExp('今晚读完了一个短篇'))).toBeVisible();
  expect(await page.locator('img[src="x"]').count()).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'test-results/records-mobile.png', fullPage: true });
  await page.getByRole('link', { name: '如何相遇', exact: true }).click();
  await expect(page.getByRole('heading', { name: /连接，不必发生在/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'test-results/about-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('768 与 1024 断点没有横向溢出', async ({ page }) => {
  const errors = monitor(page);
  for (const width of [768, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /想做，很久了/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/home-${width}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});

test('五套完整视觉主题可切换并保持功能页面可用', async ({ page }) => {
  const errors = monitor(page);
  await page.goto('/designs');
  await expect(page.getByRole('heading', { name: /选择看起来更像你的/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/design-gallery.png', fullPage: true });
  for (const [name, id] of [['夜色回信', 'night'], ['纸片行动', 'paper'], ['奶油温柔', 'cream'], ['莫兰迪', 'morandi'], ['生活编辑部', 'editorial']] as const) {
    await page.getByRole('button', { name: `应用${name}` }).click();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(id);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /想做，很久了/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/theme-${id}.png`, fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (id === 'cream' || id === 'morandi') await page.screenshot({ path: `test-results/theme-${id}-mobile.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/designs');
  }
  expect(errors).toEqual([]);
});

test('独立官网介绍页可免登录访问，多断点无横向溢出且联动主应用', async ({ page }) => {
  const errors = monitor(page);
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/intro.html');
    await expect(page.getByRole('heading', { name: /给“改天”一个轻轻的结尾/, level: 1 })).toBeVisible();
    await expect(page.getByText(/独立行动 · 行动后偶遇 · 面向 AI 时代的跨应用个人生活档案门户/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.getByRole('link', { name: /进入应用演示/ }).first().click();
  await expect(page.getByRole('heading', { name: /想做，很久了/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('同一主题可多次完成、可再翻看字条，且 3D 徽章在档案架与完成页点亮并可溯源', async ({ page }) => {
  const errors = monitor(page);
  // 切换为小舟完成两次「去一个一直想去的小地方」（outing），避免被之前阿黎在 cooking 的分享干扰
  await page.goto('/');
  await switchAccount(page, '小舟');

  await page.getByRole('link', { name: /去一个一直想去的小地方/ }).first().click();
  await page.getByRole('button', { name: /接受这个约定/ }).click();
  await page.getByRole('link', { name: '我完成了', exact: true }).click();
  await page.getByRole('button', { name: /确认我已完成/ }).click();
  await expect(page.getByText(/本主题第 1 次完成/)).toBeVisible();

  // 测试“再翻看一张同路人的字条”
  const firstQuote = await page.locator('blockquote p').textContent();
  await page.getByRole('button', { name: /再翻看一张同路人的字条/ }).click();
  await expect(page.locator('blockquote p')).not.toHaveText(firstQuote ?? '');

  // 完成页高亮纪念器物并能打开 3D 弹窗查看溯源
  await expect(page.getByText(/本次行动点亮的纪念器物/)).toBeVisible();
  await page.getByRole('button', { name: /旋转赏鉴.*3D 器物/ }).click();
  await expect(page.getByTestId('badge-dialog')).toBeVisible();
  await expect(page.getByText('本平台真实记录')).toBeVisible();
  await expect(page.getByText('跨应用门户汇聚')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('badge-dialog')).toHaveCount(0);

  // 返回该主题，再次接受约定并完成第 2 次
  await page.getByRole('link', { name: /再去回应一次这个约定/ }).click();
  await expect(page.getByText(/你已回应过这个约定 1 次/)).toBeVisible();
  await page.getByRole('button', { name: /再次接受这个约定/ }).click();
  await page.getByRole('link', { name: '我完成了', exact: true }).click();
  await page.getByRole('button', { name: /确认我已完成/ }).click();
  await expect(page.getByText(/本主题第 2 次完成/)).toBeVisible();

  // 前往我的档案页查看上下文摘要与器物档案架
  await page.getByRole('link', { name: '查看我的档案', exact: true }).click();
  await expect(page.getByText(/个人生活档案门户/)).toBeVisible();
  await expect(page.getByTestId('badge-card-travel')).toHaveAttribute('data-unlocked', 'true');
  await expect(page.getByTestId('badge-card-travel')).toContainText('已点亮');
  await expect(page.getByTestId('badge-wall-meta-travel')).toContainText('Tier A+');
  await expect(page.getByTestId('badge-wall-meta-travel')).toContainText('获得');

  // 验证徽章墙按获得时间与按等级排序切换
  await page.getByTestId('sort-badges-time').click();
  await expect(page.getByTestId('badge-card-travel')).toBeVisible();
  await page.getByTestId('sort-badges-level').click();
  await expect(page.getByTestId('badge-card-travel')).toBeVisible();

  // 验证面向 Agent 的结构化个人身份与 JSON 载荷面板（含 $6 / 60 次生活胶卷包与无感代付账本）
  await expect(page.getByTestId('agent-structured-identity')).toBeVisible();
  await expect(page.getByTestId('gas-sponsorship-banner')).toContainText(/\d+ \/ 10 次/);
  await page.getByTestId('refill-film-roll-btn').click();
  await expect(page.getByTestId('gas-sponsorship-banner')).toContainText(/\d+ \/ 70 次/);
  await page.getByTestId('toggle-agent-json-btn').click();
  await expect(page.getByTestId('agent-json-panel')).toContainText('did:monad:10143');
  await expect(page.getByTestId('agent-json-panel')).toContainText('gasSponsorshipAndCommercialModel');
  expect(errors).toEqual([]);
});

test('读书主题《小王子》共读门槛、双奖叠加 12 DSDEMO、3D 器物溯源与响应式检查', async ({ page }) => {
  const errors = monitor(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await switchAccount(page, '小舟');

  await page.getByRole('link', { name: /读完一本想读的短书/ }).first().click();
  await expect(page.getByTestId('reading-preview-card')).toBeVisible();
  await expect(page.getByTestId('reading-preview-card')).toContainText('《小王子》');
  await expect(page.getByTestId('reading-preview-card')).toContainText('10 DSDEMO');
  await expect(page.getByTestId('reading-preview-card')).toContainText('2 DSDEMO');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole('button', { name: /接受这个约定/ }).click();
  await page.getByRole('link', { name: '我完成了', exact: true }).click();
  await page.getByRole('button', { name: /确认我已完成/ }).click();
  await expect(page.getByRole('heading', { name: '这件事，已经算数。' })).toBeVisible();

  const lab = page.getByTestId('reading-challenge-panel');
  await expect(lab).toBeVisible();
  await expect(page.getByTestId('reading-earned-dsdemo')).toContainText('0 DSDEMO');

  // 点击 80% · 末章未完成，验证合约门槛锁定提示且领奖按钮被禁用
  await page.getByTestId('reading-preset-partial').click();
  await expect(page.getByTestId('reading-threshold-notice')).toContainText('正文末章尚未完成');
  await expect(page.getByTestId('claim-reading-reward-btn')).toBeDisabled();

  // 点击 88% · 末章已完成并领取 10 DSDEMO + 共读勋章
  await page.getByTestId('reading-preset-complete').click();
  await expect(page.getByTestId('claim-reading-reward-btn')).toBeEnabled();
  await page.getByTestId('claim-reading-reward-btn').click();
  await expect(page.getByTestId('reading-proof-box')).toBeVisible();
  await expect(page.getByTestId('reading-badge-token-id')).toContainText(/ReadingBadge #\d+/);
  await expect(page.getByTestId('reading-proof-box')).toContainText('0x');
  await expect(page.getByTestId('reading-earned-dsdemo')).toContainText('10 DSDEMO');

  // 填入狐狸章节书评示例并领取 2 DSDEMO，验证累计 12 DSDEMO 与 EIP-712 摘要
  await page.getByTestId('fill-sample-review-btn').click();
  await expect(page.getByLabel(/你的感受/)).toHaveValue(/狐狸/);
  await page.getByTestId('claim-review-reward-btn').click();
  await expect(page.getByTestId('review-proof-box')).toBeVisible();
  await expect(page.getByTestId('review-proof-box')).toContainText('0x');
  await expect(page.getByTestId('reading-earned-dsdemo')).toContainText('12 DSDEMO');
  await expect(page.getByTestId('reading-ledger-summary')).toContainText('0x3ed53E');

  // 检查 1440px 与 375px 下无横向滚动条溢出
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });

  // 打开 01 阅读 · 一页之间 3D 器物弹窗核对合约溯源信息
  await page.getByRole('button', { name: /旋转赏鉴.*一页之间.*3D 器物/ }).click();
  const dialog = page.getByTestId('badge-dialog');
  await expect(dialog).toBeVisible();
  const anchors = page.getByTestId('badge-contract-anchors');
  await expect(anchors).toContainText('0xf584037417B6A4734656641904B009C0BAB4E720');
  await expect(anchors).toContainText('0x3ed53Ec76b80F4f387401C3e86C1be06b4682ed2');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('注销弹窗支持 Escape，确认后删除账户并回到身份选择', async ({ page }) => {
  const errors = monitor(page);
  await page.goto('/records');
  await page.getByRole('button', { name: '注销当前演示账户' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '注销当前演示账户' }).click();
  await page.getByLabel('输入“注销”确认').fill('注销');
  await page.getByRole('button', { name: '永久注销当前账户' }).click();
  await expect(page.getByRole('heading', { name: '从哪一个演示身份开始？' })).toBeVisible();
  await expect(page.getByRole('button', { name: '以阿黎的身份继续' })).toBeVisible();
  expect(errors).toEqual([]);
});
