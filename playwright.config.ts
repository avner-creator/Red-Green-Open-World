import { defineConfig } from '@playwright/test';

// Software WebGL 2 (SwiftShader) is slow: small viewport, generous timeouts. Spec files run in
// parallel (RG_WORKERS, default 2); tests inside a file share one page and run in order.
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/pw',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: Number(process.env.RG_WORKERS ?? 2),
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${process.env.RG_PORT ?? 4173}`,
    viewport: { width: 640, height: 360 },
    deviceScaleFactor: 1,
    trace: 'off',
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'],
    },
  },
  webServer: {
    command: `npx vite preview --port ${process.env.RG_PORT ?? 4173} --strictPort`,
    port: Number(process.env.RG_PORT ?? 4173),
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
