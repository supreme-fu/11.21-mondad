import { test, expect, type Page } from '@playwright/test';

/**
 * 徽章预览的截图证据。这些截图只服务人工复核，不承担断言职责；
 * 断言都在 badges.spec.ts 里。截图写入 test-results/（已被 .gitignore 忽略），
 * 重新生成：npx playwright test tests/e2e/badge-screenshots.spec.ts
 */

const THEMES = [
  ['夜色回信', 'night'],
  ['纸片行动', 'paper'],
  ['奶油温柔', 'cream'],
  ['莫兰迪', 'morandi'],
  ['生活编辑部', 'editorial'],
] as const;

async function waitForViewer(page: Page, id: string) {
  await page.waitForFunction(
    (expected) => window.__badgeViewer?.status === 'ready' && window.__badgeViewer?.id === expected,
    id,
    { timeout: 20_000 },
  );
}

test.describe('徽章预览截图', () => {
  test('五套主题下的单枚查看器', async ({ page }) => {
    for (const [name, id] of THEMES) {
      await page.goto('/designs');
      await page.getByRole('button', { name: `应用${name}` }).click();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
        .toBe(id);
      await page.goto('/badges');
      await page.getByTestId('badge-card-platinum100').click();
      await waitForViewer(page, 'platinum100');
      await expect(page.locator('.badge-stage canvas')).toHaveCount(1);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `test-results/badge-viewer-${id}.png` });
      await page.keyboard.press('Escape');
      await expect(page.locator('canvas')).toHaveCount(0);
    }
  });

  test('正面与背面视角', async ({ page }) => {
    await page.goto('/badges');
    await page.getByTestId('badge-card-platinum100').click();
    await waitForViewer(page, 'platinum100');
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'test-results/badge-viewer-front.png' });

    const box = (await page.locator('.badge-stage').boundingBox())!;
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + box.height * 0.55, centerY, { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'test-results/badge-viewer-back.png' });
    await page.keyboard.press('Escape');
  });
});
