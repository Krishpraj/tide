// Copies dist/webview → src-tauri/binaries/webview so it can be shipped as a
// Tauri bundle resource. Keeping it inside src-tauri/ avoids Tauri's `_up_`
// path-rewriting for resources that escape the project root.

import { cpSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "..");
const src = join(repoRoot, "dist", "webview");
const dst = join(repoRoot, "src-tauri", "binaries", "webview");

if (!existsSync(join(src, "index.html"))) {
  console.error(`missing ${src}/index.html — run \`bun run build:webview\` first`);
  process.exit(1);
}

rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });
console.log(`copied webview → ${dst}`);
