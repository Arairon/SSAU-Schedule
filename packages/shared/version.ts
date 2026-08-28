import { BUILD_INFO } from "./generated/version"
import { getCommitHash } from "./git"

const version = {
  major: 0,
  minor: 1,
  patch: 0,
}

type VersionInfo = {
  major: number
  minor: number
  patch: number
  commitHash: string | null
  buildDate: string
  env: "development" | "production"
}

const startTime = new Date()

export function getVersionInfo(): VersionInfo {
  if (import.meta.env.NODE_ENV === "development") {
    return {
      ...version,
      commitHash: getCommitHash() || BUILD_INFO.commitHash,
      buildDate: startTime.toISOString(),
      env: "development",
    }
  }

  return {
    ...BUILD_INFO,
    ...version,
    env: "production",
  }
}

export function getVersionString({ format = "default", versionInfo = undefined }: { format?: "default" | "short" | "long", versionInfo?: VersionInfo } = {}) {
  const { major, minor, patch, commitHash, buildDate: rawBuildDate, env } = versionInfo ?? getVersionInfo()
  const buildDate = rawBuildDate ? new Date(rawBuildDate).toISOString() : "1970-01-01T00:00:00.000Z"
  const commit = commitHash ? `-${commitHash}` : "-unknown"
  const dev = env === "development" ? "-dev" : ""
  if (format === "short") {
    return `${major}.${minor}.${patch}${dev}`
  } else if (format === "long") {
    return `${major}.${minor}.${patch}${commit}${dev} (${buildDate})`
  } else
    return `${major}.${minor}.${patch}${commit}${dev}`
}