import assert from "node:assert/strict";
import http from "node:http";
import { after, describe, test } from "node:test";

import { verifyReleaseChannel } from "./verify-codego-release-channel.mjs";

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

async function createFixtureServer() {
  const releaseBody = {
    tag_name: "v3.16.4",
    version: "3.16.4",
    html_url: "/download?version=v3.16.4",
    assets: [],
    platforms: {},
  };
  const latestBody = {
    version: "3.16.4",
    platforms: {},
  };

  const server = http.createServer((request, response) => {
    const url = request.url || "/";
    if (url === "/api/desktop/release/latest") {
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
      url === "/downloads/codego/CodeGo_3.16.4_x64_zh-CN.msi" ||
      url === "/downloads/codego/CodeGo_3.16.4_universal.dmg" ||
      url === "/downloads/codego/CodeGo_3.16.4_universal.app.tar.gz"
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
  const baseURL = `http://127.0.0.1:${address.port}`;

  releaseBody.assets = [
    {
      name: "CodeGo_3.16.4_x64_zh-CN.msi",
      browser_download_url: `${baseURL}/downloads/codego/CodeGo_3.16.4_x64_zh-CN.msi`,
    },
    {
      name: "CodeGo_3.16.4_universal.dmg",
      browser_download_url: `${baseURL}/downloads/codego/CodeGo_3.16.4_universal.dmg`,
    },
    {
      name: "CodeGo_3.16.4_universal.app.tar.gz",
      browser_download_url: `${baseURL}/downloads/codego/CodeGo_3.16.4_universal.app.tar.gz`,
    },
  ];
  releaseBody.platforms = {
    "windows-x86_64": {
      signature: "sig-win",
      url: `${baseURL}/downloads/codego/CodeGo_3.16.4_x64_zh-CN.msi`,
    },
    "darwin-aarch64": {
      signature: "sig-mac",
      url: `${baseURL}/downloads/codego/CodeGo_3.16.4_universal.app.tar.gz`,
    },
    "darwin-x86_64": {
      signature: "sig-mac",
      url: `${baseURL}/downloads/codego/CodeGo_3.16.4_universal.app.tar.gz`,
    },
  };
  latestBody.platforms = releaseBody.platforms;

  return baseURL;
}

describe("verify-codego-release-channel", () => {
  test("validates release and updater endpoints plus required assets", async () => {
    const baseURL = await createFixtureServer();

    const result = await verifyReleaseChannel({
      releaseURL: `${baseURL}/api/desktop/release/latest`,
      latestURL: `${baseURL}/api/desktop/release/latest.json`,
      expectedVersion: "3.16.4",
      requiredPlatformTargets: [
        "windows-x86_64",
        "darwin-aarch64",
        "darwin-x86_64",
      ],
      requiredAssetSuffixes: [".msi", ".dmg", ".app.tar.gz"],
    });

    assert.equal(result.release.version, "3.16.4");
    assert.equal(result.latest.version, "3.16.4");
  });
});
