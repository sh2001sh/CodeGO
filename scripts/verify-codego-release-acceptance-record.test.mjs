import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";

import { runCLI as runBuildManifestCLI } from "./build-codego-release-manifest.mjs";
import { buildAcceptanceArtifacts } from "./build-codego-release-acceptance-template.mjs";
import { verifyAcceptanceRecord } from "./verify-codego-release-acceptance-record.mjs";

const tempRoots = [];

after(async () => {
  await Promise.all(
    tempRoots.map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function createFixture() {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "codego-release-acceptance-verify-"),
  );
  tempRoots.push(root);
  const assetsDir = path.join(root, "release-assets");
  await mkdir(assetsDir, { recursive: true });

  const assetContents = new Map([
    ["CodeGo_3.16.4_x64_zh-CN.msi", "windows-x64"],
    ["CodeGo_3.16.4_x64_zh-CN.msi.sig", "sig-win-x64\n"],
    ["CodeGo_3.16.4_x64_portable.zip", "portable-x64"],
    ["CodeGo_3.16.4_x64.AppImage", "linux-x64"],
    ["CodeGo_3.16.4_x64.AppImage.sig", "sig-linux-x64\n"],
    ["CodeGo_3.16.4_x64.deb", "linux-deb"],
    ["CodeGo_3.16.4_x64.rpm", "linux-rpm"],
  ]);

  await Promise.all(
    Array.from(assetContents.entries()).map(([name, contents]) =>
      writeFile(path.join(assetsDir, name), contents, "utf8"),
    ),
  );

  const manifestPath = path.join(
    assetsDir,
    "codego-desktop-release-manifest.json",
  );
  const latestPath = path.join(assetsDir, "latest.json");
  const recordPath = path.join(
    root,
    "acceptance",
    "codego-release-acceptance-record.json",
  );

  await runBuildManifestCLI([
    "--assets-dir",
    assetsDir,
    "--download-base-url",
    "/downloads/codego",
    "--version",
    "3.16.4",
    "--published-at",
    "2026-06-28T12:00:00Z",
    "--notes",
    "CodeGo v3.16.4",
    "--manifest-out",
    manifestPath,
    "--latest-out",
    latestPath,
  ]);

  await buildAcceptanceArtifacts({
    manifestPath,
    latestPath,
    templateOutPath: recordPath,
    checklistOutPath: path.join(
      root,
      "acceptance",
      "codego-release-acceptance-checklist.md",
    ),
    expectedVersion: "3.16.4",
  });

  return { manifestPath, latestPath, recordPath };
}

async function loadRecord(recordPath) {
  return JSON.parse(await readFile(recordPath, "utf8"));
}

async function saveRecord(recordPath, record) {
  await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

function markAllScenarios(record, status = "pass") {
  for (const platform of record.platforms) {
    for (const scenario of platform.scenarios) {
      scenario.status = status;
      scenario.environment = `${platform.label} on CI fixture`;
      scenario.executed_at = "2026-06-28T12:34:56Z";
      scenario.notes = `${scenario.title} completed`;
      scenario.evidence = [`artifact://${platform.id}/${scenario.id}`];
    }
  }
  record.summary.operator = "CI";
  record.summary.completed_at = "2026-06-28T12:34:56Z";
  record.summary.notes = "Synthetic acceptance run";
}

describe("verify-codego-release-acceptance-record", () => {
  test("accepts the generated template when closeout gates are not required", async () => {
    const { manifestPath, latestPath, recordPath } = await createFixture();

    const result = await verifyAcceptanceRecord({
      manifestPath,
      latestPath,
      recordPath,
      expectedVersion: "3.16.4",
    });

    assert.equal(result.platformCount, 2);
    assert.equal(result.scenarioCount, 8);
  });

  test("rejects a pending template when executed evidence is required", async () => {
    const { manifestPath, latestPath, recordPath } = await createFixture();

    await assert.rejects(
      () =>
        verifyAcceptanceRecord({
          manifestPath,
          latestPath,
          recordPath,
          expectedVersion: "3.16.4",
          requireExecuted: true,
        }),
      /must be executed/i,
    );
  });

  test("accepts a fully passed record when closeout gates are required", async () => {
    const { manifestPath, latestPath, recordPath } = await createFixture();
    const record = await loadRecord(recordPath);
    markAllScenarios(record, "pass");
    await saveRecord(recordPath, record);

    const result = await verifyAcceptanceRecord({
      manifestPath,
      latestPath,
      recordPath,
      expectedVersion: "3.16.4",
      requireExecuted: true,
      requirePassed: true,
    });

    assert.equal(result.platformCount, 2);
  });

  test("rejects metadata drift in the acceptance record", async () => {
    const { manifestPath, latestPath, recordPath } = await createFixture();
    const record = await loadRecord(recordPath);
    record.platforms[0].install_artifacts[0].digest = "sha256:drifted";
    await saveRecord(recordPath, record);

    await assert.rejects(
      () =>
        verifyAcceptanceRecord({
          manifestPath,
          latestPath,
          recordPath,
          expectedVersion: "3.16.4",
        }),
      /artifact digest mismatch/i,
    );
  });
});
