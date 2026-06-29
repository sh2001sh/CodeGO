import assert from "node:assert/strict";
import http from "node:http";
import { after, describe, test } from "node:test";

import { waitForReleaseVersion } from "./wait-for-codego-release-version.mjs";

const servers = [];

after(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise((resolve, reject) => {
          server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        }),
    ),
  );
});

async function createMutableFixtureServer({
  initialVersion = "3.16.3",
  switchToVersion = "3.16.4",
  switchAfterRequests = 3,
}) {
  let manifestRequests = 0;
  let baseURL = "";

  const server = http.createServer((request, response) => {
    const url = request.url || "/";
    const activeVersion =
      manifestRequests >= switchAfterRequests
        ? switchToVersion
        : initialVersion;
    const releaseBody = buildReleaseBody(baseURL, activeVersion);
    const latestBody = {
      version: activeVersion,
      notes: `CodeGo v${activeVersion}`,
      pub_date: "2026-06-28T12:00:00Z",
      platforms: releaseBody.platforms,
    };

    if (url === "/api/desktop/release/latest") {
      manifestRequests += 1;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(releaseBody));
      return;
    }
    if (url === "/api/desktop/release/latest.json") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(latestBody));
      return;
    }
    if (
      url.startsWith(`/downloads/codego/CodeGo_${activeVersion}_`) ||
      url.startsWith(`/downloads/codego/CodeGo_${switchToVersion}_`) ||
      url.startsWith(`/downloads/codego/CodeGo_${initialVersion}_`)
    ) {
      response.writeHead(200, { "Content-Type": "application/octet-stream" });
      if (request.method !== "HEAD") {
        response.end("ok");
      } else {
        response.end();
      }
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("not found");
  });
  servers.push(server);

  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");
  baseURL = `http://127.0.0.1:${address.port}`;
  return baseURL;
}

function buildReleaseBody(baseURL, version) {
  return {
    tag_name: `v${version}`,
    version,
    html_url: `/download?version=v${version}`,
    notes: `CodeGo v${version}`,
    published_at: "2026-06-28T12:00:00Z",
    assets: [
      {
        name: `CodeGo_${version}_x64_zh-CN.msi`,
        browser_download_url: `${baseURL}/downloads/codego/CodeGo_${version}_x64_zh-CN.msi`,
      },
      {
        name: `CodeGo_${version}_arm64_zh-CN.msi`,
        browser_download_url: `${baseURL}/downloads/codego/CodeGo_${version}_arm64_zh-CN.msi`,
      },
      {
        name: `CodeGo_${version}_universal.dmg`,
        browser_download_url: `${baseURL}/downloads/codego/CodeGo_${version}_universal.dmg`,
      },
      {
        name: `CodeGo_${version}_universal.app.tar.gz`,
        browser_download_url: `${baseURL}/downloads/codego/CodeGo_${version}_universal.app.tar.gz`,
      },
      {
        name: `CodeGo_${version}_x64.AppImage`,
        browser_download_url: `${baseURL}/downloads/codego/CodeGo_${version}_x64.AppImage`,
      },
      {
        name: `CodeGo_${version}_arm64.AppImage`,
        browser_download_url: `${baseURL}/downloads/codego/CodeGo_${version}_arm64.AppImage`,
      },
    ],
    platforms: {
      "windows-x86_64": {
        signature: `sig-win-x64-${version}`,
        url: `${baseURL}/downloads/codego/CodeGo_${version}_x64_zh-CN.msi`,
      },
      "windows-aarch64": {
        signature: `sig-win-arm64-${version}`,
        url: `${baseURL}/downloads/codego/CodeGo_${version}_arm64_zh-CN.msi`,
      },
      "darwin-aarch64": {
        signature: `sig-mac-${version}`,
        url: `${baseURL}/downloads/codego/CodeGo_${version}_universal.app.tar.gz`,
      },
      "darwin-x86_64": {
        signature: `sig-mac-${version}`,
        url: `${baseURL}/downloads/codego/CodeGo_${version}_universal.app.tar.gz`,
      },
      "linux-x86_64": {
        signature: `sig-linux-x64-${version}`,
        url: `${baseURL}/downloads/codego/CodeGo_${version}_x64.AppImage`,
      },
      "linux-aarch64": {
        signature: `sig-linux-arm64-${version}`,
        url: `${baseURL}/downloads/codego/CodeGo_${version}_arm64.AppImage`,
      },
    },
  };
}

describe("wait-for-codego-release-version", () => {
  test("polls until the release channel converges to the expected version", async () => {
    const baseURL = await createMutableFixtureServer({
      initialVersion: "3.16.3",
      switchToVersion: "3.16.4",
      switchAfterRequests: 2,
    });

    const result = await waitForReleaseVersion({
      releaseURL: `${baseURL}/api/desktop/release/latest`,
      latestURL: `${baseURL}/api/desktop/release/latest.json`,
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
        ".msi",
        "_arm64_zh-CN.msi",
        ".dmg",
        ".app.tar.gz",
        "_x64.AppImage",
        "_arm64.AppImage",
      ],
      timeoutMs: 2000,
      intervalMs: 20,
    });

    assert.equal(result.release.version, "3.16.4");
    assert.equal(result.latest.version, "3.16.4");
    assert.ok(result.attempts >= 2);
  });

  test("fails when the release channel never converges to the expected version", async () => {
    const baseURL = await createMutableFixtureServer({
      initialVersion: "3.16.3",
      switchToVersion: "3.16.3",
      switchAfterRequests: 99,
    });

    await assert.rejects(
      () =>
        waitForReleaseVersion({
          releaseURL: `${baseURL}/api/desktop/release/latest`,
          latestURL: `${baseURL}/api/desktop/release/latest.json`,
          expectedVersion: "3.16.4",
          requiredPlatformTargets: ["windows-x86_64"],
          requiredAssetSuffixes: [".msi"],
          timeoutMs: 120,
          intervalMs: 20,
        }),
      /did not converge to 3\.16\.4/i,
    );
  });
});
