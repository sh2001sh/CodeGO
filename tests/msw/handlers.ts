import { http, HttpResponse } from "msw";
import type { AppId } from "@/lib/api/types";
import type { McpServer, Provider, Settings } from "@/types";
import {
  addProvider,
  deleteProvider,
  deleteSession,
  getCurrentProviderId,
  getCodeGoAuthState,
  getCodeGoAuthSession,
  getCodeGoSummary,
  getCodeGoAuthorizedDevices,
  getCodeGoToolConfig,
  getCodeGoTemplate,
  getCodeGoTokens,
  getCodeGoUsageTrends,
  getCodeGoUsageLogs,
  getLiveProviderIds,
  getSessionMessages,
  getProviders,
  listProviders,
  listSessions,
  resetProviderState,
  revokeCodeGoAuthorizedDevice,
  restoreCodeGoToolConfig,
  setCodeGoAuthState,
  setCodeGoAuthSession,
  setCodeGoSummary,
  setCodeGoTokens,
  setCurrentProviderId,
  applyCodeGoToolConfig,
  applyCodeGoToolConfigFromToken,
  updateProvider,
  updateSortOrder,
  getSettings,
  setSettings,
  getAppConfigDirOverride,
  setAppConfigDirOverrideState,
  getMcpConfig,
  setMcpServerEnabled,
  upsertMcpServer,
  deleteMcpServer,
  listCodeGoToolConfigs,
} from "./state";

const TAURI_ENDPOINT = "http://tauri.local";

const withJson = async <T>(request: Request): Promise<T> => {
  try {
    const body = await request.text();
    if (!body) return {} as T;
    return JSON.parse(body) as T;
  } catch {
    return {} as T;
  }
};

const success = <T>(payload: T) => HttpResponse.json(payload as any);

