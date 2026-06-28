import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import {
  buildAcceptanceTemplate,
  loadReleaseMetadata,
  normalizePath,
  renderAcceptanceChecklist,
} from "./codego-release-acceptance-lib.mjs";

export async function buildAcceptanceArtifacts({
  manifestPath,
  latestPath,
  templateOutPath,
  checklistOutPath,
  expectedVersion,
  previousStableVersionPlaceholder = "<fill-previous-stable-version>",
}) {
  const { release, latest } = await loadReleaseMetadata({
    manifestPath,
    latestPath,
    expectedVersion,
  });

  const template = buildAcceptanceTemplate({
    release,
    latest,
    previousStableVersionPlaceholder,
  });

  const relativeRecordPath =
    path.basename(templateOutPath) || "codego-release-acceptance-record.json";
  const checklist = renderAcceptanceChecklist(template, relativeRecordPath);

  await mkdir(path.dirname(templateOutPath), { recursive: true });
  await mkdir(path.dirname(checklistOutPath), { recursive: true });
  await writeFile(
    templateOutPath,
    `${JSON.stringify(template, null, 2)}\n`,
    "utf8",
  );
  await writeFile(checklistOutPath, checklist, "utf8");

  return {
    template,
    checklist,
  };
}

export async function runCLI(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      manifest: { type: "string" },
      latest: { type: "string" },
      "template-out": { type: "string" },
      "checklist-out": { type: "string" },
      "expected-version": { type: "string" },
      "previous-stable-version-placeholder": {
        type: "string",
        default: "<fill-previous-stable-version>",
      },
    },
    strict: true,
  });

  await buildAcceptanceArtifacts({
    manifestPath: normalizePath(values.manifest, "release manifest path"),
    latestPath: normalizePath(values.latest, "latest manifest path"),
    templateOutPath: normalizePath(
      values["template-out"],
      "acceptance template output path",
    ),
    checklistOutPath: normalizePath(
      values["checklist-out"],
      "acceptance checklist output path",
    ),
    expectedVersion: values["expected-version"],
    previousStableVersionPlaceholder:
      values["previous-stable-version-placeholder"],
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
