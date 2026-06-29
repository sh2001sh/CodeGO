import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { verifyReleaseChannel } from "./verify-codego-release-channel.mjs";

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

function normalizePositiveInteger(value, label, fallback) {
  const normalized = String(value ?? fallback ?? "").trim();
  if (!normalized) {
    throw new Error(`Missing required ${label}.`);
  }
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForReleaseVersion(
  {
    releaseURL,
    latestURL,
    expectedVersion,
    requiredPlatformTargets = [],
    requiredAssetSuffixes = [],
    timeoutMs = 120000,
    intervalMs = 5000,
  },
  fetchImpl = fetch,
) {
  const normalizedReleaseURL = normalizeURL(releaseURL, "release URL");
  const normalizedLatestURL = normalizeURL(latestURL, "latest URL");
  const normalizedVersion = normalizeVersion(expectedVersion);
  const normalizedTimeoutMs = normalizePositiveInteger(
    timeoutMs,
    "timeoutMs",
    120000,
  );
  const normalizedIntervalMs = normalizePositiveInteger(
    intervalMs,
    "intervalMs",
    5000,
  );

  const startedAt = Date.now();
  let attempts = 0;
  let lastError = null;

  while (Date.now() - startedAt < normalizedTimeoutMs) {
    attempts += 1;
    try {
      const result = await verifyReleaseChannel(
        {
          releaseURL: normalizedReleaseURL,
          latestURL: normalizedLatestURL,
          expectedVersion: normalizedVersion,
          requiredPlatformTargets,
          requiredAssetSuffixes,
        },
        fetchImpl,
      );

      return {
        ...result,
        attempts,
        elapsedMs: Date.now() - startedAt,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await sleep(normalizedIntervalMs);
    }
  }

  throw new Error(
    `Release channel did not converge to ${normalizedVersion} within ${normalizedTimeoutMs}ms after ${attempts} attempts. Last error: ${lastError?.message || "unknown error"}`,
  );
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
        default: "windows-x86_64,linux-x86_64",
      },
      "required-asset-suffixes": {
        type: "string",
        default: ".msi,.AppImage",
      },
      "timeout-ms": {
        type: "string",
        default: "120000",
      },
      "interval-ms": {
        type: "string",
        default: "5000",
      },
    },
    strict: true,
  });

  await waitForReleaseVersion({
    releaseURL: values["release-url"],
    latestURL: values["latest-url"],
    expectedVersion: values["expected-version"],
    requiredPlatformTargets: normalizeCSV(values["required-platforms"]),
    requiredAssetSuffixes: normalizeCSV(values["required-asset-suffixes"]),
    timeoutMs: values["timeout-ms"],
    intervalMs: values["interval-ms"],
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
