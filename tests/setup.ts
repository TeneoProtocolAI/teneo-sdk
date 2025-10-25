import { vi, afterEach, afterAll } from "vitest";
import { TextEncoder, TextDecoder } from "util";

// Polyfill TextEncoder/TextDecoder for Node.js environment
global.TextEncoder = TextEncoder as any;
global.TextDecoder = TextDecoder as any;

// Mock console methods to reduce test output noise
global.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  // Keep error for debugging failed tests
  error: console.error
};

// Set test environment variables
process.env.NODE_ENV = "test";

// Mock timers for testing reconnection logic
vi.useFakeTimers({ shouldAdvanceTime: true });

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
  vi.clearAllTimers();
});

// Restore real timers after all tests
afterAll(() => {
  vi.useRealTimers();
});
