// Git operations the rest of the app uses. Wrappers over `Bun.spawn`; never
// shell-interpolates user input. Throws GitError on non-zero exit.
//
// Phase 4 lands the subset needed for repo attachment (isGitRepo,
// detectBaseBranch, cloneRepo). Phase 6 lands the worker-side ops
// (checkoutBase, createBranch, commitAll, diffAgainstBase, mergeBranch,
// deleteBranch).

import { existsSync } from "node:fs";
import { join } from "node:path";

export class GitError extends Error {
  constructor(
    public readonly args: string[],
    public readonly code: number,
    public readonly stderr: string,
  ) {
    super(`git ${args.join(" ")} exited ${code}: ${stderr.trim()}`);
  }
}

interface RunOptions {
  cwd?: string;
  allowNonZero?: boolean;
}

export interface GitResult {
  stdout: string;
  stderr: string;
  code: number;
}

export async function runGit(
  args: string[],
  opts: RunOptions = {},
): Promise<GitResult> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: opts.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  if (code !== 0 && !opts.allowNonZero) {
    throw new GitError(args, code, stderr);
  }
  return { stdout, stderr, code };
}

export async function isGitRepo(path: string): Promise<boolean> {
  if (!existsSync(path)) return false;
  if (!existsSync(join(path, ".git"))) return false;
  try {
    const r = await runGit(["rev-parse", "--is-inside-work-tree"], {
      cwd: path,
      allowNonZero: true,
    });
    return r.code === 0 && r.stdout.trim() === "true";
  } catch {
    return false;
  }
}

export async function detectBaseBranch(path: string): Promise<string> {
  // Try origin/HEAD first (clones have this set).
  const sym = await runGit(["symbolic-ref", "refs/remotes/origin/HEAD"], {
    cwd: path,
    allowNonZero: true,
  });
  if (sym.code === 0 && sym.stdout) {
    const ref = sym.stdout.trim(); // refs/remotes/origin/main
    const idx = ref.lastIndexOf("/");
    if (idx >= 0) return ref.slice(idx + 1);
  }
  // Fall back to current branch.
  const cur = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: path,
    allowNonZero: true,
  });
  if (cur.code === 0 && cur.stdout) return cur.stdout.trim();
  return "main";
}

export interface CloneOptions {
  url: string;
  dest: string;
  depth?: number;
}

export async function cloneRepo(opts: CloneOptions): Promise<void> {
  const args = ["clone"];
  if (opts.depth) args.push("--depth", String(opts.depth));
  args.push(opts.url, opts.dest);
  await runGit(args);
}
