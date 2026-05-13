import { describe, test, expect, beforeAll } from "bun:test";
import { mkdtempSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

import * as git from "../../src/main/git/ops";

function shellGit(cwd: string, args: string[]) {
  execSync(`git ${args.map((a) => `"${a}"`).join(" ")}`, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "tide-git-"));
  shellGit(dir, ["init", "--initial-branch=main"]);
  shellGit(dir, ["config", "user.email", "tide@local"]);
  shellGit(dir, ["config", "user.name", "Tide"]);
  writeFileSync(join(dir, "README.md"), "# alpha\n");
  shellGit(dir, ["add", "."]);
  shellGit(dir, ["commit", "-m", "init"]);
  return dir;
}

let repo: string;
beforeAll(() => {
  repo = makeRepo();
});

describe("isGitRepo / detectBaseBranch", () => {
  test("isGitRepo true on a real repo, false elsewhere", async () => {
    expect(await git.isGitRepo(repo)).toBe(true);
    expect(await git.isGitRepo(join(repo, "..", "non-existent"))).toBe(false);
  });
  test("detectBaseBranch returns 'main' for a fresh init", async () => {
    expect(await git.detectBaseBranch(repo)).toBe("main");
  });
});

describe("createBranch + commitAll + diffAgainstBase", () => {
  test("creates branch, commits a file, diff shows it", async () => {
    await git.createBranch(repo, "tide/feature-x");
    writeFileSync(join(repo, "feature.md"), "# feature\n");
    const r = await git.commitAll(repo, "add feature");
    expect(r.committed).toBe(true);
    expect(r.sha?.length).toBeGreaterThan(0);

    const diff = await git.diffAgainstBase(repo, "main", "tide/feature-x");
    expect(diff).toContain("feature.md");
    expect(diff).toContain("+# feature");
  });

  test("commitAll with no changes returns committed=false", async () => {
    const r = await git.commitAll(repo, "noop");
    expect(r.committed).toBe(false);
  });
});

describe("checkoutBase", () => {
  test("checkoutBase clean works; refuses dirty tree", async () => {
    // Currently on tide/feature-x with no uncommitted changes — clean.
    await git.checkoutBase(repo, "main");
    expect((await git.listBranches(repo)).includes("main")).toBe(true);

    // Now create a dirty edit on main and confirm checkoutBase throws.
    appendFileSync(join(repo, "README.md"), "extra\n");
    expect(await git.isDirty(repo)).toBe(true);
    await expect(git.checkoutBase(repo, "main")).rejects.toThrow();

    // Clean it up so subsequent tests can run.
    shellGit(repo, ["checkout", "--", "README.md"]);
  });
});

describe("mergeBranch + deleteBranch", () => {
  test("merge --no-ff lands a merge commit, then deletes the branch", async () => {
    await git.checkoutBase(repo, "main");
    const before = (
      await git.runGit(["rev-list", "--count", "HEAD"], { cwd: repo })
    ).stdout.trim();
    await git.mergeBranch(repo, "tide/feature-x", "merge");
    const after = (
      await git.runGit(["rev-list", "--count", "HEAD"], { cwd: repo })
    ).stdout.trim();
    // Merge --no-ff adds at least one new commit on main.
    expect(Number(after)).toBeGreaterThan(Number(before));
    await git.deleteBranch(repo, "tide/feature-x");
    expect((await git.listBranches(repo)).includes("tide/feature-x")).toBe(
      false,
    );
  });

  test("squash merge produces a single new commit", async () => {
    await git.createBranch(repo, "tide/feature-y");
    writeFileSync(join(repo, "y1.md"), "y1\n");
    await git.commitAll(repo, "y1");
    writeFileSync(join(repo, "y2.md"), "y2\n");
    await git.commitAll(repo, "y2");
    await git.checkoutBase(repo, "main");
    const before = Number(
      (await git.runGit(["rev-list", "--count", "HEAD"], { cwd: repo })).stdout,
    );
    await git.mergeBranch(repo, "tide/feature-y", "squash");
    const after = Number(
      (await git.runGit(["rev-list", "--count", "HEAD"], { cwd: repo })).stdout,
    );
    expect(after - before).toBe(1);
    await git.deleteBranch(repo, "tide/feature-y", true);
  });
});

describe("GitError surface", () => {
  test("non-zero exit throws GitError with stderr", async () => {
    try {
      await git.runGit(["checkout", "does-not-exist"], { cwd: repo });
      expect(false).toBe(true); // unreachable
    } catch (e) {
      expect(e).toBeInstanceOf(git.GitError);
      const ge = e as git.GitError;
      expect(ge.code).not.toBe(0);
      expect(ge.stderr.length).toBeGreaterThan(0);
    }
  });
});
