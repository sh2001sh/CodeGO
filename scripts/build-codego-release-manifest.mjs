import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const PRODUCT_NAME = "CodeGo";

function normalizeVersion(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/^[vV]/, "");
  if (!normalized) {
    throw new Error("A release version is required.");
  }
  return normalized;
}

function normalizeTag(value, version) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return `v${version}`;
  }
  return normalized.startsWith("v") || normalized.startsWith("V")
    ? `v${normalized.slice(1)}`
    : `v${normalized}`;
}

function joinURL(baseURL, fileName) {
  const base = String(baseURL || "").trim();
  if (!base) {
    throw new Error("A download base URL is required.");
  }
  return `${base.replace(/\/+$/, "")}/${fileName}`;
}

function detectArch(fileName) {
  const normalized = fileName.toLowerCase();
  if (normalized.includes("arm64") || normalized.includes("aarch64")) {
    return "arm64";
  }
  if (normalized.includes("x64") || normalized.includes("x86_64")) {
    return "x64";
  }
  return undefined;
}

function resolveMacTarget(arch) {
  if (arch === "arm64") {
    return "darwin-aarch64";
  }
  if (arch === "x64") {
    return "darwin-x86_64";
  }
  return "darwin-universal";
}

function resolveMacUpdaterTargets(arch) {
  if (arch === "arm64") {
    return ["darwin-aarch64"];
  }
  if (arch === "x64") {
    return ["darwin-x86_64"];
  }
  return ["darwin-aarch64", "darwin-x86_64"];
}

function classifyAsset(fileName) {
  const normalized = fileName.toLowerCase();
  const arch = detectArch(fileName);

  if (normalized.endsWith(".msi")) {
    const target = arch === "arm64" ? "windows-aarch64" : "windows-x86_64";
    return {
      platform: "windows",
      arch: arch || "x64",
      kind: "installer",
      tauriTarget: target,
      updaterTargets: [target],
    };
  }

  if (normalized.endsWith(".zip") && normalized.includes("portable")) {
    return {
      platform: "windows",
      arch: arch || "x64",
      kind: "portable",
      tauriTarget: arch === "arm64" ? "windows-aarch64" : "windows-x86_64",
      updaterTargets: [],
    };
  }

  if (normalized.endsWith(".dmg")) {
    return {
      platform: "macos",
      arch: arch || "universal",
      kind: "installer",
      tauriTarget: resolveMacTarget(arch),
      updaterTargets: [],
    };
  }

  if (normalized.endsWith(".app.tar.gz") || normalized.endsWith(".tar.gz")) {
    return {
      platform: "macos",
      arch: arch || "universal",
      kind: "updater",
      tauriTarget: resolveMacTarget(arch),
      updaterTargets: resolveMacUpdaterTargets(arch),
    };
  }

  if (normalized.endsWith(".zip")) {
    return {
      platform: "macos",
      arch: arch || "universal",
      kind: "archive",
      tauriTarget: resolveMacTarget(arch),
      updaterTargets: [],
    };
  }

  if (normalized.endsWith(".appimage")) {
    const target = arch === "arm64" ? "linux-aarch64" : "linux-x86_64";
    return {
      platform: "linux",
      arch: arch || "x64",
      kind: "appimage",
      tauriTarget: target,
      updaterTargets: [target],
    };
  }

  if (normalized.endsWith(".deb")) {
    return {
      platform: "linux",
      arch: arch || "x64",
      kind: "deb",
      tauriTarget: arch === "arm64" ? "linux-aarch64" : "linux-x86_64",
      updaterTargets: [],
    };
  }

  if (normalized.endsWith(".rpm")) {
    return {
      platform: "linux",
      arch: arch || "x64",
      kind: "rpm",
      tauriTarget: arch === "arm64" ? "linux-aarch64" : "linux-x86_64",
      updaterTargets: [],
    };
  }

  return {
    platform: undefined,
    arch,
    kind: "other",
    tauriTarget: undefined,
    updaterTargets: [],
  };
}

function assetSortScore(asset) {
  const platformRank =
    {
      windows: 0,
      macos: 1,
      linux: 2,
    }[asset.platform] ?? 99;

  const archRank =
    {
      x64: 0,
      universal: 0,
      arm64: 1,
    }[asset.arch] ?? 9;

  const kindRank =
    {
      installer: 0,
      appimage: 0,
      portable: 1,
      archive: 1,
      deb: 1,
      rpm: 2,
      updater: 3,
      other: 9,
    }[asset.kind] ?? 9;

  return `${platformRank}:${archRank}:${kindRank}:${asset.name.toLowerCase()}`;
}

