import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/node/**/*.spec.ts", "test/hn-api-mapper.spec.ts"],
    environment: "node",
  },
});
