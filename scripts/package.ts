// Copies the latest Tauri NSIS installer to landing/ for download.
//
// Run order (also wired as `bun run package`):
//   1. bun run build       # vite build + bun --compile sidecar + cargo tauri build
//   2. bun run package     # copies the NSIS installer to landing/Tide-Setup.exe

import { existsSync, copyFileSync, statSync, mkdirSync, rmSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "..");
const bundleDir = join(repoRoot, "src-tauri", "target", "release", "bundle", "nsis");
const landingDir = join(repoRoot, "landing");
const dest = join(landingDir, "Tide-Setup.exe");

if (!existsSync(bundleDir)) {
  console.error(
    `missing ${bundleDir} — run \`bun run build\` (or \`cargo tauri build\`) first`,
  );
  process.exit(1);
}

const entries = await readdir(bundleDir);
const installer = entries.find((n) => n.endsWith("-setup.exe"));
if (!installer) {
  console.error(`no *-setup.exe found in ${bundleDir}`);
  process.exit(1);
}

mkdirSync(landingDir, { recursive: true });
rmSync(dest, { force: true });
copyFileSync(join(bundleDir, installer), dest);

// The previous source-zip download is superseded by the real installer.
const oldZip = join(landingDir, "tide.zip");
if (existsSync(oldZip)) rmSync(oldZip);

const size = statSync(dest).size;
console.log(`packaged ${dest} (${(size / 1024 / 1024).toFixed(2)} MB)`);
