import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  loadReleaseMetadata,
  normalizePath,
  readJSON,
  validateAcceptanceRecord,
} from "./codego-release-acceptance-lib.mjs";

export async function verifyAcceptanceRecord({
  manifestPath,
  latestPath,
  recordPath,
  expectedVersion,
  requireExecuted = false,
  requirePassed = false,
}) {
  const { release, latest } = await loadReleaseMetadata({
    manifestPath,
    latestPath,
    expectedVersion,
  });
  const record = await readJSON(recordPath, "acceptance record");

  return validateAcceptanceRecord({
    record,
    release,
    latest,
    requireExecuted,
    requirePassed,
  });
}

export async function runCLI(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      manifest: { type: "string" },
      latest: { type: "string" },
      record: { type: "string" },
      "expected-version": { type: "string" },
      "require-executed": { type: "boolean", default: false },
      "require-passed": { type: "boolean", default: false },
    },
    strict: true,
  });

  await verifyAcceptanceRecord({
    manifestPath: normalizePath(values.manifest, "release manifest path"),
    latestPath: normalizePath(values.latest, "latest manifest path"),
    recordPath: normalizePath(values.record, "acceptance record path"),
    expectedVersion: values["expected-version"],
    requireExecuted: values["require-executed"],
    requirePassed: values["require-passed"],
  });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const currentPath = fileURLToPath(import.meta.url);

if (invokedPath === currentPath) {
  runCLI().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
