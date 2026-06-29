import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";

import { runCLI as runBuildManifestCLI } from "./build-codego-release-manifest.mjs";
import { buildAcceptanceArtifacts } from "./build-codego-release-acceptance-template.mjs";

const tempRoots = [];

after(async () => {
  await Promise.all(
    tempRoots.map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function createFixture() {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "codego-release-acceptance-template-"),
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

  return { root, manifestPath, latestPath };
}

describe("build-codego-release-acceptance-template", () => {
  test("generates a structured acceptance record and markdown checklist", async () => {
    const { root, manifestPath, latestPath } = await createFixture();
    const templateOutPath = path.join(
      root,
      "acceptance",
      "codego-release-acceptance-record.json",
    );
    const checklistOutPath = path.join(
      root,
      "acceptance",
      "codego-release-acceptance-checklist.md",
    );

    const { template } = await buildAcceptanceArtifacts({
      manifestPath,
      latestPath,
      templateOutPath,
      checklistOutPath,
      expectedVersion: "3.16.4",
      previousStableVersionPlaceholder: "3.16.3",
    });

    assert.equal(template.release.version, "3.16.4");
    assert.equal(template.release.previous_stable_version, "3.16.3");
    assert.equal(template.platforms.length, 2);
    assert.deepEqual(
      template.platforms.map((platform) => platform.id),
      ["windows-x64", "linux-x64"],
    );
    assert.equal(
      template.platforms[0].install_artifacts[0].name,
      "CodeGo_3.16.4_x64_zh-CN.msi",
    );
    assert.equal(
      template.platforms[1].updater_targets
        .map((target) => target.target)
        .join(","),
      "linux-x86_64",
    );
    assert.ok(
      template.platforms.every((platform) => platform.scenarios.length === 4),
    );

    const persistedTemplate = JSON.parse(
      await readFile(templateOutPath, "utf8"),
    );
    const checklist = await readFile(checklistOutPath, "utf8");

    assert.equal(persistedTemplate.release.tag_name, "v3.16.4");
    assert.match(checklist, /CodeGo Release Acceptance Checklist/);
    assert.match(checklist, /verify-codego-release-acceptance-record/);
    assert.match(checklist, /Windows x64/);
  });
});
