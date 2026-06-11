import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["tests/**", "node_modules/**"],
  },
  resolve: {
    alias: {
      "@/": new URL("./src/", import.meta.url).pathname,
    },
  },
});
