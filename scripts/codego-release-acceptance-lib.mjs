import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

export const ACCEPTANCE_SCHEMA_VERSION = 1;
export const ACCEPTANCE_STATUSES = new Set([
  "pending",
  "pass",
  "fail",
  "blocked",
  "not-run",
]);

export const ACCEPTANCE_SCENARIOS = [
  {
    id: "fresh-install",
    title: "Fresh install",
    description:
      "Install the release from scratch, launch the app, and confirm login, dashboard, and tool configuration entry points work.",
  },
  {
    id: "upgrade-from-previous",
    title: "Upgrade from previous stable",
    description:
      "Upgrade from the last stable build and confirm login state, cached data, and settings survive the installer or package replacement.",
  },
  {
    id: "rollback-to-previous",
    title: "Rollback to previous stable",
    description:
      "Return the machine to the previous stable build or previous release channel manifest and confirm the app can launch and recover cleanly.",
  },
  {
    id: "updater-check",
    title: "Updater check",
    description:
      "From the previous stable build, confirm the in-app update check finds this release and can fetch the updater artifact without signature errors.",
  },
];

const PLATFORM_DEFINITIONS = [
  {
    id: "windows-x64",
    label: "Windows x64",
    artifactRules: [
      { suffix: "_x64_zh-CN.msi", role: "installer" },
      { suffix: "_x64_portable.zip", role: "portable" },
    ],
    updaterTargets: ["windows-x86_64"],
  },
  {
    id: "linux-x64",
    label: "Linux x64",
    artifactRules: [
      { suffix: "_x64.AppImage", role: "installer" },
      { suffix: "_x64.deb", role: "package" },
      { suffix: "_x64.rpm", role: "package" },
    ],
    updaterTargets: ["linux-x86_64"],
  },
];

export function normalizePath(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`Missing required ${label}.`);
  }
  return normalized;
}

export function normalizeVersion(value, label = "expected version") {
  const normalized = String(value || "")
    .trim()
    .replace(/^[vV]/, "");
  if (!normalized) {
    throw new Error(`Missing required ${label}.`);
  }
  return normalized;
}

export async function ensureFile(filePath, label) {
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile()) {
    throw new Error(`Missing required ${label}: ${filePath}`);
  }
}

