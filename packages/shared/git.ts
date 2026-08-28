export function getCommitHash() {
  try {
    const { stdout } = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"]);
    return stdout.toString().trim();
  } catch {
    return process.env.GIT_COMMIT_SHA?.slice(0, 8) || null;
  }
}
