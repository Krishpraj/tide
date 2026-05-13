import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

function git(cwd: string, args: string[]) {
  execSync(`git ${args.map((a) => `"${a}"`).join(" ")}`, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** Creates a fresh git repo on disk with a single initial commit. Returns
 *  the absolute path to a subdirectory whose basename is exactly `name`. */
export function makeTestRepo(name = "alpha"): string {
  const outer = mkdtempSync(join(tmpdir(), "tide-repo-"));
  const dir = join(outer, name);
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "--initial-branch=main"]);
  git(dir, ["config", "user.email", "tide-test@local"]);
  git(dir, ["config", "user.name", "Tide Test"]);
  writeFileSync(join(dir, "README.md"), `# ${name}\n`);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "init"]);
  return dir;
}

export function removeTestRepo(path: string) {
  // Remove the outer temp dir we created in makeTestRepo.
  const outer = join(path, "..");
  try {
    rmSync(outer, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}
