import { getCommitHash } from "./git";

type BuildInfo = {
  commitHash: string | null;
  buildDate: string;
}

function getBuildInfo() {
  return {
    commitHash: getCommitHash(),
    buildDate: new Date().toISOString(),
  }
}

function generateVersionFile(buildInfo: BuildInfo = getBuildInfo()) {
  if (!buildInfo.commitHash) {
    buildInfo.commitHash = "unknown";
  }
  const versionFileContent = `\
// This file is auto-generated.
export const BUILD_INFO = ${JSON.stringify(buildInfo, null, 2)};
`;
  return Bun.write("./generated/version.ts", versionFileContent, { createPath: true });
}

async function main() {
  const buildInfo = getBuildInfo();

  if (buildInfo.commitHash === null) {
    const versionFile = Bun.file("./generated/version.ts");
    if (await versionFile.exists()) {
      console.log("Commit hash not found, but version file already exists. Skipping generation.");
      versionFile.text().then(console.log)
      return
    } else {
      console.log("Commit hash not found and no version file exists. Commit hash will be 'unknown'.");
    }
  }

  generateVersionFile(buildInfo);
}

main();