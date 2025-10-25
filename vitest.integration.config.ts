import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["./tests/integration-setup.ts"],
    testTimeout: 60000,
    hookTimeout: 60000
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
