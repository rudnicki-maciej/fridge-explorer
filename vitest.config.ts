import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["tests/**", "node_modules/**"],
    setupFiles: ["./src/test-setup.ts"],
  },
  resolve: {
    alias: {
      "@/": new URL("./src/", import.meta.url).pathname,
    },
  },
});
