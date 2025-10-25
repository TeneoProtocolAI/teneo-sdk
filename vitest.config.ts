import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: [
        "node_modules/**",
        "dist/**",
        "examples/**",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/index.ts",
        "vitest.config.ts"
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      }
    },
    include: ["src/**/*.test.ts", "src/**/*.spec.ts", "tests/**/*.test.ts", "tests/**/*.spec.ts"],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 10000,
    hookTimeout: 10000
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@types": path.resolve(__dirname, "./src/types"),
      "@core": path.resolve(__dirname, "./src/core"),
      "@handlers": path.resolve(__dirname, "./src/handlers"),
      "@formatters": path.resolve(__dirname, "./src/formatters"),
      "@utils": path.resolve(__dirname, "./src/utils")
    }
  }
});
