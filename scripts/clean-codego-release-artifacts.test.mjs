import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";

import { cleanCodeGoReleaseArtifacts, runCLI } from "./clean-codego-release-artifacts.mjs";

const tempRoots = [];

after(async () => {
  await Promise.all(
    tempRoots.map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "codego-clean-release-"));
  tempRoots.push(root);

  const bundleRoot = path.join(root, "src-tauri", "target", "release", "bundle");
  const nsisDir = path.join(bundleRoot, "nsis");
  const macDir = path.join(bundleRoot, "macos");
  await mkdir(nsisDir, { recursive: true });
  await mkdir(macDir, { recursive: true });

  await Promise.all([
    writeFile(path.join(nsisDir, "old-installer.exe"), "old-installer", "utf8"),
    writeFile(path.join(macDir, "old-app.tar.gz"), "old-mac", "utf8"),
  ]);

  return { root, bundleRoot };
}

describe("clean-codego-release-artifacts", () => {
  test("removes stale bundle directories under the repo root", async () => {
    const { root, bundleRoot } = await createFixture();

    const result = await cleanCodeGoReleaseArtifacts({ rootDir: root });

    assert.equal(result.dryRun, false);
    assert.ok(result.results.every((item) => item.removed));
    await assert.rejects(() => readdir(bundleRoot), /ENOENT/);
  });

  test("supports dry run without removing directories", async () => {
    const { root, bundleRoot } = await createFixture();

    const result = await cleanCodeGoReleaseArtifacts({
      rootDir: root,
      dryRun: true,
    });

    assert.equal(result.dryRun, true);
    assert.ok(result.results.every((item) => item.removed === false));
    const entries = await readdir(bundleRoot);
    assert.ok(entries.length > 0);
  });

  test("prints usage and exits cleanly", async () => {
    const result = await runCLI(["--help"]);
    assert.equal(result.ok, true);
  });
});
