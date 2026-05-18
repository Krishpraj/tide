// Assembles the downloadable release zip at landing/tide.zip.
//
// Contents:
//   tide.exe         — single-binary backend (compiled with `bun build --compile`)
//   webview/         — static frontend bundle (produced by `vite build`)
//   README.txt       — minimal run instructions for the recipient
//
// Run order (also wired as `bun run package`):
//   1. bun run build       # builds webview + exe
//   2. bun run package     # zips dist/tide.exe + dist/webview/ → landing/tide.zip

import { existsSync, mkdirSync, rmSync, cpSync, writeFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(import.meta.dir, "..");
const exePath = join(repoRoot, "dist", "tide.exe");
const webviewDir = join(repoRoot, "dist", "webview");
const stagingDir = join(repoRoot, "dist", "tide-release");
const zipPath = join(repoRoot, "landing", "tide.zip");

if (!existsSync(exePath)) {
  console.error(`missing ${exePath} — run \`bun run build\` first`);
  process.exit(1);
}
if (!existsSync(join(webviewDir, "index.html"))) {
  console.error(`missing ${webviewDir}/index.html — run \`bun run build:webview\``);
  process.exit(1);
}

// Stage.
rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });
cpSync(exePath, join(stagingDir, "tide.exe"));
cpSync(webviewDir, join(stagingDir, "webview"), { recursive: true });
writeFileSync(
  join(stagingDir, "README.txt"),
  [
    "Tide — Kanban for AI engineers",
    "",
    "1. Make sure git and the `claude` CLI are on your PATH (https://docs.claude.com/claude-code).",
    "2. Double-click tide.exe. Your default browser will open to the Tide UI.",
    "3. First run creates ./data/ next to the exe for the SQLite DB and cloned repos.",
    "",
    "Need ANTHROPIC_API_KEY instead of `claude login`? Set it in your environment",
    "before launching the exe.",
    "",
  ].join("\r\n"),
);

// Zip via PowerShell's Compress-Archive (no external tooling required on Win11).
rmSync(zipPath, { force: true });
const ps = spawnSync(
  "powershell",
  [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path "${stagingDir}\\*" -DestinationPath "${zipPath}" -CompressionLevel Optimal`,
  ],
  { stdio: "inherit" },
);
if (ps.status !== 0) {
  console.error("Compress-Archive failed");
  process.exit(ps.status ?? 1);
}

const size = statSync(zipPath).size;
console.log(`packaged ${zipPath} (${(size / 1024 / 1024).toFixed(2)} MB)`);