async function buildAssetRecord(assetsDir, dirent, downloadBaseURL) {
  const filePath = path.join(assetsDir, dirent.name);
  const signaturePath = `${filePath}.sig`;
  const fileBuffer = await readFile(filePath);
  const fileStat = await stat(filePath);
  const digest = createHash("sha256").update(fileBuffer).digest("hex");
  const metadata = classifyAsset(dirent.name);

  let signature = "";
  try {
    signature = (await readFile(signaturePath, "utf8")).trim();
  } catch {
    signature = "";
  }

  return {
    name: dirent.name,
    size: fileStat.size,
    digest: `sha256:${digest}`,
    browser_download_url: joinURL(downloadBaseURL, dirent.name),
    platform: metadata.platform,
    arch: metadata.arch,
    kind: metadata.kind,
    tauri_target: metadata.tauriTarget,
    updaterTargets: metadata.updaterTargets,
    signature,
  };
}

export async function buildReleaseManifest({
  assetsDir,
  downloadBaseURL,
  version,
  tag,
  publishedAt,
  notes,
  releasePageURL,
  homebrewURL,
}) {
  const normalizedVersion = normalizeVersion(version);
  const normalizedTag = normalizeTag(tag, normalizedVersion);
  const entries = await readdir(assetsDir, { withFileTypes: true });
  const fileEntries = entries.filter(
    (entry) =>
      entry.isFile() &&
      !entry.name.endsWith(".sig") &&
      !entry.name.endsWith(".json"),
  );

  const assets = await Promise.all(
    fileEntries.map((entry) =>
      buildAssetRecord(assetsDir, entry, downloadBaseURL),
    ),
  );
  assets.sort((left, right) =>
    assetSortScore(left).localeCompare(assetSortScore(right)),
  );

  const platforms = {};
  for (const asset of assets) {
    if (!asset.signature || asset.updaterTargets.length === 0) {
      continue;
    }
    for (const target of asset.updaterTargets) {
      platforms[target] = {
        signature: asset.signature,
        url: asset.browser_download_url,
      };
    }
  }

  const manifestAssets = assets.map((asset) => ({
    name: asset.name,
    size: asset.size,
    digest: asset.digest,
    browser_download_url: asset.browser_download_url,
    ...(asset.platform ? { platform: asset.platform } : {}),
    ...(asset.arch ? { arch: asset.arch } : {}),
    ...(asset.tauri_target ? { tauri_target: asset.tauri_target } : {}),
  }));

  const resolvedPublishedAt =
    String(publishedAt || "").trim() || new Date().toISOString();
  const resolvedNotes =
    String(notes || "").trim() || `${PRODUCT_NAME} ${normalizedTag}`;
  const manifest = {
    tag_name: normalizedTag,
    version: normalizedVersion,
    html_url:
      String(releasePageURL || "").trim() ||
      `/download?version=${normalizedTag}`,
    published_at: resolvedPublishedAt,
    notes: resolvedNotes,
    ...(String(homebrewURL || "").trim()
      ? { homebrew_url: String(homebrewURL).trim() }
      : {}),
    assets: manifestAssets,
    platforms,
  };

  const latest = {
    version: normalizedVersion,
    notes: resolvedNotes,
    pub_date: resolvedPublishedAt,
    platforms,
  };

  return { manifest, latest };
}

async function writeJSON(targetPath, payload) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function runCLI(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      "assets-dir": { type: "string" },
      "download-base-url": { type: "string" },
      version: { type: "string" },
      tag: { type: "string" },
      "published-at": { type: "string" },
      notes: { type: "string" },
      "release-page-url": { type: "string" },
      "homebrew-url": { type: "string" },
      "manifest-out": {
        type: "string",
        default: "release-assets/codego-desktop-release-manifest.json",
      },
      "latest-out": { type: "string", default: "release-assets/latest.json" },
    },
    strict: true,
  });

  if (!values["assets-dir"]) {
    throw new Error("Missing required --assets-dir argument.");
  }
  if (!values["download-base-url"]) {
    throw new Error("Missing required --download-base-url argument.");
  }
  if (!values.version) {
    throw new Error("Missing required --version argument.");
  }

  const { manifest, latest } = await buildReleaseManifest({
    assetsDir: values["assets-dir"],
    downloadBaseURL: values["download-base-url"],
    version: values.version,
    tag: values.tag,
    publishedAt: values["published-at"],
    notes: values.notes,
    releasePageURL: values["release-page-url"],
    homebrewURL: values["homebrew-url"],
  });

  await writeJSON(values["manifest-out"], manifest);
  await writeJSON(values["latest-out"], latest);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const currentPath = fileURLToPath(import.meta.url);

if (invokedPath === currentPath) {
  runCLI().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
