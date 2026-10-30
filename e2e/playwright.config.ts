import { defineConfig, devices } from '@playwright/test';

/**
 * Browser end-to-end suite. Starts two real servers on a throwaway MongoDB database each:
 *  - :4400 with the mock LLM provider (full AI flow)
 *  - :4401 with AI disabled (graceful-degradation flow)
 * Both are freshly seeded with the provided dataset before the tests run.
 * Requires a MongoDB at MONGODB_URI (default mongodb://127.0.0.1:27017) and a built client (`npm run test:e2e` builds it).
 */
const MONGO = process.env.MONGODB_BASE_URI ?? 'mongodb://127.0.0.1:27017';

const server = (port: number, db: string, provider: 'mock' | 'none') => ({
  command: 'npm run seed -w server -- --reset && npm run serve -w server',
  url: `http://localhost:${port}/api/v1/health`,
  reuseExistingServer: false,
  timeout: 90_000,
  env: {
    PORT: String(port),
    MONGODB_URI: `${MONGO}/${db}`,
    LLM_PROVIDER: provider,
    DEMO_MODE: 'true',
    NODE_ENV: 'development',
    LOG_LEVEL: 'warn',
    REFERENCE_DATE: '2026-10-31',
  },
});

export default defineConfig({
  testDir: './specs',
  outputDir: './results',
  reporter: [['list'], ['html', { outputFolder: './report', open: 'never' }]],
  workers: 1, // specs share one seeded database, so they run in order
  fullyParallel: false,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure', viewport: { width: 1360, height: 900 } },
  webServer: [server(4400, 'bookleaf_e2e', 'mock'), server(4401, 'bookleaf_e2e_noai', 'none')],
  projects: [
    { name: 'full-ai', testMatch: /.*\.spec\.ts/, testIgnore: /.*noai\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4400' } },
    { name: 'ai-down', testMatch: /noai\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4401' } },
  ],
});
