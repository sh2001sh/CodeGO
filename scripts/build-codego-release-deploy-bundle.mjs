import { copyFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

function normalizeRelativePath(value, fallback) {
  const normalized = String(value || fallback || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  if (!normalized) {
    throw new Error("A non-empty relative path is required.");
  }
  if (normalized.split("/").some((segment) => segment === "..")) {
    throw new Error(`Relative path must not contain "..": ${normalized}`);
  }
  return normalized;
}

async function ensureFile(filePath, label) {
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) {
    throw new Error(`Missing required ${label} file: ${filePath}`);
  }
}

async function copyTreeFiles(sourceDir, targetDir, predicate) {
  const entries = await readdir(sourceDir, { withFileTypes: true });
  await mkdir(targetDir, { recursive: true });

  for (const entry of entries) {
    if (!entry.isFile() || !predicate(entry.name)) {
      continue;
    }
    await copyFile(
      path.join(sourceDir, entry.name),
      path.join(targetDir, entry.name),
    );
  }
}

export async function buildDeployBundle({
  assetsDir,
  manifestPath,
  latestPath,
  bundleOutDir,
  staticRelativeDir = "downloads/codego",
  metadataRelativeDir = "release-metadata/codego",
  runtimeManifestName = "codego-desktop-release-manifest.json",
}) {
  const normalizedStaticRelativeDir = normalizeRelativePath(
    staticRelativeDir,
    "downloads/codego",
  );
  const normalizedMetadataRelativeDir = normalizeRelativePath(
    metadataRelativeDir,
    "release-metadata/codego",
  );
  const normalizedRuntimeManifestName = normalizeRelativePath(
    runtimeManifestName,
    "codego-desktop-release-manifest.json",
  );

  await ensureFile(manifestPath, "manifest");
  await ensureFile(latestPath, "latest manifest");

  await rm(bundleOutDir, { recursive: true, force: true });

  const staticDir = path.join(
    bundleOutDir,
    "static",
    normalizedStaticRelativeDir,
  );
  const metadataDir = path.join(
    bundleOutDir,
    "metadata",
    normalizedMetadataRelativeDir,
  );
  const runtimeManifestPath = path.join(
    bundleOutDir,
    "runtime",
    normalizedRuntimeManifestName,
  );

  await copyTreeFiles(assetsDir, staticDir, (name) => !name.endsWith(".json"));
  await mkdir(metadataDir, { recursive: true });
  await mkdir(path.dirname(runtimeManifestPath), { recursive: true });

  await copyFile(
    manifestPath,
    path.join(metadataDir, path.basename(manifestPath)),
  );
  await copyFile(latestPath, path.join(metadataDir, path.basename(latestPath)));
  await copyFile(manifestPath, runtimeManifestPath);

  return {
    bundleOutDir,
    staticDir,
    metadataDir,
    runtimeManifestPath,
  };
}

export async function runCLI(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      "assets-dir": { type: "string" },
      manifest: { type: "string" },
      latest: { type: "string" },
      "bundle-out": {
        type: "string",
        default: "release-assets/deploy-bundle",
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

  if (!values["assets-dir"]) {
    throw new Error("Missing required --assets-dir argument.");
  }
  if (!values.manifest) {
    throw new Error("Missing required --manifest argument.");
  }
  if (!values.latest) {
    throw new Error("Missing required --latest argument.");
  }

  await buildDeployBundle({
    assetsDir: values["assets-dir"],
    manifestPath: values.manifest,
    latestPath: values.latest,
    bundleOutDir: values["bundle-out"],
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