export async function readJSON(filePath, label) {
  await ensureFile(filePath, label);
  return JSON.parse(await readFile(filePath, "utf8"));
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

function toArtifactRecord(asset, role) {
  return {
    name: String(asset.name || "").trim(),
    role,
    browser_download_url: String(asset.browser_download_url || "").trim(),
    digest: String(asset.digest || "").trim(),
  };
}

function createScenarioTemplate() {
  return ACCEPTANCE_SCENARIOS.map((scenario) => ({
    id: scenario.id,
    title: scenario.title,
    description: scenario.description,
    required: true,
    status: "pending",
    environment: "",
    executed_at: "",
    notes: "",
    evidence: [],
  }));
}

function sortByName(values, selector) {
  return [...values].sort((left, right) =>
    selector(left).localeCompare(selector(right)),
  );
}

export async function loadReleaseMetadata({
  manifestPath,
  latestPath,
  expectedVersion,
}) {
  const release = await readJSON(manifestPath, "release manifest");
  const latest = await readJSON(latestPath, "updater manifest");
  const version = normalizeVersion(
    expectedVersion || release.version,
    "release version",
  );

  assert.equal(
    String(release.version || "").trim(),
    version,
    "Release manifest version mismatch",
  );
  assert.equal(
    String(latest.version || "").trim(),
    version,
    "Updater manifest version mismatch",
  );
  assert.equal(
    String(release.tag_name || "").trim(),
    `v${version}`,
    "Release manifest tag mismatch",
  );
  assert.deepEqual(
    latest.platforms || {},
    release.platforms || {},
    "Release manifest and updater manifest platforms differ",
  );

  return { release, latest, version };
}

export function deriveAcceptancePlatforms(release) {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const releasePlatforms = release.platforms || {};

  return PLATFORM_DEFINITIONS.map((definition) => {
    const installArtifacts = definition.artifactRules
      .map((rule) => {
        const asset = findAssetBySuffix(assets, rule.suffix);
        return asset ? toArtifactRecord(asset, rule.role) : null;
      })
      .filter(Boolean);

    const updaterTargets = definition.updaterTargets
      .map((target) => {
        const targetRecord = releasePlatforms[target];
        if (!targetRecord) {
          return null;
        }
        return {
          target,
          url: String(targetRecord.url || "").trim(),
          signature: String(targetRecord.signature || "").trim(),
        };
      })
      .filter(Boolean);

    if (!installArtifacts.length && !updaterTargets.length) {
      return null;
    }

    return {
      id: definition.id,
      label: definition.label,
      install_artifacts: installArtifacts,
      updater_targets: sortByName(updaterTargets, (item) => item.target),
      scenarios: createScenarioTemplate(),
    };
  }).filter(Boolean);
}

export function buildAcceptanceTemplate({
  release,
  latest,
  generatedAt = new Date().toISOString(),
  previousStableVersionPlaceholder = "<fill-previous-stable-version>",
}) {
  const version = normalizeVersion(release.version, "release version");
  const platforms = deriveAcceptancePlatforms(release);

  return {
    schema_version: ACCEPTANCE_SCHEMA_VERSION,
    product: "CodeGo",
    generated_at: generatedAt,
    release: {
      version,
      tag_name: String(release.tag_name || "").trim(),
      published_at: String(
        latest.pub_date || release.published_at || "",
      ).trim(),
      release_page_url: String(
        release.html_url || release.release_page_url || "",
      ).trim(),
      previous_stable_version: previousStableVersionPlaceholder,
    },
    summary: {
      operator: "",
      completed_at: "",
      notes: "",
    },
    platforms,
  };
}

function validateArtifactSet(actualArtifacts, expectedArtifacts) {
  assert.equal(
    actualArtifacts.length,
    expectedArtifacts.length,
    "Acceptance record artifact count mismatch",
  );

  const actualByName = new Map(
    actualArtifacts.map((artifact) => [
      String(artifact?.name || "").trim(),
      artifact,
    ]),
  );

  for (const expected of expectedArtifacts) {
    const actual = actualByName.get(expected.name);
    if (!actual) {
      throw new Error(`Acceptance record is missing artifact ${expected.name}`);
    }
    assert.equal(
      String(actual.role || "").trim(),
      expected.role,
      `Artifact role mismatch for ${expected.name}`,
    );
    assert.equal(
      String(actual.browser_download_url || "").trim(),
      expected.browser_download_url,
      `Artifact URL mismatch for ${expected.name}`,
    );
    assert.equal(
      String(actual.digest || "").trim(),
      expected.digest,
      `Artifact digest mismatch for ${expected.name}`,
    );
  }
}

function validateUpdaterTargetSet(actualTargets, expectedTargets) {
  assert.equal(
    actualTargets.length,
    expectedTargets.length,
    "Acceptance record updater target count mismatch",
  );

  const actualByTarget = new Map(
    actualTargets.map((target) => [
      String(target?.target || "").trim(),
      target,
    ]),
  );

  for (const expected of expectedTargets) {
    const actual = actualByTarget.get(expected.target);
    if (!actual) {
      throw new Error(
        `Acceptance record is missing updater target ${expected.target}`,
      );
    }
    assert.equal(
      String(actual.url || "").trim(),
      expected.url,
      `Updater target URL mismatch for ${expected.target}`,
    );
    assert.equal(
      String(actual.signature || "").trim(),
      expected.signature,
      `Updater target signature mismatch for ${expected.target}`,
    );
  }
}

function validateScenarioSet(actualScenarios, options) {
  const actualById = new Map(
    actualScenarios.map((scenario) => [
      String(scenario?.id || "").trim(),
      scenario,
    ]),
  );

  for (const expected of ACCEPTANCE_SCENARIOS) {
    const actual = actualById.get(expected.id);
    if (!actual) {
      throw new Error(`Acceptance record is missing scenario ${expected.id}`);
    }
    const status = String(actual.status || "").trim();
    if (!ACCEPTANCE_STATUSES.has(status)) {
      throw new Error(
        `Scenario ${expected.id} has unsupported status "${status || "<empty>"}"`,
      );
    }

    if (
      options.requireExecuted &&
      (status === "pending" || status === "not-run")
    ) {
      throw new Error(
        `Scenario ${expected.id} must be executed before closeout validation`,
      );
    }
    if (options.requirePassed && status !== "pass") {
      throw new Error(
        `Scenario ${expected.id} must pass before closeout validation`,
      );
    }

    if (status !== "pending" && status !== "not-run") {
      if (!String(actual.environment || "").trim()) {
        throw new Error(`Scenario ${expected.id} is missing environment`);
      }
      if (!String(actual.executed_at || "").trim()) {
        throw new Error(`Scenario ${expected.id} is missing executed_at`);
      }
      if (!String(actual.notes || "").trim()) {
        throw new Error(`Scenario ${expected.id} is missing notes`);
      }
      if (!Array.isArray(actual.evidence)) {
        throw new Error(`Scenario ${expected.id} evidence must be an array`);
      }
    }
  }
}

export function validateAcceptanceRecord({
  record,
  release,
  latest,
  requireExecuted = false,
  requirePassed = false,
}) {
  assert.equal(
    Number(record?.schema_version || 0),
    ACCEPTANCE_SCHEMA_VERSION,
    "Acceptance record schema version mismatch",
  );
  assert.equal(
    String(record?.product || "").trim(),
    "CodeGo",
    "Acceptance record product mismatch",
  );

  const expectedTemplate = buildAcceptanceTemplate({ release, latest });
  assert.equal(
    String(record?.release?.version || "").trim(),
    expectedTemplate.release.version,
    "Acceptance record version mismatch",
  );
  assert.equal(
    String(record?.release?.tag_name || "").trim(),
    expectedTemplate.release.tag_name,
    "Acceptance record tag mismatch",
  );

  const actualPlatforms = Array.isArray(record?.platforms)
    ? record.platforms
    : [];
  assert.equal(
    actualPlatforms.length,
    expectedTemplate.platforms.length,
    "Acceptance record platform count mismatch",
  );

  const actualById = new Map(
    actualPlatforms.map((platform) => [
      String(platform?.id || "").trim(),
      platform,
    ]),
  );

  for (const expectedPlatform of expectedTemplate.platforms) {
    const actualPlatform = actualById.get(expectedPlatform.id);
    if (!actualPlatform) {
      throw new Error(
        `Acceptance record is missing platform ${expectedPlatform.id}`,
      );
    }

    assert.equal(
      String(actualPlatform.label || "").trim(),
      expectedPlatform.label,
      `Acceptance platform label mismatch for ${expectedPlatform.id}`,
    );

    validateArtifactSet(
      Array.isArray(actualPlatform.install_artifacts)
        ? actualPlatform.install_artifacts
        : [],
      expectedPlatform.install_artifacts,
    );
    validateUpdaterTargetSet(
      Array.isArray(actualPlatform.updater_targets)
        ? actualPlatform.updater_targets
        : [],
      expectedPlatform.updater_targets,
    );
    validateScenarioSet(
      Array.isArray(actualPlatform.scenarios) ? actualPlatform.scenarios : [],
      { requireExecuted, requirePassed },
    );
  }

  return {
    platformCount: expectedTemplate.platforms.length,
    scenarioCount:
      expectedTemplate.platforms.length * ACCEPTANCE_SCENARIOS.length,
  };
}

export function renderAcceptanceChecklist(
  record,
  recordPath = "<record.json>",
) {
  const lines = [
    `# CodeGo Release Acceptance Checklist`,
    ``,
    `Release: ${record.release.tag_name} (${record.release.version})`,
    `Published at: ${record.release.published_at || "<fill-after-publish>"}`,
    `Previous stable baseline: ${record.release.previous_stable_version}`,
    ``,
    `Use this checklist together with the JSON record at \`${recordPath}\`.`,
    `Before declaring the release accepted, validate the filled record with:`,
    ``,
    `\`\`\`bash`,
    `node scripts/verify-codego-release-acceptance-record.mjs \\`,
    `  --manifest "release-assets/codego-desktop-release-manifest.json" \\`,
    `  --latest "release-assets/latest.json" \\`,
    `  --record "${recordPath}" \\`,
    `  --require-executed \\`,
    `  --require-passed`,
    `\`\`\``,
    ``,
    `Allowed statuses: \`pending\`, \`pass\`, \`fail\`, \`blocked\`, \`not-run\`.`,
    ``,
  ];

  for (const platform of record.platforms) {
    lines.push(`## ${platform.label}`);
    lines.push(``);
    lines.push(`Artifacts:`);
    for (const artifact of platform.install_artifacts) {
      lines.push(
        `- ${artifact.role}: \`${artifact.name}\` (${artifact.digest || "no digest"})`,
      );
    }
    if (platform.updater_targets.length) {
      lines.push(
        `- updater targets: ${platform.updater_targets.map((item) => item.target).join(", ")}`,
      );
    }
    lines.push(``);
    for (const scenario of platform.scenarios) {
      lines.push(`- [ ] ${scenario.title}: ${scenario.description}`);
    }
    lines.push(``);
  }

  return `${lines.join("\n")}\n`;
}
