import { BUILD_INFO } from "./generated/version"
import { getCommitHash } from "./git"

const version = {
  major: 0,
  minor: 1,
  patch: 0,
}

export function getVersionInfo() {
  if (process.env.NODE_ENV === "development") {
    return {
      ...version,
      commitHash: getCommitHash() || BUILD_INFO.commitHash,
      buildDate: new Date().toISOString(),
      env: "development",
    }
  }
  return {
    ...BUILD_INFO,
    ...version,
    env: "production",
  }
}

export function getVersionString({ format = "default" }: { format?: "default" | "short" | "long" } = {}) {
  const { major, minor, patch, commitHash, buildDate, env } = getVersionInfo()
  const commit = commitHash ? `-${commitHash}` : "-unknown"
  const dev = env === "development" ? "-dev" : ""
  if (format === "short") {
    return `${major}.${minor}.${patch}${dev}`
  } else if (format === "long") {
    return `${major}.${minor}.${patch}${commit}${dev} (${buildDate})`
  } else
    return `${major}.${minor}.${patch}${commit}${dev}`
}