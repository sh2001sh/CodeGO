import { invoke } from "@tauri-apps/api/core";
import type { AppId } from "./types";

export interface CodeGoAuthState {
  serverAddress?: string;
  accessToken?: string;
  userId?: number;
  deviceId?: number;
  lastUsername?: string;
  authenticated: boolean;
  secureStorageStatus?: "protected" | "unavailable";
  secureStorageMessage?: string;
}

export interface CodeGoAuthorizedDevice {
  id: number;
  deviceName: string;
  platform: string;
  appVersion: string;
  status: string;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
  revokedAt: number;
}

export interface CodeGoStartAuthInput {
  serverAddress?: string;
  deviceName?: string;
}

export interface CodeGoAuthSessionStartResponse {
  sessionId: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export interface CodeGoPollAuthInput {
  serverAddress?: string;
  sessionId: string;
}

export interface CodeGoAuthSessionPollResponse {
  status: string;
  authenticated: boolean;
  userId?: number;
  deviceId?: number;
  serverAddress?: string;
  lastUsername?: string;
}

export interface CodeGoAccountSummary {
  account: {
    id: number;
    username: string;
    display_name: string;
    group: string;
    quota: number;
    claude_quota: number;
    used_quota: number;
    request_count: number;
    quota_usd: number;
    claude_quota_usd: number;
    used_quota_usd: number;
    billing_preference: string;
    funding_source_order: string[];
  };
  subscriptions?: CodeGoSubscriptionSummary[];
  tokens: {
    total: number;
    desktop_token?: {
      id: number;
      name: string;
      key: string;
      remain_quota?: number;
      unlimited_quota?: boolean;
      expired_time?: number;
    } | null;
  };
  usage: {
    available_models: string[];
    today_usd: number;
    last_7_days_usd: number;
    last_request_at?: number;
  };
  service: {
    status: string;
    notice: string;
    maintenance: boolean;
    recommended_action: string;
    affected_scopes: string[];
  };
  recent_logs: CodeGoUsageLogItem[];
  actions: {
    server_address: string;
    topup_link: string;
    tokens_path: string;
    logs_path: string;
  };
  website?: {
    group_status?: unknown;
  };
}

export interface CodeGoSubscriptionSummary {
  id: number;
  plan_id: number;
  plan_title: string;
  amount_total_usd: number;
  amount_used_usd: number;
  remaining_usd: number;
  unlimited: boolean;
  period_amount_usd: number;
  period_used_usd: number;
  period_remaining_usd: number;
  start_time: number;
  end_time: number;
  next_reset_time: number;
}

export interface CodeGoUsageLogItem {
  id: number;
  created_at: number;
  type: number;
  content: string;
  model_name?: string;
  token_name?: string;
  quota?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  use_time?: number;
  request_id?: string;
  upstream_request_id?: string;
}

export interface CodeGoUsageLogsPage {
  p: number;
  size: number;
  total: number;
  items: CodeGoUsageLogItem[];
}

export interface CodeGoUsageTrendPoint {
  date: string;
  timestamp: number;
  requests: number;
  quota: number;
  token_used: number;
  quota_usd: number;
}

export interface CodeGoUsageTrendsResponse {
  days: number;
  trend: CodeGoUsageTrendPoint[];
}

export interface CodeGoEnsureTokenResult {
  token: {
    id: number;
    name: string;
    key: string;
  };
  created: boolean;
  full_key: string;
  token_name: string;
}

export interface CodeGoFetchedModel {
  id: string;
  owned_by?: string | null;
}

export interface CodeGoConfigTemplate {
  tool: "codex" | "claude" | "gemini" | "opencode" | "openclaw" | "hermes";
  label: string;
  server_address: string;
  endpoint: string;
  auth_scheme: string;
  model_format: string;
  env: Record<string, string>;
  default_provider: string;
}

export interface CodeGoConfigTemplatesResponse {
  base_url: string;
  tools: Record<
    "codex" | "claude" | "gemini" | "opencode" | "openclaw" | "hermes",
    CodeGoConfigTemplate
  >;
}

export interface CodeGoServiceStatus {
  status: string;
  notice: string;
  maintenance: boolean;
  recommended_action: string;
  affected_scopes: string[];
}

export interface CodeGoUsageLogsQuery {
  p?: number;
  size?: number;
  type?: number;
  start_timestamp?: number;
  end_timestamp?: number;
  token_name?: string;
  model_name?: string;
  group?: string;
  request_id?: string;
  upstream_request_id?: string;
}

export interface CodeGoToken {
  id: number;
  name: string;
  key: string;
  status?: number;
  remain_quota?: number;
  used_quota?: number;
  unlimited_quota?: boolean;
  expired_time?: number;
  group?: string;
  model_limits_enabled?: boolean;
  model_limits?: string;
}

export interface CodeGoTokenPage {
  p: number;
  size: number;
  total: number;
  items: CodeGoToken[];
}

export interface CodeGoGroupItem {
  name: string;
  desc?: string;
  ratio?: number | string;
  current?: boolean;
  available_models_count?: number;
}

export interface CodeGoGroupsResponse {
  current: string;
  items: CodeGoGroupItem[];
}

export interface CodeGoPricingModel {
  model_name: string;
  description?: string;
  icon?: string;
  tags?: string;
  vendor_id?: number;
  quota_type: number;
  model_ratio: number;
  model_price: number;
  completion_ratio: number;
  cache_ratio?: number | null;
  create_cache_ratio?: number | null;
  image_ratio?: number | null;
  audio_ratio?: number | null;
  audio_completion_ratio?: number | null;
  enable_groups: string[];
  supported_endpoint_types: string[];
  billing_mode?: string;
  billing_expr?: string;
  pricing_version?: string;
}

export interface CodeGoPricingData {
  success?: boolean;
  message?: string;
  data?: CodeGoPricingModel[];
  group_ratio?: Record<string, number>;
  usable_group?: Record<string, unknown>;
  pricing_version?: string;
}

export type CodeGoGroupAvailabilityStatus =
  | "healthy"
  | "slow"
  | "degraded"
  | "unknown";

export interface CodeGoGroupStatusBucket {
  ts: number;
  success_rate: number | null;
  request_count: number;
}

export interface CodeGoGroupModelStatusItem {
  model: string;
  status: CodeGoGroupAvailabilityStatus;
  success_rate: number | null;
  sample_window: number;
  series_window?: number;
  bucket_seconds?: number;
  request_count?: number;
  series?: CodeGoGroupStatusBucket[];
}

export interface CodeGoGroupStatusItem {
  group: string;
  status: CodeGoGroupAvailabilityStatus;
  request_count?: number;
  models: CodeGoGroupModelStatusItem[];
}

export interface CodeGoGroupStatusResponse {
  success?: boolean;
  message?: string;
  data?: CodeGoGroupStatusItem[];
}

export interface CodeGoPricingResponse {
  success?: boolean;
  message?: string;
  data?: CodeGoPricingModel[];
  pricing_version?: string;
}

export interface CodeGoTokenCreateInput {
  name: string;
  expired_time: number;
  remain_quota: number;
  unlimited_quota: boolean;
  group: string;
  model_limits_enabled: boolean;
  model_limits: string;
}

export interface CodeGoTokenUpdateInput extends CodeGoTokenCreateInput {
  id: number;
}

export interface CodeGoToolConfigStatus {
  tool: "codex" | "claude" | "gemini" | "opencode" | "openclaw" | "hermes";
  app: AppId;
  label: string;
  configExists: boolean;
  configPath: string;
  currentProviderId?: string | null;
  currentProviderName?: string | null;
  currentProviderIsCodego: boolean;
  hasBackup: boolean;
  conflictDetected: boolean;
  conflictReason?: string | null;
  restartHint: string;
  verifyHint: string;
}

export interface CodeGoToolConfigPreview {
  tool: "codex" | "claude" | "gemini" | "opencode" | "openclaw" | "hermes";
  label: string;
  configPath: string;
  currentPreview: string;
  nextPreview: string;
  endpoint: string;
  providerId: string;
}

export interface CodeGoToolConfigApplyResult {
  tool: "codex" | "claude" | "gemini" | "opencode" | "openclaw" | "hermes";
  providerId: string;
  providerName: string;
  backupSaved: boolean;
}

export interface CodeGoToolRestoreResult {
  restored: boolean;
  backupSavedAt?: string | null;
}

export interface CodeGoToolConfigTestResult {
  tool: "codex" | "claude" | "gemini" | "opencode" | "openclaw" | "hermes";
  configExists: boolean;
  endpointMatches: boolean;
  credentialPresent: boolean;
  authenticated: boolean;
  summaryReachable: boolean;
  connectivityReachable: boolean;
  message: string;
}

export interface CodeGoDiagnosticPreview {
  hasReport: boolean;
  reportType: string;
  source: string;
  summary: string;
  preview: string;
  generatedAt?: number | null;
  redactionsApplied: string[];
}

export interface CodeGoSubmitDiagnosticReportInput {
  note?: string;
}

export interface CodeGoSubmitDiagnosticReportResponse {
  id: number;
  status: string;
}

export const codegoApi = {
  async getAuthState(): Promise<CodeGoAuthState> {
    return invoke("codego_get_auth_state");
  },

  async startAuthSession(
    input?: CodeGoStartAuthInput,
  ): Promise<CodeGoAuthSessionStartResponse> {
    return invoke("codego_start_auth_session", { request: input });
  },

  async pollAuthSession(
    input: CodeGoPollAuthInput,
  ): Promise<CodeGoAuthSessionPollResponse> {
    return invoke("codego_poll_auth_session", { request: input });
  },

  async logout(): Promise<boolean> {
    return invoke("codego_logout");
  },

  async getAccountSummary(): Promise<CodeGoAccountSummary> {
    return invoke("codego_get_account_summary");
  },

  async listAuthorizedDevices(): Promise<CodeGoAuthorizedDevice[]> {
    return invoke("codego_list_authorized_devices");
  },

  async revokeAuthorizedDevice(id: number): Promise<boolean> {
    return invoke("codego_revoke_authorized_device", { id });
  },

  async getUsageLogs(
    query?: CodeGoUsageLogsQuery,
  ): Promise<CodeGoUsageLogsPage> {
    return invoke("codego_get_usage_logs", { query });
  },

  async getUsageTrends(days = 7): Promise<CodeGoUsageTrendsResponse> {
    return invoke("codego_get_usage_trends", { days });
  },

  async getDiagnosticPreview(): Promise<CodeGoDiagnosticPreview> {
    return invoke("codego_get_diagnostic_preview");
  },

  async submitDiagnosticReport(
    input?: CodeGoSubmitDiagnosticReportInput,
  ): Promise<CodeGoSubmitDiagnosticReportResponse> {
    return invoke("codego_submit_diagnostic_report", { request: input });
  },

  async getTokens(query?: {
    p?: number;
    size?: number;
  }): Promise<CodeGoTokenPage> {
    return invoke("codego_get_tokens", { query });
  },

  async createToken(input: CodeGoTokenCreateInput): Promise<boolean> {
    return invoke("codego_create_token", { request: input });
  },

  async updateToken(input: CodeGoTokenUpdateInput): Promise<CodeGoToken> {
    return invoke("codego_update_token", { request: input });
  },

  async deleteToken(id: number): Promise<boolean> {
    return invoke("codego_delete_token", { id });
  },

  async getTokenKey(id: number): Promise<{ key: string }> {
    return invoke("codego_get_token_key", { id });
  },

  async getGroups(): Promise<CodeGoGroupsResponse> {
    return invoke("codego_get_groups");
  },

  async getGroupStatus(): Promise<CodeGoGroupStatusResponse> {
    return invoke("codego_get_group_status");
  },

  async getPricing(): Promise<CodeGoPricingData> {
    return invoke("codego_get_pricing");
  },

  async ensureToken(deviceName?: string): Promise<CodeGoEnsureTokenResult> {
    return invoke("codego_ensure_token", {
      request: { deviceName },
    });
  },

  async fetchModelsForToken(input: {
    tool: "codex" | "claude" | "gemini" | "opencode" | "openclaw" | "hermes";
    endpoint: string;
    apiKey: string;
  }): Promise<CodeGoFetchedModel[]> {
    return invoke("codego_fetch_models_for_token", {
      request: {
        tool: input.tool,
        endpoint: input.endpoint,
        apiKey: input.apiKey,
      },
    });
  },

  async getConfigTemplate(
    tool: "codex" | "claude" | "gemini" | "opencode" | "openclaw" | "hermes",
  ): Promise<CodeGoConfigTemplate> {
    return invoke("codego_get_config_template", { tool });
  },

  async getConfigTemplates(): Promise<CodeGoConfigTemplatesResponse> {
    return invoke("codego_get_config_templates");
  },

  async getServiceStatus(): Promise<CodeGoServiceStatus> {
    return invoke("codego_get_service_status");
  },

  async getToolConfigStatuses(): Promise<CodeGoToolConfigStatus[]> {
    return invoke("codego_get_tool_config_statuses");
  },

  async getToolConfigPreview(
    tool: "codex" | "claude" | "gemini" | "opencode" | "openclaw" | "hermes",
  ): Promise<CodeGoToolConfigPreview> {
    return invoke("codego_get_tool_config_preview", { tool });
  },

  async applyToolConfig(
    tool: "codex" | "claude" | "gemini" | "opencode" | "openclaw" | "hermes",
  ): Promise<CodeGoToolConfigApplyResult> {
    return invoke("codego_apply_tool_config", { tool });
  },

  async applyToolConfigFromToken(
    tokenId: number,
    tool: "codex" | "claude" | "gemini" | "opencode" | "openclaw" | "hermes",
  ): Promise<CodeGoToolConfigApplyResult> {
    return invoke("codego_apply_tool_config_from_token", { tokenId, tool });
  },

  async restoreToolConfig(
    tool: "codex" | "claude" | "gemini" | "opencode" | "openclaw" | "hermes",
  ): Promise<CodeGoToolRestoreResult> {
    return invoke("codego_restore_tool_config", { tool });
  },

  async testToolConfig(
    tool: "codex" | "claude" | "gemini" | "opencode" | "openclaw" | "hermes",
  ): Promise<CodeGoToolConfigTestResult> {
    return invoke("codego_test_tool_config", { tool });
  },
};
