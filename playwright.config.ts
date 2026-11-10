import { defineConfig } from '@playwright/test';

// Software WebGL 2 (SwiftShader) is slow: small viewport, one worker, generous timeouts.
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/pw',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 1,
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