export const handlers = [
  http.post(`${TAURI_ENDPOINT}/get_migration_result`, () => success(false)),
  http.post(`${TAURI_ENDPOINT}/get_skills_migration_result`, () =>
    success(null),
  ),
  http.post(`${TAURI_ENDPOINT}/get_installed_skills`, () => success([])),
  http.post(`${TAURI_ENDPOINT}/codego_get_auth_state`, () =>
    success(getCodeGoAuthState()),
  ),
  http.post(
    `${TAURI_ENDPOINT}/codego_start_auth_session`,
    async ({ request }) => {
      await withJson<{
        request?: {
          serverAddress?: string;
          deviceName?: string;
        };
      }>(request);
      const session = {
        sessionId: "desktop-session-1",
        userCode: "ABCD1234",
        verificationUri:
          "https://shu26.cfd/desktop/authorize?session_id=desktop-session-1&code=ABCD1234",
        expiresIn: 600,
        interval: 5,
        status: "pending" as const,
      };
      setCodeGoAuthSession(session);
      return success(session);
    },
  ),
  http.post(
    `${TAURI_ENDPOINT}/codego_poll_auth_session`,
    async ({ request }) => {
      const { request: payload = {} } = await withJson<{
        request?: {
          serverAddress?: string;
          sessionId?: string;
        };
      }>(request);
      const session = getCodeGoAuthSession();
      if (!session || session.sessionId !== payload.sessionId) {
        return HttpResponse.json("Desktop auth session not found", {
          status: 404,
        });
      }

      if (session.status === "rejected" || session.status === "expired") {
        return success({
          status: session.status,
          authenticated: false,
        });
      }

      const nextAuthState = {
        authenticated: true,
        serverAddress: payload.serverAddress || "https://shu26.cfd",
        accessToken: "codego-access-token",
        userId: 7,
        deviceId: 11,
        lastUsername: "demo-user",
      };
      setCodeGoAuthState(nextAuthState);
      setCodeGoSummary({
        account: {
          username: "demo-user",
          display_name: "demo-user",
          id: 7,
          group: "default",
          quota: 100,
          claude_quota: 50,
          used_quota: 12.5,
          request_count: 42,
          quota_usd: 100,
          claude_quota_usd: 50,
          used_quota_usd: 12.5,
          billing_preference: "wallet",
          funding_source_order: ["wallet"],
        },
        actions: {
          server_address: payload.serverAddress || "https://shu26.cfd",
          topup_link: "https://shu26.cfd/topup",
          tokens_path: "/tokens",
          logs_path: "/logs",
        },
      });
      setCodeGoAuthSession({ ...session, status: "approved" });
      return success({
        status: "approved",
        authenticated: true,
        userId: 7,
        deviceId: 11,
        serverAddress: payload.serverAddress || "https://shu26.cfd",
        lastUsername: "demo-user",
      });
    },
  ),
  http.post(`${TAURI_ENDPOINT}/codego_logout`, () => {
    setCodeGoAuthState({
      authenticated: false,
      accessToken: undefined,
      userId: undefined,
      deviceId: undefined,
    });
    setCodeGoAuthSession(null);
    return success(true);
  }),
  http.post(`${TAURI_ENDPOINT}/codego_get_account_summary`, () =>
    success(getCodeGoSummary()),
  ),
  http.post(`${TAURI_ENDPOINT}/codego_list_authorized_devices`, () =>
    success(getCodeGoAuthorizedDevices()),
  ),
  http.post(
    `${TAURI_ENDPOINT}/codego_revoke_authorized_device`,
    async ({ request }) => {
      const { id } = await withJson<{ id: number }>(request);
      const revoked = revokeCodeGoAuthorizedDevice(id);
      if (!revoked) {
        return HttpResponse.json("Desktop device not found", { status: 404 });
      }
      return success(true);
    },
  ),
  http.post(
    `${TAURI_ENDPOINT}/codego_get_usage_trends`,
    async ({ request }) => {
      const { days = 7 } = await withJson<{ days?: number }>(request);
      return success({
        days,
        trend: getCodeGoUsageTrends(days),
      });
    },
  ),
  http.post(`${TAURI_ENDPOINT}/codego_get_diagnostic_preview`, () =>
    success({
      hasReport: false,
      reportType: "none",
      source: "local",
      summary: "",
      preview: "",
      generatedAt: null,
      redactionsApplied: [],
    }),
  ),
  http.post(`${TAURI_ENDPOINT}/codego_submit_diagnostic_report`, () =>
    success({
      id: 1,
      status: "submitted",
    }),
  ),
  http.post(`${TAURI_ENDPOINT}/codego_get_tokens`, async ({ request }) => {
    const { query = {} } = await withJson<{
      query?: { p?: number; size?: number };
    }>(request);
    const items = getCodeGoTokens();
    const page = query.p && query.p > 0 ? query.p : 1;
    const size = query.size ?? 20;
    const start = (page - 1) * size;
    return success({
      p: page,
      size,
      total: items.length,
      items: items.slice(start, start + size),
    });
  }),
  http.post(`${TAURI_ENDPOINT}/codego_get_token_key`, async ({ request }) => {
    const { id } = await withJson<{ id: number }>(request);
    const token = getCodeGoTokens().find((item) => item.id === id);
    if (!token) {
      return HttpResponse.json("Token not found", { status: 404 });
    }
    return success({ key: `${token.key}_full` });
  }),
  http.post(`${TAURI_ENDPOINT}/codego_create_token`, async ({ request }) => {
    const { request: payload } = await withJson<{
      request: {
        name: string;
        expired_time: number;
        remain_quota: number;
        unlimited_quota: boolean;
        group: string;
        model_limits_enabled: boolean;
        model_limits: string;
      };
    }>(request);
    const currentTokens = getCodeGoTokens();
    const nextId =
      currentTokens.reduce((max, item) => Math.max(max, item.id), 0) + 1;
    setCodeGoTokens([
      ...currentTokens,
      {
        id: nextId,
        key: `cg_${nextId}_xxxx`,
        ...payload,
      },
    ]);
    return success(true);
  }),
  http.post(`${TAURI_ENDPOINT}/codego_update_token`, async ({ request }) => {
    const { request: payload } = await withJson<{
      request: {
        id: number;
        name: string;
        expired_time: number;
        remain_quota: number;
        unlimited_quota: boolean;
        group: string;
        model_limits_enabled: boolean;
        model_limits: string;
      };
    }>(request);
    const currentTokens = getCodeGoTokens();
    const nextTokens = currentTokens.map((item) =>
      item.id === payload.id ? { ...item, ...payload } : item,
    );
    setCodeGoTokens(nextTokens);
    return success(nextTokens.find((item) => item.id === payload.id));
  }),
  http.post(`${TAURI_ENDPOINT}/codego_delete_token`, async ({ request }) => {
    const { id } = await withJson<{ id: number }>(request);
    setCodeGoTokens(getCodeGoTokens().filter((item) => item.id !== id));
    return success(true);
  }),
  http.post(`${TAURI_ENDPOINT}/codego_get_usage_logs`, async ({ request }) => {
    const { query = {} } = await withJson<{
      query?: {
        p?: number;
        size?: number;
        token_name?: string;
        model_name?: string;
        request_id?: string;
        type?: number;
        start_timestamp?: number;
        end_timestamp?: number;
      };
    }>(request);
    const page = query.p ?? 0;
    const size = query.size ?? 20;
    const filtered = getCodeGoUsageLogs().filter((item) => {
      if (query.token_name && !item.token_name?.includes(query.token_name)) {
        return false;
      }
      if (query.model_name && !item.model_name?.includes(query.model_name)) {
        return false;
      }
      if (query.request_id && !item.request_id?.includes(query.request_id)) {
        return false;
      }
      if (query.type && item.type !== query.type) {
        return false;
      }
      if (query.start_timestamp && item.created_at < query.start_timestamp) {
        return false;
      }
      if (query.end_timestamp && item.created_at > query.end_timestamp) {
        return false;
      }
      return true;
    });
    const start = page * size;
    return success({
      p: page,
      size,
      total: filtered.length,
      items: filtered.slice(start, start + size),
    });
  }),
  http.post(`${TAURI_ENDPOINT}/codego_ensure_token`, async ({ request }) => {
    const { request: payload = {} } = await withJson<{
      request?: { deviceName?: string };
    }>(request);
    const deviceName = payload.deviceName || "Desktop";
    const tokenName = `codego ${deviceName} - Default`;
    const token = {
      id: 1,
      name: tokenName,
      key: "cg_desktop_xxxx",
      remain_quota: 99,
      unlimited_quota: false,
    };
    setCodeGoSummary({
      tokens: {
        total: 1,
        desktop_token: token,
      },
    });
    return success({
      token: {
        id: token.id,
        name: token.name,
        key: token.key,
      },
      created: false,
      full_key: "cg_desktop_full_key",
      token_name: tokenName,
    });
  }),
  http.post(
    `${TAURI_ENDPOINT}/codego_get_config_template`,
    async ({ request }) => {
      const { tool } = await withJson<{
        tool:
          | "codex"
          | "claude"
          | "gemini"
          | "opencode"
          | "openclaw"
          | "hermes";
      }>(request);
      return success(getCodeGoTemplate(tool));
    },
  ),
  http.post(`${TAURI_ENDPOINT}/codego_get_config_templates`, () =>
    success({
      base_url: "https://shu26.cfd/v1",
      tools: {
        codex: getCodeGoTemplate("codex"),
        claude: getCodeGoTemplate("claude"),
        gemini: getCodeGoTemplate("gemini"),
        opencode: getCodeGoTemplate("opencode"),
        openclaw: getCodeGoTemplate("openclaw"),
        hermes: getCodeGoTemplate("hermes"),
      },
    }),
  ),
  http.post(`${TAURI_ENDPOINT}/codego_get_service_status`, () =>
    success(getCodeGoSummary().service),
  ),
  http.post(`${TAURI_ENDPOINT}/codego_get_tool_config_statuses`, () =>
    success(
      listCodeGoToolConfigs().map((item) => ({
        tool: item.tool,
        app: item.app,
        label: item.label,
        configExists: item.configExists,
        configPath: item.configPath,
        currentProviderId: getCurrentProviderId(item.app) || null,
        currentProviderName:
          listProviders(item.app)[getCurrentProviderId(item.app)]?.name ?? null,
        currentProviderIsCodego:
          item.app === "opencode" ||
          item.app === "openclaw" ||
          item.app === "hermes"
            ? getLiveProviderIds(item.app).includes(item.providerId)
            : getCurrentProviderId(item.app) === item.providerId,
        hasBackup: Boolean(item.backup),
      })),
    ),
  ),
  http.post(
    `${TAURI_ENDPOINT}/codego_get_tool_config_preview`,
    async ({ request }) => {
      const { tool } = await withJson<{
        tool:
          | "codex"
          | "claude"
          | "gemini"
          | "opencode"
          | "openclaw"
          | "hermes";
      }>(request);
      const config = getCodeGoToolConfig(tool);
      return success({
        tool: config.tool,
        label: config.label,
        configPath: config.configPath,
        currentPreview: config.currentPreview,
        nextPreview: config.nextPreview,
        endpoint: config.endpoint,
        providerId: config.providerId,
      });
    },
  ),
  http.post(
    `${TAURI_ENDPOINT}/codego_apply_tool_config`,
    async ({ request }) => {
      const { tool } = await withJson<{
        tool:
          | "codex"
          | "claude"
          | "gemini"
          | "opencode"
          | "openclaw"
          | "hermes";
      }>(request);
      const config = applyCodeGoToolConfig(tool);
      return success({
        tool: config.tool,
        providerId: config.providerId,
        providerName: config.providerName,
        backupSaved: true,
      });
    },
  ),
  http.post(
    `${TAURI_ENDPOINT}/codego_apply_tool_config_from_token`,
    async ({ request }) => {
      const { tokenId, tool } = await withJson<{
        tokenId: number;
        tool:
          | "codex"
          | "claude"
          | "gemini"
          | "opencode"
          | "openclaw"
          | "hermes";
      }>(request);
      const config = applyCodeGoToolConfigFromToken(tokenId, tool);
      return success({
        tool: config.tool,
        providerId: config.providerId,
        providerName: config.providerName,
        backupSaved: true,
      });
    },
  ),
  http.post(
    `${TAURI_ENDPOINT}/codego_restore_tool_config`,
    async ({ request }) => {
      const { tool } = await withJson<{
        tool:
          | "codex"
          | "claude"
          | "gemini"
          | "opencode"
          | "openclaw"
          | "hermes";
      }>(request);
      const result = restoreCodeGoToolConfig(tool);
      if (!result) {
        return HttpResponse.json("No backup available", { status: 400 });
      }
      return success(result);
    },
  ),
  http.post(
    `${TAURI_ENDPOINT}/codego_test_tool_config`,
    async ({ request }) => {
      const { tool } = await withJson<{
        tool:
          | "codex"
          | "claude"
          | "gemini"
          | "opencode"
          | "openclaw"
          | "hermes";
      }>(request);
      const auth = getCodeGoAuthState();
      const config = getCodeGoToolConfig(tool);
      const template = getCodeGoTemplate(tool);
      const endpointMatches = config.currentPreview.includes(template.endpoint);
      const credentialPresent =
        config.currentPreview.includes("cg_desktop_full_key") ||
        config.currentPreview.includes("existing-key");
      const summaryReachable = auth.authenticated;
      const connectivityReachable =
        auth.authenticated &&
        config.configExists &&
        credentialPresent &&
        endpointMatches;
      const message = !auth.authenticated
        ? "codego account is not connected"
        : !config.configExists
          ? `${config.label} config file was not found`
          : !credentialPresent
            ? "Configured file is missing the required API credential"
            : !endpointMatches
              ? "Configured endpoint does not match the current codego template"
              : !connectivityReachable
                ? "Configured tool could not complete a low-cost model probe against the current endpoint"
                : !summaryReachable
                  ? "codego account check failed while testing the tool config"
                  : `${config.label} is configured for the current codego endpoint`;

      return success({
        tool,
        configExists: config.configExists,
        endpointMatches,
        credentialPresent,
        authenticated: auth.authenticated,
        summaryReachable,
        connectivityReachable,
        message,
      });
    },
  ),
  http.post(`${TAURI_ENDPOINT}/get_providers`, async ({ request }) => {
    const { app } = await withJson<{ app: AppId }>(request);
    return success(getProviders(app));
  }),

  http.post(`${TAURI_ENDPOINT}/get_current_provider`, async ({ request }) => {
    const { app } = await withJson<{ app: AppId }>(request);
    return success(getCurrentProviderId(app));
  }),

  http.post(
    `${TAURI_ENDPOINT}/update_providers_sort_order`,
    async ({ request }) => {
      const { updates = [], app } = await withJson<{
        updates: { id: string; sortIndex: number }[];
        app: AppId;
      }>(request);
      updateSortOrder(app, updates);
      return success(true);
    },
  ),

  http.post(`${TAURI_ENDPOINT}/update_tray_menu`, () => success(true)),

  http.post(`${TAURI_ENDPOINT}/get_opencode_live_provider_ids`, () =>
    success(getLiveProviderIds("opencode")),
  ),

  http.post(`${TAURI_ENDPOINT}/get_openclaw_live_provider_ids`, () =>
    success(getLiveProviderIds("openclaw")),
  ),

  http.post(`${TAURI_ENDPOINT}/get_openclaw_default_model`, () =>
    success({ primary: null, fallback: [] }),
  ),

  http.post(`${TAURI_ENDPOINT}/scan_openclaw_config_health`, () => success([])),

  http.post(`${TAURI_ENDPOINT}/switch_provider`, async ({ request }) => {
    const { id, app } = await withJson<{ id: string; app: AppId }>(request);
    const providers = listProviders(app);
    if (!providers[id]) {
      return HttpResponse.json(false, { status: 404 });
    }
    setCurrentProviderId(app, id);
    return success(true);
  }),

  http.post(`${TAURI_ENDPOINT}/add_provider`, async ({ request }) => {
    const { provider, app } = await withJson<{
      provider: Provider & { id?: string };
      app: AppId;
    }>(request);

    const newId = provider.id ?? `mock-${Date.now()}`;
    addProvider(app, { ...provider, id: newId });
    return success(true);
  }),

  http.post(`${TAURI_ENDPOINT}/update_provider`, async ({ request }) => {
    const { provider, app } = await withJson<{
      provider: Provider;
      app: AppId;
    }>(request);
    updateProvider(app, provider);
    return success(true);
  }),

  http.post(`${TAURI_ENDPOINT}/delete_provider`, async ({ request }) => {
    const { id, app } = await withJson<{ id: string; app: AppId }>(request);
    deleteProvider(app, id);
    return success(true);
  }),

  http.post(`${TAURI_ENDPOINT}/import_default_config`, async () => {
    resetProviderState();
    return success(true);
  }),

  http.post(`${TAURI_ENDPOINT}/open_external`, () => success(true)),
  http.post(`${TAURI_ENDPOINT}/open_config_folder`, () => success(true)),

  http.post(`${TAURI_ENDPOINT}/list_sessions`, () => success(listSessions())),

  http.post(`${TAURI_ENDPOINT}/get_session_messages`, async ({ request }) => {
    const { providerId, sourcePath } = await withJson<{
      providerId: string;
      sourcePath: string;
    }>(request);
    return success(getSessionMessages(providerId, sourcePath));
  }),

  http.post(`${TAURI_ENDPOINT}/delete_session`, async ({ request }) => {
    const { providerId, sessionId, sourcePath } = await withJson<{
      providerId: string;
      sessionId: string;
      sourcePath: string;
    }>(request);
    return success(deleteSession(providerId, sessionId, sourcePath));
  }),

  http.post(`${TAURI_ENDPOINT}/delete_sessions`, async ({ request }) => {
    const { items = [] } = await withJson<{
      items?: {
        providerId: string;
        sessionId: string;
        sourcePath: string;
      }[];
    }>(request);

    return success(
      items.map((item) => ({
        providerId: item.providerId,
        sessionId: item.sessionId,
        sourcePath: item.sourcePath,
        success: deleteSession(
          item.providerId,
          item.sessionId,
          item.sourcePath,
        ),
      })),
    );
  }),

  // MCP APIs
  http.post(`${TAURI_ENDPOINT}/get_mcp_config`, async ({ request }) => {
    const { app } = await withJson<{ app: AppId }>(request);
    return success(getMcpConfig(app));
  }),

  http.post(`${TAURI_ENDPOINT}/import_mcp_from_claude`, () => success(1)),
  http.post(`${TAURI_ENDPOINT}/import_mcp_from_codex`, () => success(1)),

  http.post(`${TAURI_ENDPOINT}/set_mcp_enabled`, async ({ request }) => {
    const { app, id, enabled } = await withJson<{
      app: AppId;
      id: string;
      enabled: boolean;
    }>(request);
    setMcpServerEnabled(app, id, enabled);
    return success(true);
  }),

  http.post(
    `${TAURI_ENDPOINT}/upsert_mcp_server_in_config`,
    async ({ request }) => {
      const { app, id, spec } = await withJson<{
        app: AppId;
        id: string;
        spec: McpServer;
      }>(request);
      upsertMcpServer(app, id, spec);
      return success(true);
    },
  ),

  http.post(
    `${TAURI_ENDPOINT}/delete_mcp_server_in_config`,
    async ({ request }) => {
      const { app, id } = await withJson<{ app: AppId; id: string }>(request);
      deleteMcpServer(app, id);
      return success(true);
    },
  ),

  http.post(`${TAURI_ENDPOINT}/restart_app`, () => success(true)),

  http.post(`${TAURI_ENDPOINT}/get_settings`, () => success(getSettings())),

  http.post(`${TAURI_ENDPOINT}/check_env_conflicts`, () => success([])),

  http.post(`${TAURI_ENDPOINT}/save_settings`, async ({ request }) => {
    const { settings } = await withJson<{ settings: Settings }>(request);
    setSettings(settings);
    return success(true);
  }),

  http.post(
    `${TAURI_ENDPOINT}/set_app_config_dir_override`,
    async ({ request }) => {
      const { path } = await withJson<{ path: string | null }>(request);
      setAppConfigDirOverrideState(path ?? null);
      return success(true);
    },
  ),

  http.post(`${TAURI_ENDPOINT}/get_app_config_dir_override`, () =>
    success(getAppConfigDirOverride()),
  ),

  http.post(
    `${TAURI_ENDPOINT}/apply_claude_plugin_config`,
    async ({ request }) => {
      const { official } = await withJson<{ official: boolean }>(request);
      setSettings({ enableClaudePluginIntegration: !official });
      return success(true);
    },
  ),

  http.post(`${TAURI_ENDPOINT}/apply_claude_onboarding_skip`, () =>
    success(true),
  ),

  http.post(`${TAURI_ENDPOINT}/clear_claude_onboarding_skip`, () =>
    success(true),
  ),

  http.post(`${TAURI_ENDPOINT}/get_config_dir`, async ({ request }) => {
    const { app } = await withJson<{ app: AppId }>(request);
    return success(app === "claude" ? "/default/claude" : "/default/codex");
  }),

  http.post(`${TAURI_ENDPOINT}/is_portable_mode`, () => success(false)),

  http.post(
    `${TAURI_ENDPOINT}/select_config_directory`,
    async ({ request }) => {
      const { defaultPath, default_path } = await withJson<{
        defaultPath?: string;
        default_path?: string;
      }>(request);
      const initial = defaultPath ?? default_path;
      return success(initial ? `${initial}/picked` : "/mock/selected-dir");
    },
  ),

  http.post(`${TAURI_ENDPOINT}/pick_directory`, async ({ request }) => {
    const { defaultPath, default_path } = await withJson<{
      defaultPath?: string;
      default_path?: string;
    }>(request);
    const initial = defaultPath ?? default_path;
    return success(initial ? `${initial}/picked` : "/mock/selected-dir");
  }),

  http.post(`${TAURI_ENDPOINT}/open_file_dialog`, () =>
    success("/mock/import-settings.json"),
  ),

  http.post(
    `${TAURI_ENDPOINT}/import_config_from_file`,
    async ({ request }) => {
      const { filePath } = await withJson<{ filePath: string }>(request);
      if (!filePath) {
        return success({ success: false, message: "Missing file" });
      }
      setSettings({ language: "en" });
      return success({ success: true, backupId: "backup-123" });
    },
  ),

  http.post(`${TAURI_ENDPOINT}/export_config_to_file`, async ({ request }) => {
    const { filePath } = await withJson<{ filePath: string }>(request);
    if (!filePath) {
      return success({ success: false, message: "Invalid destination" });
    }
    return success({ success: true, filePath });
  }),

  http.post(`${TAURI_ENDPOINT}/save_file_dialog`, () =>
    success("/mock/export-settings.json"),
  ),

  // Sync current providers live (no-op success)
  http.post(`${TAURI_ENDPOINT}/sync_current_providers_live`, () =>
    success({ success: true }),
  ),

  // Proxy status (for SettingsPage / ProxyPanel hooks)
  http.post(`${TAURI_ENDPOINT}/get_proxy_status`, () =>
    success({
      running: false,
      address: "127.0.0.1",
      port: 0,
      active_connections: 0,
      total_requests: 0,
      success_requests: 0,
      failed_requests: 0,
      success_rate: 0,
      uptime_seconds: 0,
      current_provider: null,
      current_provider_id: null,
      last_request_at: null,
      last_error: null,
      failover_count: 0,
      active_targets: [],
    }),
  ),

  http.post(`${TAURI_ENDPOINT}/get_proxy_takeover_status`, () =>
    success({
      claude: false,
      codex: false,
      gemini: false,
    }),
  ),

  http.post(`${TAURI_ENDPOINT}/is_live_takeover_active`, () => success(false)),

  // Failover / circuit breaker defaults
  http.post(`${TAURI_ENDPOINT}/get_failover_queue`, () => success([])),
  http.post(`${TAURI_ENDPOINT}/get_available_providers_for_failover`, () =>
    success([]),
  ),
  http.post(`${TAURI_ENDPOINT}/add_to_failover_queue`, () => success(true)),
  http.post(`${TAURI_ENDPOINT}/remove_from_failover_queue`, () =>
    success(true),
  ),
  http.post(`${TAURI_ENDPOINT}/reorder_failover_queue`, () => success(true)),
  http.post(`${TAURI_ENDPOINT}/set_failover_item_enabled`, () => success(true)),

  http.post(`${TAURI_ENDPOINT}/get_circuit_breaker_config`, () =>
    success({
      failureThreshold: 3,
      successThreshold: 2,
      timeoutSeconds: 60,
      errorRateThreshold: 50,
      minRequests: 5,
    }),
  ),
  http.post(`${TAURI_ENDPOINT}/update_circuit_breaker_config`, () =>
    success(true),
  ),
  http.post(`${TAURI_ENDPOINT}/get_provider_health`, () =>
    success({
      provider_id: "mock-provider",
      app_type: "claude",
      is_healthy: true,
      consecutive_failures: 0,
      last_success_at: null,
      last_failure_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    }),
  ),
  http.post(`${TAURI_ENDPOINT}/reset_circuit_breaker`, () => success(true)),
  http.post(`${TAURI_ENDPOINT}/get_circuit_breaker_stats`, () => success(null)),
];
