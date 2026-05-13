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

/** Check out the repo's base branch and fast-forward pull. Throws if the
 *  working tree is dirty (refuses to mask uncommitted changes). */
export async function checkoutBase(
  path: string,
  baseBranch: string,
): Promise<void> {
  const status = await runGit(["status", "--porcelain"], { cwd: path });
  if (status.stdout.trim().length > 0) {
    throw new GitError(
      ["status"],
      1,
      "dirty working tree (uncommitted changes)",
    );
  }
  await runGit(["checkout", baseBranch], { cwd: path });
  // pull is best-effort: a repo without a remote shouldn't fail the call.
  const hasRemote = await runGit(["remote"], { cwd: path });
  if (hasRemote.stdout.trim().length > 0) {
    await runGit(["pull", "--ff-only"], { cwd: path, allowNonZero: true });
  }
}

/** Create a new branch from HEAD and check it out. */
export async function createBranch(
  path: string,
  branchName: string,
): Promise<void> {
  await runGit(["checkout", "-b", branchName], { cwd: path });
}

/** `git add -A && git commit -m <message>`. Returns committed=false if there
 *  were no changes to stage. */
export async function commitAll(
  path: string,
  message: string,
): Promise<{ committed: boolean; sha?: string }> {
  await runGit(["add", "-A"], { cwd: path });
  // Check whether there is anything staged.
  const diff = await runGit(["diff", "--cached", "--name-only"], {
    cwd: path,
  });
  if (diff.stdout.trim().length === 0) return { committed: false };
  await runGit(["commit", "-m", message], { cwd: path });
  const sha = (await runGit(["rev-parse", "HEAD"], { cwd: path })).stdout
    .trim();
  return { committed: true, sha };
}

/** `git diff base...branch` — the patch introduced by the branch since it
 *  diverged from `base`. */
export async function diffAgainstBase(
  path: string,
  baseBranch: string,
  branchName: string,
): Promise<string> {
  const r = await runGit(["diff", `${baseBranch}...${branchName}`], {
    cwd: path,
  });
  return r.stdout;
}

/** Merge `branch` into `baseBranch`. The repo must be on `baseBranch` before
 *  this is called (callers pair it with `checkoutBase`). */
export async function mergeBranch(
  path: string,
  branch: string,
  strategy: "merge" | "squash",
  message?: string,
): Promise<{ sha: string }> {
  if (strategy === "merge") {
    await runGit(
      ["merge", "--no-ff", branch, "-m", message ?? `Merge ${branch}`],
      { cwd: path },
    );
  } else {
    await runGit(["merge", "--squash", branch], { cwd: path });
    await runGit(["commit", "-m", message ?? `Squash merge ${branch}`], {
      cwd: path,
    });
  }
  const sha = (await runGit(["rev-parse", "HEAD"], { cwd: path })).stdout
    .trim();
  return { sha };
}

/** Delete a local branch. With `force`, uses `-D` and skips merge-state check. */
export async function deleteBranch(
  path: string,
  branch: string,
  force = false,
): Promise<void> {
  await runGit(["branch", force ? "-D" : "-d", branch], { cwd: path });
}

/** Return true if there are any uncommitted changes in the working tree. */
export async function isDirty(path: string): Promise<boolean> {
  const r = await runGit(["status", "--porcelain"], { cwd: path });
  return r.stdout.trim().length > 0;
}

/** List local branch names. */
export async function listBranches(path: string): Promise<string[]> {
  const r = await runGit(["branch", "--format=%(refname:short)"], {
    cwd: path,
  });
  return r.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}
