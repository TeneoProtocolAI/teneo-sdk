import { TextEncoder, TextDecoder } from "util";
import { config } from "dotenv";
import { resolve } from "path";

// Load .env.test file for integration tests
config({ path: resolve(__dirname, "../.env.test") });

// Polyfill TextEncoder/TextDecoder for Node.js environment
global.TextEncoder = TextEncoder as any;
global.TextDecoder = TextDecoder as any;

// Set test environment variables
process.env.NODE_ENV = "test";

// For integration tests, we need REAL timers and REAL console output
// Do NOT mock console or timers for integration tests
