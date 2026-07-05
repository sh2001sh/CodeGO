import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";

import { runCLI } from "./build-codego-release-manifest.mjs";

const tempRoots = [];

after(async () => {
  await Promise.all(
    tempRoots.map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "codego-release-"));
  tempRoots.push(root);
  const assetsDir = path.join(root, "release-assets");
  await mkdir(assetsDir, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(assetsDir, "CodeGo_3.16.4_x64_zh-CN.msi"),
      "windows-x64",
      "utf8",
    ),
    writeFile(
      path.join(assetsDir, "CodeGo_3.16.4_x64_zh-CN.msi.sig"),
      "sig-win-x64\n",
      "utf8",
    ),
    writeFile(
      path.join(assetsDir, "CodeGo_3.16.4_x64_portable.zip"),
      "portable",
      "utf8",
    ),
    writeFile(
      path.join(assetsDir, "CodeGo_3.16.4_arm64.app.tar.gz"),
      "macos-arm64-updater",
      "utf8",
    ),
    writeFile(
      path.join(assetsDir, "CodeGo_3.16.4_arm64.app.tar.gz.sig"),
      "sig-macos-arm64\n",
      "utf8",
    ),
    writeFile(
      path.join(assetsDir, "CodeGo_3.16.4_arm64.dmg"),
      "macos-arm64-dmg",
      "utf8",
    ),
    writeFile(
      path.join(assetsDir, "CodeGo_3.16.4_x64.app.tar.gz"),
      "macos-x64-updater",
      "utf8",
    ),
    writeFile(
      path.join(assetsDir, "CodeGo_3.16.4_x64.app.tar.gz.sig"),
      "sig-macos-x64\n",
      "utf8",
    ),
    writeFile(
      path.join(assetsDir, "CodeGo_3.16.4_x64.dmg"),
      "macos-x64-dmg",
      "utf8",
    ),
    writeFile(
      path.join(assetsDir, "CodeGo_3.16.4_x64.AppImage"),
      "linux-appimage",
      "utf8",
    ),
    writeFile(
      path.join(assetsDir, "CodeGo_3.16.4_x64.AppImage.sig"),
      "sig-linux\n",
      "utf8",
    ),
    writeFile(
      path.join(assetsDir, "CodeGo_3.16.4_x64.deb"),
      "linux-deb",
      "utf8",
    ),
  ]);
  return root;
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

describe("build-codego-release-manifest", () => {
  test("generates release manifest and updater manifest from release assets", async () => {
    const root = await createFixture();
    const assetsDir = path.join(root, "release-assets");
    const manifestOut = path.join(root, "codego-desktop-release-manifest.json");
    const latestOut = path.join(root, "latest.json");

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
      manifestOut,
      "--latest-out",
      latestOut,
      "--homebrew-url",
      "https://brew.sh/",
    ]);

    const manifest = JSON.parse(await readFile(manifestOut, "utf8"));
    const latest = JSON.parse(await readFile(latestOut, "utf8"));

    assert.equal(manifest.tag_name, "v3.16.4");
    assert.equal(manifest.version, "3.16.4");
    assert.equal(manifest.html_url, "/download?version=v3.16.4");
    assert.equal(manifest.homebrew_url, "https://brew.sh/");
    assert.deepEqual(
      manifest.assets.slice(0, 8).map((asset) => asset.name),
      [
        "CodeGo_3.16.4_x64_zh-CN.msi",
        "CodeGo_3.16.4_x64_portable.zip",
        "CodeGo_3.16.4_x64.dmg",
        "CodeGo_3.16.4_x64.app.tar.gz",
        "CodeGo_3.16.4_arm64.dmg",
        "CodeGo_3.16.4_arm64.app.tar.gz",
        "CodeGo_3.16.4_x64.AppImage",
        "CodeGo_3.16.4_x64.deb",
      ],
    );
    assert.equal(
      manifest.assets.find(
        (asset) => asset.name === "CodeGo_3.16.4_x64_zh-CN.msi",
      )?.digest,
      sha256("windows-x64"),
    );
    assert.equal(
      manifest.platforms["windows-x86_64"]?.url,
      "/downloads/codego/CodeGo_3.16.4_x64_zh-CN.msi",
    );
    assert.equal(
      manifest.platforms["darwin-x86_64"]?.signature,
      "sig-macos-x64",
    );
    assert.equal(
      manifest.platforms["darwin-aarch64"]?.signature,
      "sig-macos-arm64",
    );
    assert.equal(manifest.platforms["linux-x86_64"]?.signature, "sig-linux");

    assert.equal(latest.version, "3.16.4");
    assert.equal(latest.pub_date, "2026-06-28T12:00:00Z");
    assert.deepEqual(latest.platforms, manifest.platforms);
  });
});
