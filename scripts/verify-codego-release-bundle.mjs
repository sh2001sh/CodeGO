import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

function normalizePath(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`Missing required ${label}.`);
  }
  return normalized;
}

function normalizeVersion(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/^[vV]/, "");
  if (!normalized) {
    throw new Error("An expected release version is required.");
  }
  return normalized;
}

function normalizeCSV(value, fallback = "") {
  return String(value || fallback)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function ensureFile(filePath, label) {
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile()) {
    throw new Error(`Missing required ${label}: ${filePath}`);
  }
}

async function readJSON(filePath, label) {
  await ensureFile(filePath, label);
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function sha256File(filePath) {
  const contents = await readFile(filePath);
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
}

function findAssetBySuffix(assets, suffix) {
  const normalizedSuffix = String(suffix || "")
    .trim()
    .toLowerCase();
  return assets.find((asset) =>
    String(asset?.name || "")
      .toLowerCase()
      .endsWith(normalizedSuffix),
  );
}

function inferUpdaterAssetName(platformRecord) {
  const candidate = String(platformRecord?.url || "").trim();
  if (!candidate) {
    return "";
  }
  const parsed = new URL(candidate, "https://codego.local");
  return path.basename(parsed.pathname);
}

async function listFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true }).catch(
    () => null,
  );
  if (!entries) {
    throw new Error(`Missing required directory: ${dirPath}`);
  }
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
}

export async function verifyReleaseBundle({
  assetsDir,
  manifestPath,
  latestPath,
  bundleOutDir,
  expectedVersion,
  requiredPlatformTargets = [],
  requiredAssetSuffixes = [],
  staticRelativeDir = "downloads/codego",
  metadataRelativeDir = "release-metadata/codego",
  runtimeManifestName = "codego-desktop-release-manifest.json",
}) {
  const normalizedVersion = normalizeVersion(expectedVersion);
  const release = await readJSON(manifestPath, "release manifest");
  const latest = await readJSON(latestPath, "updater manifest");

  assert.equal(
    String(release.version || "").trim(),
    normalizedVersion,
    "Release manifest version mismatch",
  );
  assert.equal(
    String(latest.version || "").trim(),
    normalizedVersion,
    "Updater manifest version mismatch",
  );
  assert.equal(
    String(release.tag_name || "").trim(),
    `v${normalizedVersion}`,
    "Release manifest tag mismatch",
  );
  assert.deepEqual(
    latest.platforms || {},
    release.platforms || {},
    "Release manifest and updater manifest platforms differ",
  );

  const assets = Array.isArray(release.assets) ? release.assets : [];
  const assetNames = new Set(assets.map((asset) => String(asset?.name || "")));

  for (const suffix of requiredAssetSuffixes) {
    const asset = findAssetBySuffix(assets, suffix);
    if (!asset) {
      throw new Error(`Missing release asset matching suffix: ${suffix}`);
    }
  }

  for (const asset of assets) {
    const assetName = String(asset?.name || "").trim();
    if (!assetName) {
      throw new Error("Release manifest contains an asset without a name");
    }
    const assetPath = path.join(assetsDir, assetName);
    await ensureFile(assetPath, `asset ${assetName}`);
    const expectedDigest = String(asset?.digest || "").trim();
    if (!expectedDigest) {
      throw new Error(`Asset ${assetName} is missing digest`);
    }
    const actualDigest = await sha256File(assetPath);
    assert.equal(
      actualDigest,
      expectedDigest,
      `Asset digest mismatch: ${assetName}`,
    );
  }

  const releasePlatforms = release.platforms || {};
  for (const target of requiredPlatformTargets) {
    const record = releasePlatforms[target];
    if (!record) {
      throw new Error(`Missing updater platform target: ${target}`);
    }
    if (!String(record.signature || "").trim()) {
      throw new Error(`Updater platform target ${target} is missing signature`);
    }
    const updaterAssetName = inferUpdaterAssetName(record);
    if (!updaterAssetName) {
      throw new Error(`Updater platform target ${target} is missing url`);
    }
    if (!assetNames.has(updaterAssetName)) {
      throw new Error(
        `Updater platform target ${target} points to unknown asset: ${updaterAssetName}`,
      );
    }
    await ensureFile(
      path.join(assetsDir, `${updaterAssetName}.sig`),
      `signature for ${updaterAssetName}`,
    );
  }

  const staticDir = path.join(
    bundleOutDir,
    "static",
    ...staticRelativeDir.split("/"),
  );
  const metadataDir = path.join(
    bundleOutDir,
    "metadata",
    ...metadataRelativeDir.split("/"),
  );
  const runtimeManifestPath = path.join(
    bundleOutDir,
    "runtime",
    ...runtimeManifestName.split("/"),
  );

  const assetFiles = await listFiles(assetsDir);
  const stagedStaticFiles = new Set(await listFiles(staticDir));
  const expectedStaticFiles = assetFiles.filter(
    (name) => !name.endsWith(".json"),
  );

  for (const assetName of expectedStaticFiles) {
    if (!stagedStaticFiles.has(assetName)) {
      throw new Error(
        `Deploy bundle is missing staged static asset: ${assetName}`,
      );
    }
  }

  const sourceManifest = await readFile(manifestPath, "utf8");
  const sourceLatest = await readFile(latestPath, "utf8");
  const metadataManifest = await readFile(
    path.join(metadataDir, path.basename(manifestPath)),
    "utf8",
  );
  const metadataLatest = await readFile(
    path.join(metadataDir, path.basename(latestPath)),
    "utf8",
  );
  const runtimeManifest = await readFile(runtimeManifestPath, "utf8");

  assert.equal(
    metadataManifest,
    sourceManifest,
    "Deploy bundle metadata manifest does not match source manifest",
  );
  assert.equal(
    metadataLatest,
    sourceLatest,
    "Deploy bundle metadata latest.json does not match source latest.json",
  );
  assert.equal(
    runtimeManifest,
    sourceManifest,
    "Deploy bundle runtime manifest does not match source manifest",
  );

  return {
    release,
    latest,
  };
}

export async function runCLI(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      "assets-dir": { type: "string" },
      manifest: { type: "string" },
      latest: { type: "string" },
      "bundle-out": { type: "string" },
      "expected-version": { type: "string" },
      "required-platforms": {
        type: "string",
        default: "windows-x86_64,linux-x86_64",
      },
      "required-asset-suffixes": {
        type: "string",
        default: ".msi,.AppImage",
      },
      "static-relative-dir": {
        type: "string",
        default: "downloads/codego",
      },
      "metadata-relative-dir": {
        type: "string",
        default: "release-metadata/codego",
      },
      "runtime-manifest-name": {
        type: "string",
        default: "codego-desktop-release-manifest.json",
      },
    },
    strict: true,
  });

  await verifyReleaseBundle({
    assetsDir: normalizePath(values["assets-dir"], "assets directory"),
    manifestPath: normalizePath(values.manifest, "release manifest path"),
    latestPath: normalizePath(values.latest, "latest manifest path"),
    bundleOutDir: normalizePath(values["bundle-out"], "deploy bundle path"),
    expectedVersion: normalizePath(
      values["expected-version"],
      "expected version",
    ),
    requiredPlatformTargets: normalizeCSV(values["required-platforms"]),
    requiredAssetSuffixes: normalizeCSV(values["required-asset-suffixes"]),
    staticRelativeDir: values["static-relative-dir"],
    metadataRelativeDir: values["metadata-relative-dir"],
    runtimeManifestName: values["runtime-manifest-name"],
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
