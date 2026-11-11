import { expect, test } from '@playwright/test';

// Stream I: Chromium launched WITHOUT the SwiftShader/GPU flags the rest of the suite uses (and with
// 3D APIs off, so the result does not depend on the machine): the game must show its wordless
// "no 3D here" screen with a retry button, not a broken page. (Own file: launch options are per file.)
test.use({ launchOptions: { args: ['--disable-gpu', '--disable-3d-apis', '--mute-audio'] } });

test('no WebGL 2: shows the wordless no-3D screen instead of a broken page', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto('/');
  await expect(page.locator('[data-testid="fail-webgl"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-testid="fail-retry"]')).toBeVisible();
  await expect(page.locator('#boot')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
