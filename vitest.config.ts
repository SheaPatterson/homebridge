// Vitest configuration for the backend core.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts", "packages/backend/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/backend/src/core/**", "packages/backend/src/adapters/**"],
      reporter: ["text", "json-summary"],
    },
  },
  resolve: {
    alias: {
      "@smart-home/shared": new URL("./packages/shared/src/index.ts", import.meta.url).pathname,
    },
  },
});