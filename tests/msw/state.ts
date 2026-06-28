import type { AppId } from "@/lib/api/types";
import type {
  McpServer,
  Provider,
  SessionMessage,
  SessionMeta,
  Settings,
} from "@/types";
import { deepClone } from "@/utils/deepClone";

type ProvidersByApp = Record<AppId, Record<string, Provider>>;
type CurrentProviderState = Record<AppId, string>;
type McpConfigState = Record<AppId, Record<string, McpServer>>;
type LiveProviderIdsByApp = Record<
  "opencode" | "openclaw" | "hermes",
  string[]
>;

interface CodeGoAuthStateFixture {
  authenticated: boolean;
  serverAddress?: string;
  accessToken?: string;
  userId?: number;
  deviceId?: number;
  lastUsername?: string;
  secureStorageStatus?: "protected" | "unavailable";
  secureStorageMessage?: string;
}

interface CodeGoAuthSessionFixture {
  sessionId: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
  status: "pending" | "approved" | "rejected" | "expired";
}

interface CodeGoAccountSummaryFixture {
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
  tokens: {
    total: number;
    desktop_token: {
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
  recent_logs: CodeGoUsageLogItemFixture[];
  actions: {
    server_address: string;
    topup_link: string;
    tokens_path: string;
    logs_path: string;
  };
}

interface CodeGoUsageLogItemFixture {
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

interface CodeGoUsageTrendPointFixture {
  date: string;
  timestamp: number;
  requests: number;
  quota: number;
  token_used: number;
  quota_usd: number;
}

const buildCodeGoTrendFixture = (
  days: number,
  startTimestamp: number,
): CodeGoUsageTrendPointFixture[] =>
  Array.from({ length: days }, (_, index) => {
    const timestamp = startTimestamp + index * 86400;
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    return {
      date,
      timestamp,
      requests: (index % 5) + 1,
      quota: ((index % 4) + 1) * 500000,
      token_used: ((index % 6) + 1) * 150,
      quota_usd: ((index % 4) + 1) * 0.5,
    };
  });

interface CodeGoConfigTemplateFixture {
  tool: "codex" | "claude" | "gemini" | "opencode" | "openclaw" | "hermes";
  label: string;
  server_address: string;
  endpoint: string;
  auth_scheme: string;
  model_format: string;
  env: Record<string, string>;
  default_provider: string;
}

interface CodeGoTokenFixture {
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

interface CodeGoAuthorizedDeviceFixture {
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

type CodeGoTool =
  | "codex"
  | "claude"
  | "gemini"
  | "opencode"
  | "openclaw"
  | "hermes";

interface CodeGoToolConfigBackupFixture {
  savedAt: string;
  previousProviderId: string;
  previousPreview: string;
}

interface CodeGoToolConfigFixture {
  tool: CodeGoTool;
  app: Extract<
    AppId,
    "codex" | "claude" | "gemini" | "opencode" | "openclaw" | "hermes"
  >;
  label: string;
  configPath: string;
  configExists: boolean;
  endpoint: string;
  providerId: string;
  providerName: string;
  currentPreview: string;
  nextPreview: string;
  backup: CodeGoToolConfigBackupFixture | null;
}

const codeGoTokenConfigPreviewByTool = (
  tokenId: number,
  tool: CodeGoTool,
): { preview: string; providerName: string } => {
  const tokenKey = `cg_token_${tokenId}_full_key`;

  switch (tool) {
    case "codex":
      return {
        providerName: "codego Codex",
        preview: `{
  "OPENAI_API_KEY": "${tokenKey}"
}

model_provider = "custom"
model = "gpt-5.5"
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers.custom]
name = "codego"
base_url = "https://shu26.cfd/v1"
wire_api = "responses"
requires_openai_auth = true`,
      };
    case "claude":
      return {
        providerName: "codego Claude",
        preview: `{
  "env": {
    "ANTHROPIC_BASE_URL": "https://shu26.cfd",
    "ANTHROPIC_AUTH_TOKEN": "${tokenKey}"
  }
}`,
      };
    case "gemini":
      return {
        providerName: "codego Gemini",
        preview: `{
  "env": {
    "GOOGLE_GEMINI_BASE_URL": "https://shu26.cfd",
    "GEMINI_API_KEY": "${tokenKey}",
    "GEMINI_MODEL": "gemini-2.5-pro"
  }
}`,
      };
    case "openclaw":
      return {
        providerName: "codego OpenClaw",
        preview: `{
  "baseUrl": "https://shu26.cfd/v1",
  "apiKey": "${tokenKey}",
  "api": "openai-completions",
  "models": [
    {
      "id": "gpt-5.5",
      "name": "gpt-5.5"
    }
  ]
}`,
      };
    case "hermes":
      return {
        providerName: "codego Hermes",
        preview: `{
  "name": "codego Hermes",
  "base_url": "https://shu26.cfd/v1",
  "api_key": "${tokenKey}",
  "api_mode": "chat_completions",
  "models": [
    {
      "id": "gpt-5.5",
      "name": "gpt-5.5"
    }
  ]
}`,
      };
  }
  return {
    providerName: "codego OpenCode",
    preview: `{
  "npm": "@ai-sdk/openai-compatible",
  "name": "codego OpenCode",
  "options": {
    "baseURL": "https://shu26.cfd/v1",
    "apiKey": "${tokenKey}",
    "setCacheKey": true
  },
  "models": {
    "gpt-5.5": {
      "name": "gpt-5.5"
    }
  }
}`,
  };
};

const createDefaultProviders = (): ProvidersByApp => ({
  claude: {
    "claude-1": {
      id: "claude-1",
      name: "Claude Default",
      settingsConfig: {},
      category: "official",
      sortIndex: 0,
      createdAt: Date.now(),
    },
    "claude-2": {
      id: "claude-2",
      name: "Claude Custom",
      settingsConfig: {},
      category: "custom",
      sortIndex: 1,
      createdAt: Date.now() + 1,
    },
  },
  "claude-desktop": {},
  codex: {
    "codex-1": {
      id: "codex-1",
      name: "Codex Default",
      settingsConfig: {},
      category: "official",
      sortIndex: 0,
      createdAt: Date.now(),
    },
    "codex-2": {
      id: "codex-2",
      name: "Codex Secondary",
      settingsConfig: {},
      category: "custom",
      sortIndex: 1,
      createdAt: Date.now() + 1,
    },
  },
  gemini: {
    "gemini-1": {
      id: "gemini-1",
      name: "Gemini Default",
      settingsConfig: {
        env: {
          GEMINI_API_KEY: "test-key",
          GOOGLE_GEMINI_BASE_URL: "https://generativelanguage.googleapis.com",
        },
      },
      category: "official",
      sortIndex: 0,
      createdAt: Date.now(),
    },
  },
  opencode: {},
  openclaw: {},
  hermes: {},
});

const createDefaultCurrent = (): CurrentProviderState => ({
  claude: "claude-1",
  "claude-desktop": "",
  codex: "codex-1",
  gemini: "gemini-1",
  opencode: "",
  openclaw: "",
  hermes: "",
});

const createDefaultToolConfigs = (): Record<
  CodeGoTool,
  CodeGoToolConfigFixture
> => ({
  codex: {
    tool: "codex",
    app: "codex",
    label: "Codex",
    configPath: "/default/codex/config.toml",
    configExists: true,
    endpoint: "https://shu26.cfd/v1",
    providerId: "codego-codex",
    providerName: "codego Codex",
    currentPreview: `{
  "auth": {
    "OPENAI_API_KEY": "existing-key"
  }
}

model_provider = "default"
model = "gpt-5.5"`,
    nextPreview: `{
  "OPENAI_API_KEY": "cg_desktop_full_key"
}

model_provider = "custom"
model = "gpt-5.5"
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers.custom]
name = "codego"
base_url = "https://shu26.cfd/v1"
wire_api = "responses"
requires_openai_auth = true`,
    backup: null,
  },
  claude: {
    tool: "claude",
    app: "claude",
    label: "Claude Code",
    configPath: "/default/claude/settings.json",
    configExists: true,
    endpoint: "https://shu26.cfd",
    providerId: "codego-claude",
    providerName: "codego Claude",
    currentPreview: `{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.anthropic.com",
    "ANTHROPIC_AUTH_TOKEN": "existing-key"
  }
}`,
    nextPreview: `{
  "env": {
    "ANTHROPIC_BASE_URL": "https://shu26.cfd",
    "ANTHROPIC_AUTH_TOKEN": "cg_desktop_full_key"
  }
}`,
    backup: null,
  },
  gemini: {
    tool: "gemini",
    app: "gemini",
    label: "Gemini CLI",
    configPath: "/default/gemini/env.json",
    configExists: true,
    endpoint: "https://shu26.cfd",
    providerId: "codego-gemini",
    providerName: "codego Gemini",
    currentPreview: `{
  "env": {
    "GOOGLE_GEMINI_BASE_URL": "https://generativelanguage.googleapis.com",
    "GEMINI_API_KEY": "existing-key"
  }
}`,
    nextPreview: `{
  "env": {
    "GOOGLE_GEMINI_BASE_URL": "https://shu26.cfd",
    "GEMINI_API_KEY": "cg_desktop_full_key",
    "GEMINI_MODEL": "gemini-2.5-pro"
  }
}`,
    backup: null,
  },
  opencode: {
    tool: "opencode",
    app: "opencode",
    label: "OpenCode",
    configPath: "/default/opencode/opencode.json",
    configExists: true,
    endpoint: "https://shu26.cfd/v1",
    providerId: "codego-opencode",
    providerName: "codego OpenCode",
    currentPreview: `{
  "npm": "@ai-sdk/openai-compatible",
  "name": "Existing OpenCode",
  "options": {
    "baseURL": "https://api.example.com/v1",
    "apiKey": "existing-key"
  },
  "models": {
    "gpt-5.5": {
      "name": "gpt-5.5"
    }
  }
}`,
    nextPreview: `{
  "npm": "@ai-sdk/openai-compatible",
  "name": "codego OpenCode",
  "options": {
    "baseURL": "https://shu26.cfd/v1",
    "apiKey": "cg_desktop_full_key",
    "setCacheKey": true
  },
  "models": {
    "gpt-5.5": {
      "name": "gpt-5.5"
    }
    }
}`,
    backup: null,
  },
  openclaw: {
    tool: "openclaw",
    app: "openclaw",
    label: "OpenClaw",
    configPath: "/default/openclaw/openclaw.json",
    configExists: true,
    endpoint: "https://shu26.cfd/v1",
    providerId: "codego-openclaw",
    providerName: "codego OpenClaw",
    currentPreview: `{
  "baseUrl": "https://api.example.com/v1",
  "apiKey": "existing-key",
  "api": "openai-completions",
  "models": [
    {
      "id": "gpt-5.5",
      "name": "gpt-5.5"
    }
  ]
}`,
    nextPreview: `{
  "baseUrl": "https://shu26.cfd/v1",
  "apiKey": "cg_desktop_full_key",
  "api": "openai-completions",
  "models": [
    {
      "id": "gpt-5.5",
      "name": "gpt-5.5"
    }
  ]
}`,
    backup: null,
  },
  hermes: {
    tool: "hermes",
    app: "hermes",
    label: "Hermes",
    configPath: "/default/hermes/config.yaml",
    configExists: true,
    endpoint: "https://shu26.cfd/v1",
    providerId: "codego-hermes",
    providerName: "codego Hermes",
    currentPreview: `{
  "name": "Existing Hermes",
  "base_url": "https://api.example.com/v1",
  "api_key": "existing-key",
  "api_mode": "chat_completions",
  "models": [
    {
      "id": "gpt-5.5",
      "name": "gpt-5.5"
    }
  ]
}`,
    nextPreview: `{
  "name": "codego Hermes",
  "base_url": "https://shu26.cfd/v1",
  "api_key": "cg_desktop_full_key",
  "api_mode": "chat_completions",
  "models": [
    {
      "id": "gpt-5.5",
      "name": "gpt-5.5"
    }
  ]
}`,
    backup: null,
  },
});

let providers = createDefaultProviders();
let current = createDefaultCurrent();
let liveProviderIds: LiveProviderIdsByApp = {
  opencode: [],
  openclaw: [],
  hermes: [],
};
let settingsState: Settings = {
  showInTray: true,
  minimizeToTrayOnClose: true,
  enableClaudePluginIntegration: false,
  claudeConfigDir: "/default/claude",
  codexConfigDir: "/default/codex",
  codegoTrayEnabled: true,
  codegoLowBalanceNotificationsEnabled: true,
  codegoLowBalanceThresholdUsd: 10,
  language: "zh",
  firstRunNoticeConfirmed: true,
};
let appConfigDirOverride: string | null = null;
let codeGoAuthState: CodeGoAuthStateFixture = {
  authenticated: false,
  serverAddress: "https://shu26.cfd",
  lastUsername: "",
};
let codeGoAuthSession: CodeGoAuthSessionFixture | null = null;
let codeGoUsageLogs: CodeGoUsageLogItemFixture[] = [
  {
    id: 101,
    created_at: 1719500000,
    type: 1,
    content: "chat completion",
    model_name: "gpt-5.5",
    token_name: "codego desktop - default",
    quota: 1.25,
    prompt_tokens: 220,
    completion_tokens: 84,
    use_time: 1200,
    request_id: "req_101",
    upstream_request_id: "upstream_101",
  },
  {
    id: 102,
    created_at: 1719500600,
    type: 1,
    content: "claude request",
    model_name: "claude-sonnet-4",
    token_name: "codego desktop - default",
    quota: 0.88,
    prompt_tokens: 140,
    completion_tokens: 61,
    use_time: 980,
    request_id: "req_102",
    upstream_request_id: "upstream_102",
  },
];
let codeGoUsageTrends: Record<number, CodeGoUsageTrendPointFixture[]> = {
  7: buildCodeGoTrendFixture(7, 1750464000),
  30: buildCodeGoTrendFixture(30, 1748390400),
};
let codeGoTokens: CodeGoTokenFixture[] = [
  {
    id: 1,
    name: "codego desktop - default",
    key: "cg_desktop_xxxx",
    remain_quota: 99,
    unlimited_quota: false,
    group: "default",
    model_limits_enabled: false,
    model_limits: "",
  },
  {
    id: 2,
    name: "codego codex workstation",
    key: "cg_codex_xxxx",
    remain_quota: 250,
    unlimited_quota: false,
    group: "engineering",
    model_limits_enabled: true,
    model_limits: "gpt-5.5,claude-sonnet-4",
  },
];
let codeGoAuthorizedDevices: CodeGoAuthorizedDeviceFixture[] = [
  {
    id: 11,
    deviceName: "codego desktop",
    platform: "windows",
    appVersion: "0.1.0",
    status: "active",
    createdAt: 1719490000,
    lastUsedAt: 1719500600,
    expiresAt: 1720105400,
    revokedAt: 0,
  },
  {
    id: 12,
    deviceName: "MacBook Pro",
    platform: "macos",
    appVersion: "0.1.0",
    status: "active",
    createdAt: 1719400000,
    lastUsedAt: 1719497000,
    expiresAt: 1720011800,
    revokedAt: 0,
  },
];
let codeGoSummary: CodeGoAccountSummaryFixture = {
  account: {
    id: 7,
    username: "demo-user",
    display_name: "Demo User",
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
  tokens: {
    total: 1,
    desktop_token: {
      id: 1,
      name: "codego desktop - default",
      key: "cg_desktop_xxxx",
      remain_quota: 99,
      unlimited_quota: false,
    },
  },
  usage: {
    available_models: ["gpt-5.5", "claude-sonnet-4", "gemini-2.5-pro"],
    today_usd: 3.14,
    last_7_days_usd: 14.25,
    last_request_at: 1719500600,
  },
  service: {
    status: "ok",
    notice: "",
    maintenance: false,
    recommended_action: "",
    affected_scopes: [],
  },
  recent_logs: codeGoUsageLogs,
  actions: {
    server_address: "https://shu26.cfd",
    topup_link: "https://shu26.cfd/topup",
    tokens_path: "/tokens",
    logs_path: "/logs",
  },
};
let codeGoTemplates: Record<
  "codex" | "claude" | "gemini" | "opencode" | "openclaw" | "hermes",
  CodeGoConfigTemplateFixture
> = {
  codex: {
    tool: "codex",
    label: "Codex",
    server_address: "https://shu26.cfd",
    endpoint: "https://shu26.cfd/v1",
    auth_scheme: "bearer",
    model_format: "openai-responses",
    env: {},
    default_provider: "codego",
  },
  claude: {
    tool: "claude",
    label: "Claude Code",
    server_address: "https://shu26.cfd",
    endpoint: "https://shu26.cfd",
    auth_scheme: "bearer",
    model_format: "anthropic",
    env: {},
    default_provider: "codego",
  },
  gemini: {
    tool: "gemini",
    label: "Gemini CLI",
    server_address: "https://shu26.cfd",
    endpoint: "https://shu26.cfd",
    auth_scheme: "bearer",
    model_format: "gemini",
    env: {},
    default_provider: "codego",
  },
  opencode: {
    tool: "opencode",
    label: "OpenCode",
    server_address: "https://shu26.cfd",
    endpoint: "https://shu26.cfd/v1",
    auth_scheme: "openai-compatible-api-key",
    model_format: "openai-compatible",
    env: {
      OPENAI_BASE_URL: "https://shu26.cfd/v1",
    },
    default_provider: "codego OpenCode",
  },
  openclaw: {
    tool: "openclaw",
    label: "OpenClaw",
    server_address: "https://shu26.cfd",
    endpoint: "https://shu26.cfd/v1",
    auth_scheme: "openai-compatible-api-key",
    model_format: "openai-compatible",
    env: {
      OPENAI_BASE_URL: "https://shu26.cfd/v1",
    },
    default_provider: "codego OpenClaw",
  },
  hermes: {
    tool: "hermes",
    label: "Hermes",
    server_address: "https://shu26.cfd",
    endpoint: "https://shu26.cfd/v1",
    auth_scheme: "openai-compatible-api-key",
    model_format: "chat-completions",
    env: {
      OPENAI_BASE_URL: "https://shu26.cfd/v1",
    },
    default_provider: "codego Hermes",
  },
};
let codeGoToolConfigs = createDefaultToolConfigs();
const sessionMessageKey = (providerId: string, sourcePath: string) =>
  `${providerId}:${sourcePath}`;

const createDefaultSessions = (): SessionMeta[] => {
  const now = Date.now();
  return [
    {
      providerId: "codex",
      sessionId: "codex-session-1",
      title: "Codex Session One",
      summary: "Codex summary",
      projectDir: "/mock/codex",
      createdAt: now - 2000,
      lastActiveAt: now - 1000,
      sourcePath: "/mock/codex/session-1.jsonl",
      resumeCommand: "codex resume codex-session-1",
    },
    {
      providerId: "claude",
      sessionId: "claude-session-1",
      title: "Claude Session One",
      summary: "Claude summary",
      projectDir: "/mock/claude",
      createdAt: now - 4000,
      lastActiveAt: now - 3000,
      sourcePath: "/mock/claude/session-1.jsonl",
      resumeCommand: "claude --resume claude-session-1",
    },
  ];
};

const createDefaultSessionMessages = (): Record<string, SessionMessage[]> => ({
  [sessionMessageKey("codex", "/mock/codex/session-1.jsonl")]: [
    {
      role: "user",
      content: "First codex message",
      ts: Date.now() - 1000,
    },
  ],
  [sessionMessageKey("claude", "/mock/claude/session-1.jsonl")]: [
    {
      role: "user",
      content: "First claude message",
      ts: Date.now() - 3000,
    },
  ],
});

let sessionsState = createDefaultSessions();
let sessionMessagesState = createDefaultSessionMessages();
let mcpConfigs: McpConfigState = {
  claude: {
    sample: {
      id: "sample",
      name: "Sample Claude Server",
      enabled: true,
      apps: {
        claude: true,
        codex: false,
        gemini: false,
        opencode: false,
        openclaw: false,
        hermes: false,
      },
      server: {
        type: "stdio",
        command: "claude-server",
      },
    },
  },
  "claude-desktop": {},
  codex: {
    httpServer: {
      id: "httpServer",
      name: "HTTP Codex Server",
      enabled: false,
      apps: {
        claude: false,
        codex: true,
        gemini: false,
        opencode: false,
        openclaw: false,
        hermes: false,
      },
      server: {
        type: "http",
        url: "http://localhost:3000",
      },
    },
  },
  gemini: {},
  opencode: {},
  openclaw: {},
  hermes: {},
};

const cloneProviders = (value: ProvidersByApp) =>
  deepClone(value) as ProvidersByApp;

export const resetProviderState = () => {
  providers = createDefaultProviders();
  current = createDefaultCurrent();
  liveProviderIds = {
    opencode: [],
    openclaw: [],
    hermes: [],
  };
  sessionsState = createDefaultSessions();
  sessionMessagesState = createDefaultSessionMessages();
  settingsState = {
    showInTray: true,
    minimizeToTrayOnClose: true,
    enableClaudePluginIntegration: false,
    claudeConfigDir: "/default/claude",
    codexConfigDir: "/default/codex",
    codegoTrayEnabled: true,
    codegoLowBalanceNotificationsEnabled: true,
    codegoLowBalanceThresholdUsd: 10,
    language: "zh",
    firstRunNoticeConfirmed: true,
  };
  appConfigDirOverride = null;
  codeGoAuthState = {
    authenticated: false,
    serverAddress: "https://shu26.cfd",
    lastUsername: "",
  };
  codeGoAuthSession = null;
  codeGoUsageLogs = [
    {
      id: 101,
      created_at: 1719500000,
      type: 1,
      content: "chat completion",
      model_name: "gpt-5.5",
      token_name: "codego desktop - default",
      quota: 1.25,
      prompt_tokens: 220,
      completion_tokens: 84,
      use_time: 1200,
      request_id: "req_101",
      upstream_request_id: "upstream_101",
    },
    {
      id: 102,
      created_at: 1719500600,
      type: 1,
      content: "claude request",
      model_name: "claude-sonnet-4",
      token_name: "codego desktop - default",
      quota: 0.88,
      prompt_tokens: 140,
      completion_tokens: 61,
      use_time: 980,
      request_id: "req_102",
      upstream_request_id: "upstream_102",
    },
  ];
  codeGoUsageTrends = {
    7: buildCodeGoTrendFixture(7, 1750464000),
    30: buildCodeGoTrendFixture(30, 1748390400),
  };
  codeGoTokens = [
    {
      id: 1,
      name: "codego desktop - default",
      key: "cg_desktop_xxxx",
      remain_quota: 99,
      unlimited_quota: false,
      group: "default",
      model_limits_enabled: false,
      model_limits: "",
    },
    {
      id: 2,
      name: "codego codex workstation",
      key: "cg_codex_xxxx",
      remain_quota: 250,
      unlimited_quota: false,
      group: "engineering",
      model_limits_enabled: true,
      model_limits: "gpt-5.5,claude-sonnet-4",
    },
  ];
  codeGoAuthorizedDevices = [
    {
      id: 11,
      deviceName: "codego desktop",
      platform: "windows",
      appVersion: "0.1.0",
      status: "active",
      createdAt: 1719490000,
      lastUsedAt: 1719500600,
      expiresAt: 1720105400,
      revokedAt: 0,
    },
    {
      id: 12,
      deviceName: "MacBook Pro",
      platform: "macos",
      appVersion: "0.1.0",
      status: "active",
      createdAt: 1719400000,
      lastUsedAt: 1719497000,
      expiresAt: 1720011800,
      revokedAt: 0,
    },
  ];
  codeGoSummary = {
    account: {
      id: 7,
      username: "demo-user",
      display_name: "Demo User",
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
    tokens: {
      total: 1,
      desktop_token: {
        id: 1,
        name: "codego desktop - default",
        key: "cg_desktop_xxxx",
        remain_quota: 99,
        unlimited_quota: false,
      },
    },
    usage: {
      available_models: ["gpt-5.5", "claude-sonnet-4", "gemini-2.5-pro"],
      today_usd: 3.14,
      last_7_days_usd: 14.25,
      last_request_at: 1719500600,
    },
    service: {
      status: "ok",
      notice: "",
      maintenance: false,
      recommended_action: "",
      affected_scopes: [],
    },
    recent_logs: codeGoUsageLogs,
    actions: {
      server_address: "https://shu26.cfd",
      topup_link: "https://shu26.cfd/topup",
      tokens_path: "/tokens",
      logs_path: "/logs",
    },
  };
  codeGoTemplates = {
    codex: {
      tool: "codex",
      label: "Codex",
      server_address: "https://shu26.cfd",
      endpoint: "https://shu26.cfd/v1",
      auth_scheme: "bearer",
      model_format: "openai-responses",
      env: {},
      default_provider: "codego",
    },
    claude: {
      tool: "claude",
      label: "Claude Code",
      server_address: "https://shu26.cfd",
      endpoint: "https://shu26.cfd",
      auth_scheme: "bearer",
      model_format: "anthropic",
      env: {},
      default_provider: "codego",
    },
    gemini: {
      tool: "gemini",
      label: "Gemini CLI",
      server_address: "https://shu26.cfd",
      endpoint: "https://shu26.cfd",
      auth_scheme: "bearer",
      model_format: "gemini",
      env: {},
      default_provider: "codego",
    },
    opencode: {
      tool: "opencode",
      label: "OpenCode",
      server_address: "https://shu26.cfd",
      endpoint: "https://shu26.cfd/v1",
      auth_scheme: "openai-compatible-api-key",
      model_format: "openai-compatible",
      env: {
        OPENAI_BASE_URL: "https://shu26.cfd/v1",
      },
      default_provider: "codego OpenCode",
    },
    openclaw: {
      tool: "openclaw",
      label: "OpenClaw",
      server_address: "https://shu26.cfd",
      endpoint: "https://shu26.cfd/v1",
      auth_scheme: "openai-compatible-api-key",
      model_format: "openai-compatible",
      env: {
        OPENAI_BASE_URL: "https://shu26.cfd/v1",
      },
      default_provider: "codego OpenClaw",
    },
    hermes: {
      tool: "hermes",
      label: "Hermes",
      server_address: "https://shu26.cfd",
      endpoint: "https://shu26.cfd/v1",
      auth_scheme: "openai-compatible-api-key",
      model_format: "chat-completions",
      env: {
        OPENAI_BASE_URL: "https://shu26.cfd/v1",
      },
      default_provider: "codego Hermes",
    },
  };
  codeGoToolConfigs = createDefaultToolConfigs();
  mcpConfigs = {
    claude: {
      sample: {
        id: "sample",
        name: "Sample Claude Server",
        enabled: true,
        apps: {
          claude: true,
          codex: false,
          gemini: false,
          opencode: false,
          openclaw: false,
          hermes: false,
        },
        server: {
          type: "stdio",
          command: "claude-server",
        },
      },
    },
    "claude-desktop": {},
    codex: {
      httpServer: {
        id: "httpServer",
        name: "HTTP Codex Server",
        enabled: false,
        apps: {
          claude: false,
          codex: true,
          gemini: false,
          opencode: false,
          openclaw: false,
          hermes: false,
        },
        server: {
          type: "http",
          url: "http://localhost:3000",
        },
      },
    },
    gemini: {},
    opencode: {},
    openclaw: {},
    hermes: {},
  };
};

export const getProviders = (appType: AppId) =>
  cloneProviders(providers)[appType] ?? {};

export const getCurrentProviderId = (appType: AppId) => current[appType] ?? "";

export const getLiveProviderIds = (
  appType: "opencode" | "openclaw" | "hermes",
) => [...liveProviderIds[appType]];

export const setLiveProviderIds = (
  appType: "opencode" | "openclaw" | "hermes",
  ids: string[],
) => {
  liveProviderIds[appType] = [...ids];
};

export const setCurrentProviderId = (appType: AppId, providerId: string) => {
  current[appType] = providerId;
};

export const updateProviders = (
  appType: AppId,
  data: Record<string, Provider>,
) => {
  providers[appType] = cloneProviders({ [appType]: data } as ProvidersByApp)[
    appType
  ];
};

export const setProviders = (
  appType: AppId,
  data: Record<string, Provider>,
) => {
  providers[appType] = deepClone(data) as Record<string, Provider>;
};

export const addProvider = (appType: AppId, provider: Provider) => {
  providers[appType] = providers[appType] ?? {};
  providers[appType][provider.id] = provider;
};

export const updateProvider = (appType: AppId, provider: Provider) => {
  if (!providers[appType]) return;
  providers[appType][provider.id] = {
    ...providers[appType][provider.id],
    ...provider,
  };
};

export const deleteProvider = (appType: AppId, providerId: string) => {
  if (!providers[appType]) return;
  delete providers[appType][providerId];
  if (current[appType] === providerId) {
    const fallback = Object.keys(providers[appType])[0] ?? "";
    current[appType] = fallback;
  }
};

export const updateSortOrder = (
  appType: AppId,
  updates: { id: string; sortIndex: number }[],
) => {
  if (!providers[appType]) return;
  updates.forEach(({ id, sortIndex }) => {
    const provider = providers[appType][id];
    if (provider) {
      providers[appType][id] = { ...provider, sortIndex };
    }
  });
};

export const listProviders = (appType: AppId) =>
  deepClone(providers[appType] ?? {}) as Record<string, Provider>;

export const getSettings = () => deepClone(settingsState) as Settings;

export const setSettings = (data: Partial<Settings>) => {
  settingsState = { ...settingsState, ...data };
};

export const getAppConfigDirOverride = () => appConfigDirOverride;

export const setAppConfigDirOverrideState = (value: string | null) => {
  appConfigDirOverride = value;
};

export const getMcpConfig = (appType: AppId) => {
  const servers = deepClone(mcpConfigs[appType] ?? {}) as Record<
    string,
    McpServer
  >;
  return {
    configPath: `/mock/${appType}.mcp.json`,
    servers,
  };
};

export const setMcpConfig = (
  appType: AppId,
  value: Record<string, McpServer>,
) => {
  mcpConfigs[appType] = deepClone(value) as Record<string, McpServer>;
};

export const setMcpServerEnabled = (
  appType: AppId,
  id: string,
  enabled: boolean,
) => {
  if (!mcpConfigs[appType]?.[id]) return;
  mcpConfigs[appType][id] = {
    ...mcpConfigs[appType][id],
    enabled,
  };
};

export const upsertMcpServer = (
  appType: AppId,
  id: string,
  server: McpServer,
) => {
  if (!mcpConfigs[appType]) {
    mcpConfigs[appType] = {};
  }
  mcpConfigs[appType][id] = deepClone(server) as McpServer;
};

export const deleteMcpServer = (appType: AppId, id: string) => {
  if (!mcpConfigs[appType]) return;
  delete mcpConfigs[appType][id];
};

export const listSessions = () => deepClone(sessionsState) as SessionMeta[];

export const getSessionMessages = (providerId: string, sourcePath: string) =>
  deepClone(
    sessionMessagesState[sessionMessageKey(providerId, sourcePath)] ?? [],
  ) as SessionMessage[];

export const deleteSession = (
  providerId: string,
  sessionId: string,
  sourcePath: string,
) => {
  sessionsState = sessionsState.filter(
    (session) =>
      !(
        session.providerId === providerId &&
        session.sessionId === sessionId &&
        session.sourcePath === sourcePath
      ),
  );
  delete sessionMessagesState[sessionMessageKey(providerId, sourcePath)];
  return true;
};

export const setSessionFixtures = (
  sessions: SessionMeta[],
  messages: Record<string, SessionMessage[]>,
) => {
  sessionsState = deepClone(sessions) as SessionMeta[];
  sessionMessagesState = deepClone(messages) as Record<
    string,
    SessionMessage[]
  >;
};

export const getCodeGoAuthState = () =>
  deepClone(codeGoAuthState) as CodeGoAuthStateFixture;

export const setCodeGoAuthState = (value: Partial<CodeGoAuthStateFixture>) => {
  codeGoAuthState = { ...codeGoAuthState, ...value };
};

export const getCodeGoAuthSession = () =>
  deepClone(codeGoAuthSession) as CodeGoAuthSessionFixture | null;

export const setCodeGoAuthSession = (
  value: CodeGoAuthSessionFixture | null,
) => {
  codeGoAuthSession = value
    ? (deepClone(value) as CodeGoAuthSessionFixture)
    : null;
};

export const getCodeGoSummary = () =>
  deepClone(codeGoSummary) as CodeGoAccountSummaryFixture;

export const setCodeGoSummary = (
  value: Partial<CodeGoAccountSummaryFixture>,
) => {
  codeGoSummary = {
    ...codeGoSummary,
    ...value,
    account: {
      ...codeGoSummary.account,
      ...(value.account ?? {}),
    },
    tokens: {
      ...codeGoSummary.tokens,
      ...(value.tokens ?? {}),
    },
    usage: {
      ...codeGoSummary.usage,
      ...(value.usage ?? {}),
    },
    service: {
      ...codeGoSummary.service,
      ...(value.service ?? {}),
    },
    actions: {
      ...codeGoSummary.actions,
      ...(value.actions ?? {}),
    },
  };
};

export const getCodeGoUsageLogs = () =>
  deepClone(codeGoUsageLogs) as CodeGoUsageLogItemFixture[];

export const setCodeGoUsageLogs = (value: CodeGoUsageLogItemFixture[]) => {
  codeGoUsageLogs = deepClone(value) as CodeGoUsageLogItemFixture[];
  codeGoSummary = {
    ...codeGoSummary,
    recent_logs: getCodeGoUsageLogs(),
  };
};

export const getCodeGoUsageTrends = (days: number) =>
  deepClone(
    codeGoUsageTrends[days] ?? codeGoUsageTrends[7],
  ) as CodeGoUsageTrendPointFixture[];

export const setCodeGoUsageTrends = (
  days: number,
  value: CodeGoUsageTrendPointFixture[],
) => {
  codeGoUsageTrends[days] = deepClone(value) as CodeGoUsageTrendPointFixture[];
};

export const getCodeGoTokens = () =>
  deepClone(codeGoTokens) as CodeGoTokenFixture[];

export const setCodeGoTokens = (value: CodeGoTokenFixture[]) => {
  codeGoTokens = deepClone(value) as CodeGoTokenFixture[];
  codeGoSummary = {
    ...codeGoSummary,
    tokens: {
      ...codeGoSummary.tokens,
      total: codeGoTokens.length,
      desktop_token:
        codeGoTokens.find((token) =>
          token.name.toLowerCase().includes("desktop"),
        ) ?? null,
    },
  };
};

export const getCodeGoAuthorizedDevices = () =>
  deepClone(codeGoAuthorizedDevices) as CodeGoAuthorizedDeviceFixture[];

export const setCodeGoAuthorizedDevices = (
  value: CodeGoAuthorizedDeviceFixture[],
) => {
  codeGoAuthorizedDevices = deepClone(value) as CodeGoAuthorizedDeviceFixture[];
};

export const revokeCodeGoAuthorizedDevice = (id: number) => {
  const target = codeGoAuthorizedDevices.find((item) => item.id === id);
  if (!target) return false;

  codeGoAuthorizedDevices = codeGoAuthorizedDevices.filter(
    (item) => item.id !== id,
  );
  if (codeGoAuthState.deviceId === id) {
    codeGoAuthState = {
      ...codeGoAuthState,
      authenticated: false,
      accessToken: undefined,
      userId: undefined,
      deviceId: undefined,
    };
    codeGoAuthSession = null;
  }
  return true;
};

export const getCodeGoTemplate = (
  tool: "codex" | "claude" | "gemini" | "opencode" | "openclaw" | "hermes",
) => deepClone(codeGoTemplates[tool]) as CodeGoConfigTemplateFixture;

export const setCodeGoTemplate = (
  tool: "codex" | "claude" | "gemini" | "opencode" | "openclaw" | "hermes",
  value: Partial<CodeGoConfigTemplateFixture>,
) => {
  codeGoTemplates[tool] = {
    ...codeGoTemplates[tool],
    ...value,
  };
};

export const listCodeGoToolConfigs = () =>
  deepClone(Object.values(codeGoToolConfigs)) as CodeGoToolConfigFixture[];

export const getCodeGoToolConfig = (tool: CodeGoTool) =>
  deepClone(codeGoToolConfigs[tool]) as CodeGoToolConfigFixture;

export const applyCodeGoToolConfig = (tool: CodeGoTool) => {
  const config = codeGoToolConfigs[tool];
  const previousProviderId = getCurrentProviderId(config.app);
  codeGoToolConfigs[tool] = {
    ...config,
    configExists: true,
    currentPreview: config.nextPreview,
    backup: {
      savedAt: new Date().toISOString(),
      previousProviderId,
      previousPreview: config.currentPreview,
    },
  };

  addProvider(config.app, {
    id: config.providerId,
    name: config.providerName,
    settingsConfig: {},
    category: "custom",
    icon: "newapi",
    iconColor:
      tool === "claude"
        ? "#E37A1F"
        : tool === "gemini"
          ? "#4285F4"
          : tool === "opencode"
            ? "#8B5CF6"
            : tool === "openclaw"
              ? "#2563EB"
              : tool === "hermes"
                ? "#14B8A6"
                : "#0F172A",
    sortIndex: 99,
    createdAt: Date.now(),
  });
  if (tool === "opencode" || tool === "openclaw" || tool === "hermes") {
    const liveApp = tool as "opencode" | "openclaw" | "hermes";
    const ids = new Set(getLiveProviderIds(liveApp));
    ids.add(config.providerId);
    setLiveProviderIds(liveApp, [...ids]);
  } else {
    setCurrentProviderId(config.app, config.providerId);
  }

  return getCodeGoToolConfig(tool);
};

export const applyCodeGoToolConfigFromToken = (
  tokenId: number,
  tool: CodeGoTool,
) => {
  const config = codeGoToolConfigs[tool];
  const previousProviderId = getCurrentProviderId(config.app);
  const { preview, providerName } = codeGoTokenConfigPreviewByTool(
    tokenId,
    tool,
  );

  codeGoToolConfigs[tool] = {
    ...config,
    configExists: true,
    currentPreview: preview,
    providerName,
    backup: {
      savedAt: new Date().toISOString(),
      previousProviderId,
      previousPreview: config.currentPreview,
    },
  };

  addProvider(config.app, {
    id: config.providerId,
    name: providerName,
    settingsConfig: {},
    category: "custom",
    icon: "newapi",
    iconColor:
      tool === "claude"
        ? "#E37A1F"
        : tool === "gemini"
          ? "#4285F4"
          : tool === "opencode"
            ? "#8B5CF6"
            : tool === "openclaw"
              ? "#2563EB"
              : tool === "hermes"
                ? "#14B8A6"
                : "#0F172A",
    sortIndex: 99,
    createdAt: Date.now(),
  });
  if (tool === "opencode" || tool === "openclaw" || tool === "hermes") {
    const liveApp = tool as "opencode" | "openclaw" | "hermes";
    const ids = new Set(getLiveProviderIds(liveApp));
    ids.add(config.providerId);
    setLiveProviderIds(liveApp, [...ids]);
  } else {
    setCurrentProviderId(config.app, config.providerId);
  }

  return getCodeGoToolConfig(tool);
};

export const restoreCodeGoToolConfig = (tool: CodeGoTool) => {
  const config = codeGoToolConfigs[tool];
  const backup = config.backup;
  if (!backup) {
    return null;
  }

  codeGoToolConfigs[tool] = {
    ...config,
    currentPreview: backup.previousPreview,
    backup,
  };
  if (tool === "opencode" || tool === "openclaw" || tool === "hermes") {
    const liveApp = tool as "opencode" | "openclaw" | "hermes";
    setLiveProviderIds(
      liveApp,
      getLiveProviderIds(liveApp).filter((id) => id !== config.providerId),
    );
  } else {
    setCurrentProviderId(config.app, backup.previousProviderId);
  }
  return {
    restored: true,
    backupSavedAt: backup.savedAt,
  };
};
