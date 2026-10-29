import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseWithCheerio } from "../test/node/cheerio-reference.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = join(root, "fixtures");

for (const name of ["frontpage", "edge-cases"]) {
  const html = readFileSync(join(fixtures, `${name}.html`), "utf8");
  const stories = parseWithCheerio(html);
  writeFileSync(
    join(fixtures, `${name}.expected.json`),
    `${JSON.stringify(stories, null, 2)}\n`,
  );
  console.log(`${name}: ${stories.length} stories`);
}
