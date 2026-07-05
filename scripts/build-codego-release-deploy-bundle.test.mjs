import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";

import { runCLI } from "./build-codego-release-deploy-bundle.mjs";

const tempRoots = [];

after(async () => {
  await Promise.all(
    tempRoots.map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "codego-deploy-bundle-"));
  tempRoots.push(root);
  const assetsDir = path.join(root, "release-assets");
  await mkdir(assetsDir, { recursive: true });

  await Promise.all([
    writeFile(
      path.join(assetsDir, "CodeGo_3.16.4_x64_zh-CN.msi"),
      "installer",
      "utf8",
    ),
    writeFile(
      path.join(assetsDir, "CodeGo_3.16.4_x64_zh-CN.msi.sig"),
      "sig-installer",
      "utf8",
    ),
    writeFile(
      path.join(assetsDir, "CodeGo_3.16.4_arm64.dmg"),
      "dmg-arm64",
      "utf8",
    ),
    writeFile(
      path.join(assetsDir, "CodeGo_3.16.4_x64.dmg"),
      "dmg-x64",
      "utf8",
    ),
    writeFile(
      path.join(assetsDir, "note.txt"),
      "ignored-metadata-candidate",
      "utf8",
    ),
    writeFile(
      path.join(assetsDir, "codego-desktop-release-manifest.json"),
      '{"tag_name":"v3.16.4"}\n',
      "utf8",
    ),
    writeFile(
      path.join(assetsDir, "latest.json"),
      '{"version":"3.16.4"}\n',
      "utf8",
    ),
  ]);

  return {
    root,
    assetsDir,
    manifestPath: path.join(assetsDir, "codego-desktop-release-manifest.json"),
    latestPath: path.join(assetsDir, "latest.json"),
  };
}

describe("build-codego-release-deploy-bundle", () => {
  test("stages static assets, runtime manifest, and metadata bundle", async () => {
    const { root, assetsDir, manifestPath, latestPath } = await createFixture();
    const bundleOut = path.join(root, "deploy-bundle");

    await runCLI([
      "--assets-dir",
      assetsDir,
      "--manifest",
      manifestPath,
      "--latest",
      latestPath,
      "--bundle-out",
      bundleOut,
    ]);

    const staticFiles = await readdir(
      path.join(bundleOut, "static", "downloads", "codego"),
    );
    assert.deepEqual(staticFiles.sort(), [
      "CodeGo_3.16.4_arm64.dmg",
      "CodeGo_3.16.4_x64.dmg",
      "CodeGo_3.16.4_x64_zh-CN.msi",
      "CodeGo_3.16.4_x64_zh-CN.msi.sig",
      "note.txt",
    ]);

    const metadataManifest = await readFile(
      path.join(
        bundleOut,
        "metadata",
        "release-metadata",
        "codego",
        "codego-desktop-release-manifest.json",
      ),
      "utf8",
    );
    const metadataLatest = await readFile(
      path.join(
        bundleOut,
        "metadata",
        "release-metadata",
        "codego",
        "latest.json",
      ),
      "utf8",
    );
    const runtimeManifest = await readFile(
      path.join(bundleOut, "runtime", "codego-desktop-release-manifest.json"),
      "utf8",
    );

    assert.equal(metadataManifest, '{"tag_name":"v3.16.4"}\n');
    assert.equal(metadataLatest, '{"version":"3.16.4"}\n');
    assert.equal(runtimeManifest, metadataManifest);
  });
});
