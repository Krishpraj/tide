import { mkdir } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { register } from "../rpc/handlers";
import { reposDao } from "./dao";
import { emit } from "../rpc/events";
import { cloneRepo, detectBaseBranch, isGitRepo } from "../git/ops";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function repoStoreRoot(): string {
  return Bun.env.TIDE_DATA_DIR
    ? join(resolve(Bun.env.TIDE_DATA_DIR), "repos")
    : resolve(process.cwd(), "data", "repos");
}

register("listRepos", async (input) => {
  const i = (input ?? {}) as { projectId?: string | null };
  return reposDao.list(i);
});

register("addRepoLocal", async (input) => {
  const i = input as { path: string; projectId: string | null };
  const path = resolve(i.path);
  if (!(await isGitRepo(path))) {
    throw new Error(`not a git repository: ${path}`);
  }
  const existing = reposDao.getByPath(path);
  if (existing) return existing;
  const base = await detectBaseBranch(path);
  const repo = reposDao.insert({
    projectId: i.projectId,
    name: basename(path),
    path,
    baseBranch: base,
  });
  emit("repoUpdated", { repo });
  return repo;
});

register("addRepoClone", async (input) => {
  const i = input as { url: string; name?: string; projectId: string | null };
  const name = (i.name ?? guessRepoName(i.url)).trim() || "repo";
  const dest = join(repoStoreRoot(), slugify(name));
  await mkdir(repoStoreRoot(), { recursive: true });
  await cloneRepo({ url: i.url, dest });
  const base = await detectBaseBranch(dest);
  const repo = reposDao.insert({
    projectId: i.projectId,
    name,
    path: dest,
    originUrl: i.url,
    baseBranch: base,
  });
  emit("repoUpdated", { repo });
  return repo;
});

register("moveRepoToProject", async (input) => {
  const i = input as { repoId: string; projectId: string | null };
  reposDao.setProject(i.repoId, i.projectId);
  const r = reposDao.get(i.repoId);
  if (r) emit("repoUpdated", { repo: r });
});

register("removeRepo", async (id) => {
  reposDao.delete(id as string);
});

function guessRepoName(url: string): string {
  // strip auth, query, then take last path segment, strip .git
  let u = url.trim();
  u = u.replace(/^[a-z]+:\/\/[^/]*@/, "$&".split("@")[0] + "");
  const lastSlash = Math.max(u.lastIndexOf("/"), u.lastIndexOf(":"));
  let tail = lastSlash >= 0 ? u.slice(lastSlash + 1) : u;
  if (tail.endsWith(".git")) tail = tail.slice(0, -4);
  return tail.split("?")[0] ?? tail;
}
