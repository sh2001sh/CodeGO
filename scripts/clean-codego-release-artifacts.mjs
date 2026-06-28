import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BUNDLE_DIRS = [
  "src-tauri/target/release/bundle",
  "src-tauri/target/x86_64-pc-windows-msvc/release/bundle",
  "src-tauri/target/aarch64-pc-windows-msvc/release/bundle",
  "src-tauri/target/x86_64-apple-darwin/release/bundle",
  "src-tauri/target/aarch64-apple-darwin/release/bundle",
  "src-tauri/target/universal-apple-darwin/release/bundle",
];

function parseArgs(argv) {
  const options = {
    rootDir: process.cwd(),
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root-dir") {
      const value = argv[++index];
      if (!value) {
        throw new Error("Missing value for --root-dir");
      }
      options.rootDir = resolve(value);
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function removeDirectory(dirPath, dryRun) {
  if (dryRun) {
    return { removed: false, path: dirPath };
  }

  await rm(dirPath, { recursive: true, force: true });
  return { removed: true, path: dirPath };
}

export async function cleanCodeGoReleaseArtifacts(options = {}) {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const bundleDirs = options.bundleDirs ?? DEFAULT_BUNDLE_DIRS;
  const dryRun = options.dryRun ?? false;

  const results = [];
  for (const relativePath of bundleDirs) {
    const dirPath = resolve(rootDir, relativePath);
    results.push(await removeDirectory(dirPath, dryRun));
  }

  return { rootDir, dryRun, results };
}

export async function runCLI(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(
      [
        "Usage: node scripts/clean-codego-release-artifacts.mjs [--root-dir <path>] [--dry-run]",
        "",
        "Removes stale Tauri bundle directories so release builds do not pick up old installers.",
      ].join("\n"),
    );
    return { ok: true };
  }

  const result = await cleanCodeGoReleaseArtifacts(options);
  if (!result.dryRun) {
    for (const item of result.results) {
      process.stdout.write(`removed ${item.path}\n`);
    }
  }

  return result;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
const currentPath = fileURLToPath(import.meta.url);

if (invokedPath === currentPath) {
  runCLI().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
