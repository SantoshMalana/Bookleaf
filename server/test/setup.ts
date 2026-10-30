// Runs before any test file imports application code, so config picks these up.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/bookleaf_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
process.env.LLM_PROVIDER = 'none';
process.env.DEMO_MODE = 'true';
process.env.AI_BREAKER_THRESHOLD = '3';
process.env.AI_BREAKER_COOLDOWN_MS = '60000';
process.env.REFERENCE_DATE = '2026-10-31';
