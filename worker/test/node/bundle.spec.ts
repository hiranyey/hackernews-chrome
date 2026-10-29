import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dist = join(dirname(fileURLToPath(import.meta.url)), "../../dist/worker.js");

describe("worker/dist/worker.js", () => {
  it("is one ES module with no imports", async () => {
    const code = readFileSync(dist, "utf8");
    expect(code).not.toMatch(/^\s*import\s/m);
    expect(code).not.toMatch(/\brequire\s*\(/);
    expect(code).not.toMatch(/\bfrom\s+["']/);
    expect(code).not.toMatch(/node_modules/);
    expect(code).not.toMatch(/cheerio/);
    expect(code).not.toMatch(/escape-html/);

    const mod = await import(dist);
    expect(Object.keys(mod).sort()).toEqual(["default"]);
    expect(typeof mod.default.fetch).toBe("function");
    expect(typeof mod.default.scheduled).toBe("function");
  });
});
