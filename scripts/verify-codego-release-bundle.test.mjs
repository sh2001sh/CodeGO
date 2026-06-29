import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";

import { runCLI } from "./build-codego-release-manifest.mjs";
import { runCLI as runBuildDeployBundleCLI } from "./build-codego-release-deploy-bundle.mjs";
import { verifyReleaseBundle } from "./verify-codego-release-bundle.mjs";

const tempRoots = [];

after(async () => {
  await Promise.all(
    tempRoots.map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "codego-release-bundle-"));
  tempRoots.push(root);
  const assetsDir = path.join(root, "release-assets");
  await mkdir(assetsDir, { recursive: true });

  const assetContents = new Map([
    ["CodeGo_3.16.4_x64_zh-CN.msi", "windows-x64"],
    ["CodeGo_3.16.4_x64_zh-CN.msi.sig", "sig-win-x64\n"],
    ["CodeGo_3.16.4_arm64_zh-CN.msi", "windows-arm64"],
    ["CodeGo_3.16.4_arm64_zh-CN.msi.sig", "sig-win-arm64\n"],
    ["CodeGo_3.16.4_x64_portable.zip", "portable-x64"],
    ["CodeGo_3.16.4_arm64_portable.zip", "portable-arm64"],
    ["CodeGo_3.16.4_universal.dmg", "mac-dmg"],
    ["CodeGo_3.16.4_universal.zip", "mac-zip"],
    ["CodeGo_3.16.4_universal.app.tar.gz", "mac-updater"],
    ["CodeGo_3.16.4_universal.app.tar.gz.sig", "sig-mac\n"],
    ["CodeGo_3.16.4_x64.AppImage", "linux-x64"],
    ["CodeGo_3.16.4_x64.AppImage.sig", "sig-linux-x64\n"],
    ["CodeGo_3.16.4_arm64.AppImage", "linux-arm64"],
    ["CodeGo_3.16.4_arm64.AppImage.sig", "sig-linux-arm64\n"],
    ["CodeGo_3.16.4_x64.deb", "linux-deb"],
    ["CodeGo_3.16.4_arm64.deb", "linux-deb-arm"],
    ["CodeGo_3.16.4_x64.rpm", "linux-rpm"],
    ["CodeGo_3.16.4_arm64.rpm", "linux-rpm-arm"],
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
  const bundleOutDir = path.join(root, "deploy-bundle");

  await runCLI([
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

  await runBuildDeployBundleCLI([
    "--assets-dir",
    assetsDir,
    "--manifest",
    manifestPath,
    "--latest",
    latestPath,
    "--bundle-out",
    bundleOutDir,
  ]);

  return { root, assetsDir, manifestPath, latestPath, bundleOutDir };
}

describe("verify-codego-release-bundle", () => {
  test("validates release assets, manifests, updater targets, and deploy bundle", async () => {
    const { assetsDir, manifestPath, latestPath, bundleOutDir } =
      await createFixture();

    const result = await verifyReleaseBundle({
      assetsDir,
      manifestPath,
      latestPath,
      bundleOutDir,
      expectedVersion: "3.16.4",
      requiredPlatformTargets: [
        "windows-x86_64",
        "windows-aarch64",
        "darwin-aarch64",
        "darwin-x86_64",
        "linux-x86_64",
        "linux-aarch64",
      ],
      requiredAssetSuffixes: [
        "_x64_zh-CN.msi",
        "_arm64_zh-CN.msi",
        ".dmg",
        ".app.tar.gz",
        "_x64.appimage",
        "_arm64.appimage",
      ],
    });

    assert.equal(result.release.version, "3.16.4");
    assert.equal(result.latest.version, "3.16.4");
  });

  test("fails when the deploy bundle runtime manifest drifts from the source manifest", async () => {
    const { manifestPath, latestPath, assetsDir, bundleOutDir } =
      await createFixture();

    const runtimeManifestPath = path.join(
      bundleOutDir,
      "runtime",
      "codego-desktop-release-manifest.json",
    );
    await writeFile(runtimeManifestPath, '{"tag_name":"broken"}\n', "utf8");

    await assert.rejects(
      () =>
        verifyReleaseBundle({
          assetsDir,
          manifestPath,
          latestPath,
          bundleOutDir,
          expectedVersion: "3.16.4",
          requiredPlatformTargets: ["windows-x86_64"],
          requiredAssetSuffixes: [".msi"],
        }),
      /runtime manifest does not match source manifest/i,
    );
  });

  test("fails when a manifest asset digest no longer matches the staged file", async () => {
    const { manifestPath, latestPath, assetsDir, bundleOutDir } =
      await createFixture();
    await writeFile(
      path.join(assetsDir, "CodeGo_3.16.4_x64_zh-CN.msi"),
      "corrupted-installer",
      "utf8",
    );

    await assert.rejects(
      () =>
        verifyReleaseBundle({
          assetsDir,
          manifestPath,
          latestPath,
          bundleOutDir,
          expectedVersion: "3.16.4",
          requiredPlatformTargets: ["windows-x86_64"],
          requiredAssetSuffixes: [".msi"],
        }),
      /asset digest mismatch/i,
    );
  });
});
