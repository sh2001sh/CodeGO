import assert from "node:assert/strict";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";

function normalizeURL(value, label) {
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

function normalizeCSV(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function readJSON(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Request failed for ${url}: ${response.status} ${response.statusText}`,
    );
  }
  return response.json();
}

async function assertReachable(url, fetchImpl) {
  let response = await fetchImpl(url, { method: "HEAD" });
  if (response.status === 405 || response.status === 501) {
    response = await fetchImpl(url, { method: "GET" });
  }
  if (!response.ok) {
    throw new Error(
      `Asset is not reachable: ${url} (${response.status} ${response.statusText})`,
    );
  }
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

export async function verifyReleaseChannel(
  {
    releaseURL,
    latestURL,
    expectedVersion,
    requiredPlatformTargets = [],
    requiredAssetSuffixes = [],
  },
  fetchImpl = fetch,
) {
  const normalizedReleaseURL = normalizeURL(releaseURL, "release URL");
  const normalizedLatestURL = normalizeURL(latestURL, "latest URL");
  const normalizedVersion = normalizeVersion(expectedVersion);

  const release = await readJSON(normalizedReleaseURL, fetchImpl);
  const latest = await readJSON(normalizedLatestURL, fetchImpl);

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

  const expectedTag = `v${normalizedVersion}`;
  assert.equal(
    String(release.tag_name || "").trim(),
    expectedTag,
    "Release manifest tag mismatch",
  );

  const platforms = latest.platforms || {};
  for (const target of requiredPlatformTargets) {
    if (!platforms[target]) {
      throw new Error(`Missing updater platform target: ${target}`);
    }
    if (!String(platforms[target].url || "").trim()) {
      throw new Error(`Updater platform target ${target} is missing url`);
    }
    if (!String(platforms[target].signature || "").trim()) {
      throw new Error(`Updater platform target ${target} is missing signature`);
    }
  }

  const assets = Array.isArray(release.assets) ? release.assets : [];
  for (const suffix of requiredAssetSuffixes) {
    const asset = findAssetBySuffix(assets, suffix);
    if (!asset) {
      throw new Error(`Missing release asset matching suffix: ${suffix}`);
    }
    await assertReachable(asset.browser_download_url, fetchImpl);
  }

  return {
    release,
    latest,
  };
}

export async function runCLI(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      "release-url": { type: "string" },
      "latest-url": { type: "string" },
      "expected-version": { type: "string" },
      "required-platforms": {
        type: "string",
        default: "windows-x86_64,darwin-aarch64,darwin-x86_64",
      },
      "required-asset-suffixes": {
        type: "string",
        default: ".msi,.dmg,.app.tar.gz",
      },
    },
    strict: true,
  });

  await verifyReleaseChannel({
    releaseURL: values["release-url"],
    latestURL: values["latest-url"],
    expectedVersion: values["expected-version"],
    requiredPlatformTargets: normalizeCSV(values["required-platforms"]),
    requiredAssetSuffixes: normalizeCSV(values["required-asset-suffixes"]),
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
