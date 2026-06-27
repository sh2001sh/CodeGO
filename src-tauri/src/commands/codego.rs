#![allow(non_snake_case)]

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use crate::app_config::AppType;
use crate::codex_config::{get_codex_auth_path, get_codex_config_path};
use crate::config::{delete_file, read_json_file, write_json_file, write_text_file};
use crate::hermes_config::{
    get_hermes_config_path, json_to_yaml as hermes_json_to_yaml, read_hermes_config,
    set_model_config as set_hermes_model_config, yaml_to_json as hermes_yaml_to_json,
    HermesModelConfig,
};
use crate::openclaw_config::{
    get_agents_defaults as get_openclaw_agents_defaults, get_env_config as get_openclaw_env_config,
    get_openclaw_config_path, read_openclaw_config, set_provider as set_openclaw_provider,
    set_agents_defaults as set_openclaw_agents_defaults, set_env_config as set_openclaw_env_config,
    set_tools_config as set_openclaw_tools_config, OpenClawAgentsDefaults, OpenClawEnvConfig,
    OpenClawToolsConfig,
};
use crate::opencode_config::{get_opencode_config_path, read_opencode_config, write_opencode_config};
use crate::provider::Provider;
use crate::secure_store::{clear_codego_auth, load_codego_auth, save_codego_auth};
use crate::services::provider::provider_exists_in_live_config;
use crate::services::ProviderService;
use crate::settings::{get_settings, set_codego_last_seen_quota_usd, update_settings};
use crate::store::AppState;
use super::codego_telemetry::{current_platform_label, maybe_send_codego_telemetry_event};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Emitter;

const DEFAULT_SERVER_ADDRESS: &str = "https://shu26.cfd";
const USER_AGENT: &str = "CodeGoDesktop/0.1";
const CODEGO_APP_VERSION: &str = env!("CARGO_PKG_VERSION");
const CODEGO_DESKTOP_TOKEN_DEVICE_NAME: &str = "Desktop";
const CODEGO_SUPPORTED_TOOLS: [&str; 6] = [
    "codex",
    "claude",
    "gemini",
    "opencode",
    "openclaw",
    "hermes",
];
const CODEGO_SUMMARY_REFRESH_INTERVAL: Duration = Duration::from_secs(300);
const MIN_CODEGO_SUMMARY_REFRESH_INTERVAL: Duration = Duration::from_secs(30);

static LAST_CODEGO_SUMMARY_REFRESH: Mutex<Option<Instant>> = Mutex::new(None);

fn codego_provider_id(tool: &str) -> String {
    format!("codego-{tool}")
}

fn tool_to_app_type(tool: &str) -> Result<AppType, String> {
    match tool {
        "claude" => Ok(AppType::Claude),
        "codex" => Ok(AppType::Codex),
        "gemini" => Ok(AppType::Gemini),
        "opencode" => Ok(AppType::OpenCode),
        "openclaw" => Ok(AppType::OpenClaw),
        "hermes" => Ok(AppType::Hermes),
        _ => Err(format!("unsupported Code Go tool: {tool}")),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeGoToolConfigStatus {
    pub tool: String,
    pub app: String,
    pub label: String,
    pub config_exists: bool,
    pub config_path: String,
    pub current_provider_id: Option<String>,
    pub current_provider_name: Option<String>,
    pub current_provider_is_codego: bool,
    pub has_backup: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeGoToolConfigPreview {
    pub tool: String,
    pub label: String,
    pub config_path: String,
    pub current_preview: String,
    pub next_preview: String,
    pub endpoint: String,
    pub provider_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeGoToolConfigApplyResult {
    pub tool: String,
    pub provider_id: String,
    pub provider_name: String,
    pub backup_saved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeGoToolRestoreResult {
    pub restored: bool,
    pub backup_saved_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeGoToolConfigTestResult {
    pub tool: String,
    pub config_exists: bool,
    pub endpoint_matches: bool,
    pub credential_present: bool,
    pub authenticated: bool,
    pub summary_reachable: bool,
    pub connectivity_reachable: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodeGoTokenToolConfigPayload {
    pub tool: String,
    pub name: String,
    pub homepage: String,
    pub endpoint: String,
    pub api_key: String,
    pub model: Option<String>,
    pub haiku_model: Option<String>,
    pub sonnet_model: Option<String>,
    pub opus_model: Option<String>,
    pub enabled: bool,
    pub config: String,
    pub config_format: String,
    pub icon: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodeGoTokenConfigResponse {
    pub server_address: String,
    pub tools: HashMap<String, CodeGoTokenToolConfigPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodeGoSavedToolBackup {
    saved_at: String,
    previous_provider_id: Option<String>,
    snapshot: CodeGoLiveSnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum CodeGoLiveSnapshot {
    Claude {
        settings: Option<Value>,
    },
    Codex {
        auth: Option<Value>,
        config: Option<String>,
    },
    Gemini {
        env: Option<HashMap<String, String>>,
        config: Option<Value>,
    },
    OpenCode {
        config: Option<Value>,
    },
    OpenClaw {
        config: Option<Value>,
    },
    Hermes {
        config: Option<Value>,
        model: Option<Value>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeGoAuthState {
    pub server_address: Option<String>,
    pub access_token: Option<String>,
    pub user_id: Option<i64>,
    pub device_id: Option<i64>,
    pub last_username: Option<String>,
    pub authenticated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeGoAuthorizedDevice {
    pub id: i64,
    #[serde(alias = "device_name")]
    pub device_name: String,
    pub platform: String,
    #[serde(alias = "app_version")]
    pub app_version: String,
    pub status: String,
    #[serde(alias = "created_at")]
    pub created_at: i64,
    #[serde(alias = "last_used_at")]
    pub last_used_at: i64,
    #[serde(alias = "expires_at")]
    pub expires_at: i64,
    #[serde(alias = "revoked_at")]
    pub revoked_at: i64,
}

#[derive(Debug, Clone)]
pub struct CodeGoTraySnapshot {
    pub authenticated: bool,
    pub last_username: Option<String>,
    pub quota_usd: Option<f64>,
    pub low_balance_threshold_usd: f64,
    pub low_balance: bool,
    pub server_address: String,
    pub topup_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeGoStartAuthRequest {
    pub server_address: Option<String>,
    pub device_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeGoAuthSessionStateRequest {
    pub server_address: Option<String>,
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeGoAuthSessionStartResponse {
    pub session_id: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: i64,
    pub interval: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeGoAuthSessionPollResponse {
    pub status: String,
    pub authenticated: bool,
    pub access_token: Option<String>,
    pub user_id: Option<i64>,
    pub device_id: Option<i64>,
    pub server_address: Option<String>,
    pub last_username: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeGoEnsureTokenRequest {
    pub device_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeGoUsageLogsQuery {
    pub p: Option<u32>,
    pub page: Option<u32>,
    pub size: Option<u32>,
    pub page_size: Option<u32>,
    pub r#type: Option<i32>,
    pub start_timestamp: Option<i64>,
    pub end_timestamp: Option<i64>,
    pub token_name: Option<String>,
    pub model_name: Option<String>,
    pub group: Option<String>,
    pub request_id: Option<String>,
    pub upstream_request_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeGoPageQuery {
    pub p: Option<u32>,
    pub page: Option<u32>,
    pub size: Option<u32>,
    pub page_size: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeGoTokenWriteRequest {
    pub id: Option<i64>,
    pub name: String,
    pub expired_time: i64,
    pub remain_quota: i64,
    pub unlimited_quota: bool,
    pub group: String,
    pub model_limits_enabled: bool,
    pub model_limits: String,
}

#[derive(Debug, Deserialize)]
struct ApiEnvelope<T> {
    success: bool,
    #[serde(default)]
    message: String,
    data: T,
}

#[derive(Debug, Deserialize)]
struct ApiEmptyEnvelope {
    success: bool,
    #[serde(default)]
    message: String,
}

pub(crate) fn normalize_server_address(input: Option<&str>) -> String {
    let raw = input
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_SERVER_ADDRESS);
    let with_scheme = if raw.contains("://") {
        raw.to_string()
    } else {
        format!("https://{raw}")
    };
    with_scheme.trim_end_matches('/').to_string()
}

pub(crate) fn build_url(server_address: &str, path: &str) -> String {
    format!(
        "{}/{}",
        server_address.trim_end_matches('/'),
        path.trim_start_matches('/')
    )
}

pub(crate) fn load_auth_state() -> CodeGoAuthState {
    let settings = get_settings();
    let access_token = match load_codego_auth() {
        Ok(token) => token,
        Err(error) => {
            log::warn!("读取 Code Go 安全存储失败: {error}");
            None
        }
    };
    let fallback_token = settings.codego_access_token.clone();
    let effective_access_token = if access_token.is_some() {
        access_token
    } else if let Some(legacy_token) = fallback_token {
        if let Err(error) = save_codego_auth(&legacy_token) {
            log::warn!("迁移旧版 Code Go token 到安全存储失败: {error}");
        } else {
            let mut migrated_settings = settings.clone();
            migrated_settings.codego_access_token = None;
            if let Err(error) = update_settings(migrated_settings) {
                log::warn!("迁移后清理旧版 Code Go token 失败: {error}");
            }
        }
        Some(legacy_token)
    } else {
        None
    };

    CodeGoAuthState {
        authenticated: effective_access_token.is_some() && settings.codego_user_id.is_some(),
        server_address: settings.codego_server_address,
        access_token: effective_access_token,
        user_id: settings.codego_user_id,
        device_id: settings.codego_device_id,
        last_username: settings.codego_last_username,
    }
}

pub(crate) fn codego_tray_snapshot() -> Option<CodeGoTraySnapshot> {
    let settings = get_settings();
    if !settings.codego_tray_enabled {
        return None;
    }

    let server_address = normalize_server_address(settings.codego_server_address.as_deref());
    let topup_url = build_url(&server_address, "/topup");
    let quota_usd = settings.codego_last_seen_quota_usd;
    let low_balance = quota_usd
        .map(|value| value <= settings.codego_low_balance_threshold_usd)
        .unwrap_or(false);

    Some(CodeGoTraySnapshot {
        authenticated: load_auth_state().authenticated,
        last_username: settings.codego_last_username,
        quota_usd,
        low_balance_threshold_usd: settings.codego_low_balance_threshold_usd,
        low_balance,
        server_address,
        topup_url,
    })
}

fn persist_auth_state(
    server_address: String,
    access_token: String,
    user_id: i64,
    device_id: i64,
    last_username: String,
) -> Result<(), String> {
    let previous_settings = get_settings();
    let mut settings = previous_settings.clone();
    settings.codego_server_address = Some(server_address);
    settings.codego_user_id = Some(user_id);
    settings.codego_device_id = Some(device_id);
    settings.codego_last_username = Some(last_username);
    settings.codego_last_seen_quota_usd = None;
    settings.codego_access_token = None;
    update_settings(settings).map_err(|e| e.to_string())?;
    if let Err(error) = save_codego_auth(&access_token) {
        if let Err(rollback_error) = update_settings(previous_settings) {
            log::warn!("回滚 Code Go 登录设置失败: {rollback_error}");
        }
        return Err(error);
    }
    Ok(())
}

fn clear_auth_state() -> Result<(), String> {
    let previous_settings = get_settings();
    let mut settings = previous_settings.clone();
    settings.codego_access_token = None;
    settings.codego_user_id = None;
    settings.codego_device_id = None;
    settings.codego_last_username = None;
    settings.codego_last_seen_quota_usd = None;
    update_settings(settings).map_err(|e| e.to_string())?;
    if let Err(error) = clear_codego_auth() {
        if let Err(rollback_error) = update_settings(previous_settings) {
            log::warn!("回滚 Code Go 登出设置失败: {rollback_error}");
        }
        return Err(error);
    }
    Ok(())
}

fn should_refresh_codego_summary(force: bool) -> bool {
    if force {
        let mut guard = LAST_CODEGO_SUMMARY_REFRESH
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *guard = Some(Instant::now());
        return true;
    }

    let mut guard = LAST_CODEGO_SUMMARY_REFRESH
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let now = Instant::now();
    if let Some(last) = *guard {
        if now.duration_since(last) < MIN_CODEGO_SUMMARY_REFRESH_INTERVAL {
            return false;
        }
    }
    *guard = Some(now);
    true
}

fn apply_auth_headers(headers: &mut HeaderMap, state: &CodeGoAuthState) -> Result<(), String> {
    let token = state
        .access_token
        .as_deref()
        .ok_or_else(|| "Code Go is not authenticated".to_string())?;
    let user_id = state
        .user_id
        .ok_or_else(|| "Code Go user id is missing".to_string())?;

    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(token).map_err(|e| format!("invalid access token header: {e}"))?,
    );
    headers.insert(
        "New-Api-User",
        HeaderValue::from_str(&user_id.to_string())
            .map_err(|e| format!("invalid user id header: {e}"))?,
    );
    Ok(())
}

pub(crate) fn build_authed_client(state: &CodeGoAuthState) -> Result<(Client, String), String> {
    let server_address = normalize_server_address(state.server_address.as_deref());
    let mut headers = HeaderMap::new();
    headers.insert(
        reqwest::header::USER_AGENT,
        HeaderValue::from_static(USER_AGENT),
    );
    apply_auth_headers(&mut headers, state)?;

    let client = Client::builder()
        .default_headers(headers)
        .build()
        .map_err(|e| format!("failed to build http client: {e}"))?;
    Ok((client, server_address))
}

pub(crate) async fn parse_response<T: for<'de> Deserialize<'de>>(
    response: reqwest::Response,
) -> Result<T, String> {
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("failed to read response: {e}"))?;

    if !status.is_success() {
        return Err(format!("Code Go request failed ({status}): {text}"));
    }

    let envelope: ApiEnvelope<T> =
        serde_json::from_str(&text).map_err(|e| format!("failed to decode response: {e}"))?;
    if !envelope.success {
        return Err(if envelope.message.trim().is_empty() {
            "Code Go request failed".to_string()
        } else {
            envelope.message
        });
    }
    Ok(envelope.data)
}

pub(crate) async fn parse_empty_response(response: reqwest::Response) -> Result<(), String> {
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("failed to read response: {e}"))?;

    if !status.is_success() {
        return Err(format!("Code Go request failed ({status}): {text}"));
    }

    let envelope: ApiEmptyEnvelope =
        serde_json::from_str(&text).map_err(|e| format!("failed to decode response: {e}"))?;
    if !envelope.success {
        return Err(if envelope.message.trim().is_empty() {
            "Code Go request failed".to_string()
        } else {
            envelope.message
        });
    }
    Ok(())
}

fn desktop_device_name(input: Option<&str>) -> String {
    input
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Code Go Desktop")
        .to_string()
}

fn build_public_client() -> Result<Client, String> {
    Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| format!("failed to build http client: {e}"))
}

fn codego_balance_usd_from_summary(summary: &Value) -> Option<f64> {
    summary
        .pointer("/account/quota_usd")
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite() && *value >= 0.0)
}

fn should_send_low_balance_notification(
    previous_quota_usd: Option<f64>,
    current_quota_usd: f64,
    threshold_usd: f64,
) -> bool {
    if threshold_usd <= 0.0 || !current_quota_usd.is_finite() || current_quota_usd > threshold_usd {
        return false;
    }

    match previous_quota_usd {
        Some(previous) if previous.is_finite() => previous > threshold_usd,
        _ => true,
    }
}

fn summary_topup_url(summary: &Value, server_address: &str) -> String {
    summary
        .pointer("/actions/topup_link")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(|value| {
            if value.contains("://") {
                value.to_string()
            } else {
                build_url(server_address, value)
            }
        })
        .unwrap_or_else(|| build_url(server_address, "/topup"))
}

trait CodeGoSummarySideEffectSink {
    fn send_low_balance_notification(&self, quota_usd: f64, threshold_usd: f64, topup_url: &str);
    fn refresh_tray_menu(&self);
    fn emit_summary_updated(&self, summary: &Value);
}

struct TauriCodeGoSummarySideEffectSink<'a> {
    app: &'a tauri::AppHandle,
}

impl CodeGoSummarySideEffectSink for TauriCodeGoSummarySideEffectSink<'_> {
    fn send_low_balance_notification(&self, quota_usd: f64, threshold_usd: f64, topup_url: &str) {
        send_low_balance_notification(self.app, quota_usd, threshold_usd, topup_url);
    }

    fn refresh_tray_menu(&self) {
        crate::tray::refresh_tray_menu(self.app);
    }

    fn emit_summary_updated(&self, summary: &Value) {
        let _ = self.app.emit("codego-summary-updated", summary.clone());
    }
}

fn send_low_balance_notification(
    app: &tauri::AppHandle,
    quota_usd: f64,
    threshold_usd: f64,
    topup_url: &str,
) {
    use tauri_plugin_notification::NotificationExt;

    let body = format!(
        "Remaining balance is ${quota_usd:.2}. Threshold: ${threshold_usd:.2}. Top up to avoid request failures."
    );

    let builder = app
        .notification()
        .builder()
        .title("Code Go low balance")
        .body(&body);

    if let Err(error) = builder.show() {
        log::warn!("发送 Code Go 低余额通知失败: {error}");
        return;
    }

    log::info!("Code Go low-balance notification sent: {topup_url}");
}

fn apply_account_summary_side_effects_with_sink(
    sink: Option<&dyn CodeGoSummarySideEffectSink>,
    summary: &Value,
) -> Result<(), String> {
    let settings = get_settings();
    let current_quota_usd = codego_balance_usd_from_summary(summary);
    let previous_quota_usd = settings.codego_last_seen_quota_usd;
    let threshold_usd = settings.codego_low_balance_threshold_usd;
    let server_address = normalize_server_address(settings.codego_server_address.as_deref());
    let topup_url = summary_topup_url(summary, &server_address);

    set_codego_last_seen_quota_usd(current_quota_usd).map_err(|e| e.to_string())?;

    if let Some(sink) = sink {
        if settings.codego_low_balance_notifications_enabled {
            if let Some(current_quota_usd) = current_quota_usd {
                if should_send_low_balance_notification(
                    previous_quota_usd,
                    current_quota_usd,
                    threshold_usd,
                ) {
                    sink.send_low_balance_notification(
                        current_quota_usd,
                        threshold_usd,
                        &topup_url,
                    );
                }
            }
        }
        sink.refresh_tray_menu();
        sink.emit_summary_updated(summary);
    }

    Ok(())
}

async fn fetch_account_summary(auth: &CodeGoAuthState) -> Result<Value, String> {
    let (client, server_address) = build_authed_client(auth)?;
    parse_response(
        client
            .get(build_url(&server_address, "/api/desktop/account/summary"))
            .send()
            .await
            .map_err(|e| format!("summary request failed: {e}"))?,
    )
    .await
}

async fn revoke_authorized_device_remote(auth: &CodeGoAuthState, device_id: i64) -> Result<(), String> {
    let (client, server_address) = build_authed_client(auth)?;
    parse_empty_response(
        client
            .delete(build_url(
                &server_address,
                &format!("/api/desktop/devices/{device_id}"),
            ))
            .send()
            .await
            .map_err(|e| format!("device revoke request failed: {e}"))?,
    )
    .await
}

fn apply_account_summary_side_effects(
    app: Option<&tauri::AppHandle>,
    summary: &Value,
) -> Result<(), String> {
    let sink = app.map(|app| TauriCodeGoSummarySideEffectSink { app });
    apply_account_summary_side_effects_with_sink(
        sink.as_ref()
            .map(|sink| sink as &dyn CodeGoSummarySideEffectSink),
        summary,
    )
}

pub(crate) async fn refresh_codego_account_summary(
    app: Option<&tauri::AppHandle>,
    force: bool,
) -> Result<Option<Value>, String> {
    let auth = load_auth_state();
    if !auth.authenticated {
        if let Some(app) = app {
            crate::tray::refresh_tray_menu(app);
        }
        return Ok(None);
    }

    if !should_refresh_codego_summary(force) {
        return Ok(None);
    }

    let summary = fetch_account_summary(&auth).await?;
    apply_account_summary_side_effects(app, &summary)?;
    let quota_usd = codego_balance_usd_from_summary(&summary);
    let settings = get_settings();
    let low_balance = quota_usd
        .map(|value| value <= settings.codego_low_balance_threshold_usd)
        .unwrap_or(false);
    let _ = maybe_send_codego_telemetry_event(
        "summary_refreshed",
        "account_summary",
        json!({
            "trigger": if force { "manual" } else { "background" },
            "serviceStatus": summary.pointer("/service/status").and_then(Value::as_str).unwrap_or("unknown"),
            "lowBalance": low_balance,
        }),
    )
    .await;
    Ok(Some(summary))
}

pub(crate) fn codego_summary_refresh_interval() -> Duration {
    CODEGO_SUMMARY_REFRESH_INTERVAL
}

fn page_query_value(query: &CodeGoPageQuery) -> u32 {
    query.p.or(query.page).unwrap_or(0)
}

fn page_query_size(query: &CodeGoPageQuery) -> u32 {
    query.size.or(query.page_size).unwrap_or(20)
}

fn page_value(query: &CodeGoUsageLogsQuery) -> u32 {
    query.p.or(query.page).unwrap_or(0)
}

fn page_size_value(query: &CodeGoUsageLogsQuery) -> u32 {
    query.size.or(query.page_size).unwrap_or(20)
}

fn tool_label(tool: &str) -> &'static str {
    match tool {
        "claude" => "Claude Code",
        "codex" => "Codex",
        "gemini" => "Gemini CLI",
        "opencode" => "OpenCode",
        "openclaw" => "OpenClaw",
        "hermes" => "Hermes",
        _ => "Unknown Tool",
    }
}

fn config_status_for_app(tool: &str) -> Result<(bool, String), String> {
    let app_type = tool_to_app_type(tool)?;
    match app_type {
        AppType::Claude => {
            let path = crate::config::get_claude_settings_path();
            Ok((path.exists(), path.to_string_lossy().to_string()))
        }
        AppType::Codex => {
            let path = get_codex_config_path();
            Ok((
                path.exists() || get_codex_auth_path().exists(),
                path.to_string_lossy().to_string(),
            ))
        }
        AppType::Gemini => {
            let env_path = crate::gemini_config::get_gemini_env_path();
            let settings_path = crate::gemini_config::get_gemini_settings_path();
            Ok((
                env_path.exists() || settings_path.exists(),
                env_path.to_string_lossy().to_string(),
            ))
        }
        AppType::OpenCode => {
            let path = get_opencode_config_path();
            Ok((path.exists(), path.to_string_lossy().to_string()))
        }
        AppType::OpenClaw => {
            let path = get_openclaw_config_path();
            Ok((path.exists(), path.to_string_lossy().to_string()))
        }
        AppType::Hermes => {
            let path = get_hermes_config_path();
            Ok((path.exists(), path.to_string_lossy().to_string()))
        }
        _ => Err(format!("unsupported Code Go tool: {tool}")),
    }
}

fn current_provider_for_tool(
    state: &AppState,
    tool: &str,
) -> Result<(Option<String>, Option<String>), String> {
    let app_type = tool_to_app_type(tool)?;
    let provider_id = crate::settings::get_effective_current_provider(&state.db, &app_type)
        .map_err(|e| e.to_string())?;
    let provider_name = if let Some(id) = provider_id.as_deref() {
        state
            .db
            .get_provider_by_id(id, app_type.as_str())
            .map_err(|e| e.to_string())?
            .map(|provider| provider.name)
    } else {
        None
    };
    Ok((provider_id, provider_name))
}

fn codego_backup_root() -> std::path::PathBuf {
    crate::config::get_app_config_dir()
        .join("codego")
        .join("tool-backups")
}

fn codego_backup_path(tool: &str) -> std::path::PathBuf {
    codego_backup_root().join(format!("{tool}.json"))
}

fn iso_now_string() -> String {
    let _ = SystemTime::now().duration_since(UNIX_EPOCH);
    chrono::Utc::now().to_rfc3339()
}

fn save_tool_backup(tool: &str, backup: &CodeGoSavedToolBackup) -> Result<(), String> {
    let path = codego_backup_path(tool);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("failed to create backup dir: {e}"))?;
    }
    write_json_file(&path, backup).map_err(|e| e.to_string())
}

fn load_tool_backup(tool: &str) -> Result<Option<CodeGoSavedToolBackup>, String> {
    let path = codego_backup_path(tool);
    if !path.exists() {
        return Ok(None);
    }
    read_json_file(&path)
        .map(Some)
        .map_err(|e| format!("failed to read tool backup: {e}"))
}

fn capture_live_snapshot(tool: &str) -> Result<CodeGoLiveSnapshot, String> {
    match tool_to_app_type(tool)? {
        AppType::Claude => {
            let path = crate::config::get_claude_settings_path();
            let settings = if path.exists() {
                Some(read_json_file(&path).map_err(|e| e.to_string())?)
            } else {
                None
            };
            Ok(CodeGoLiveSnapshot::Claude { settings })
        }
        AppType::Codex => {
            let auth_path = get_codex_auth_path();
            let config_path = get_codex_config_path();
            let auth = if auth_path.exists() {
                Some(read_json_file(&auth_path).map_err(|e| e.to_string())?)
            } else {
                None
            };
            let config = if config_path.exists() {
                Some(
                    fs::read_to_string(&config_path)
                        .map_err(|e| format!("failed to read Codex config: {e}"))?,
                )
            } else {
                None
            };
            Ok(CodeGoLiveSnapshot::Codex { auth, config })
        }
        AppType::Gemini => {
            let env_path = crate::gemini_config::get_gemini_env_path();
            let settings_path = crate::gemini_config::get_gemini_settings_path();
            let env = if env_path.exists() {
                Some(crate::gemini_config::read_gemini_env().map_err(|e| e.to_string())?)
            } else {
                None
            };
            let config = if settings_path.exists() {
                Some(read_json_file(&settings_path).map_err(|e| e.to_string())?)
            } else {
                None
            };
            Ok(CodeGoLiveSnapshot::Gemini { env, config })
        }
        AppType::OpenCode => {
            let path = get_opencode_config_path();
            let config = if path.exists() {
                Some(read_opencode_config().map_err(|e| e.to_string())?)
            } else {
                None
            };
            Ok(CodeGoLiveSnapshot::OpenCode { config })
        }
        AppType::OpenClaw => {
            let path = get_openclaw_config_path();
            let config = if path.exists() {
                Some(read_openclaw_config().map_err(|e| e.to_string())?)
            } else {
                None
            };
            Ok(CodeGoLiveSnapshot::OpenClaw { config })
        }
        AppType::Hermes => {
            let path = get_hermes_config_path();
            let config = if path.exists() {
                Some(hermes_yaml_to_json(&read_hermes_config().map_err(|e| e.to_string())?).map_err(|e| e.to_string())?)
            } else {
                None
            };
            let model = if let Some(cfg) = config.as_ref() {
                cfg.get("model").cloned()
            } else {
                None
            };
            Ok(CodeGoLiveSnapshot::Hermes { config, model })
        }
        _ => Err(format!("unsupported Code Go tool: {tool}")),
    }
}

fn restore_live_snapshot(snapshot: &CodeGoLiveSnapshot) -> Result<(), String> {
    match snapshot {
        CodeGoLiveSnapshot::Claude { settings } => {
            let path = crate::config::get_claude_settings_path();
            if let Some(value) = settings {
                write_json_file(&path, value).map_err(|e| e.to_string())?;
            } else {
                delete_file(&path).map_err(|e| e.to_string())?;
            }
        }
        CodeGoLiveSnapshot::Codex { auth, config } => {
            let auth_path = get_codex_auth_path();
            let config_path = get_codex_config_path();
            if let Some(value) = auth {
                write_json_file(&auth_path, value).map_err(|e| e.to_string())?;
            } else {
                delete_file(&auth_path).map_err(|e| e.to_string())?;
            }
            if let Some(text) = config {
                write_text_file(&config_path, text).map_err(|e| e.to_string())?;
            } else {
                delete_file(&config_path).map_err(|e| e.to_string())?;
            }
        }
        CodeGoLiveSnapshot::Gemini { env, config } => {
            let env_path = crate::gemini_config::get_gemini_env_path();
            let settings_path = crate::gemini_config::get_gemini_settings_path();
            if let Some(map) = env {
                crate::gemini_config::write_gemini_env_atomic(map).map_err(|e| e.to_string())?;
            } else {
                delete_file(&env_path).map_err(|e| e.to_string())?;
            }
            if let Some(value) = config {
                write_json_file(&settings_path, value).map_err(|e| e.to_string())?;
            } else {
                delete_file(&settings_path).map_err(|e| e.to_string())?;
            }
        }
        CodeGoLiveSnapshot::OpenCode { config } => {
            let path = get_opencode_config_path();
            if let Some(value) = config {
                write_opencode_config(value).map_err(|e| e.to_string())?;
            } else {
                delete_file(&path).map_err(|e| e.to_string())?;
            }
        }
        CodeGoLiveSnapshot::OpenClaw { config } => {
            let path = get_openclaw_config_path();
            if let Some(value) = config {
                let providers = value
                    .get("models")
                    .and_then(|v| v.get("providers"))
                    .and_then(Value::as_object)
                    .cloned()
                    .unwrap_or_default();
                let existing = crate::openclaw_config::get_providers().map_err(|e| e.to_string())?;
                for provider_id in existing.keys() {
                    crate::openclaw_config::remove_provider(provider_id).map_err(|e| e.to_string())?;
                }
                for (provider_id, provider_value) in providers {
                    set_openclaw_provider(&provider_id, provider_value).map_err(|e| e.to_string())?;
                }

                let env_config: OpenClawEnvConfig = value
                    .get("env")
                    .cloned()
                    .map(serde_json::from_value)
                    .transpose()
                    .map_err(|e| format!("failed to restore OpenClaw env: {e}"))?
                    .unwrap_or_else(|| OpenClawEnvConfig {
                        vars: get_openclaw_env_config()
                            .ok()
                            .map(|config| config.vars)
                            .unwrap_or_default(),
                    });
                set_openclaw_env_config(&env_config).map_err(|e| e.to_string())?;

                let tools_config: OpenClawToolsConfig = value
                    .get("tools")
                    .cloned()
                    .map(serde_json::from_value)
                    .transpose()
                    .map_err(|e| format!("failed to restore OpenClaw tools: {e}"))?
                    .unwrap_or(OpenClawToolsConfig {
                        profile: None,
                        allow: Vec::new(),
                        deny: Vec::new(),
                        extra: HashMap::new(),
                    });
                set_openclaw_tools_config(&tools_config).map_err(|e| e.to_string())?;

                if let Some(defaults) = value.get("agents").and_then(|v| v.get("defaults")) {
                    let typed: OpenClawAgentsDefaults = serde_json::from_value(defaults.clone())
                        .map_err(|e| format!("failed to restore OpenClaw agents.defaults: {e}"))?;
                    set_openclaw_agents_defaults(&typed).map_err(|e| e.to_string())?;
                } else if get_openclaw_agents_defaults().map_err(|e| e.to_string())?.is_some() {
                    set_openclaw_agents_defaults(&OpenClawAgentsDefaults {
                        model: None,
                        models: None,
                        extra: HashMap::new(),
                    })
                    .map_err(|e| e.to_string())?;
                }
            } else {
                delete_file(&path).map_err(|e| e.to_string())?;
            }
        }
        CodeGoLiveSnapshot::Hermes { config, model } => {
            let path = get_hermes_config_path();
            if let Some(value) = config {
                let yaml = hermes_json_to_yaml(value).map_err(|e| e.to_string())?;
                let yaml_text = serde_yaml::to_string(&yaml)
                    .map_err(|e| format!("failed to serialize Hermes config: {e}"))?;
                write_text_file(&path, &yaml_text).map_err(|e| e.to_string())?;
                if let Some(model_value) = model {
                    let typed: HermesModelConfig = serde_json::from_value(model_value.clone())
                        .map_err(|e| format!("failed to restore Hermes model defaults: {e}"))?;
                    set_hermes_model_config(&typed).map_err(|e| e.to_string())?;
                }
            } else {
                delete_file(&path).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

fn pretty_json(value: &Value) -> String {
    serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string())
}

fn preview_string_for_tool(tool: &str, value: &Value) -> String {
    match tool {
        "codex" => {
            let auth_preview = value.get("auth").map(pretty_json).unwrap_or_default();
            let config_preview = value
                .get("config")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();

            match (
                auth_preview.trim().is_empty(),
                config_preview.trim().is_empty(),
            ) {
                (false, false) => format!("{auth_preview}\n\n{config_preview}"),
                (false, true) => auth_preview,
                (true, false) => config_preview,
                (true, true) => "(empty)".to_string(),
            }
        }
        "claude" => pretty_json(value),
        "gemini" => pretty_json(value),
        _ => pretty_json(value),
    }
}

fn live_settings_value_for_tool(tool: &str) -> Result<Option<Value>, String> {
    let app_type = tool_to_app_type(tool)?;
    let value = match ProviderService::read_live_settings(app_type.clone()) {
        Ok(value) => value,
        Err(_) => return Ok(None),
    };

    if matches!(app_type, AppType::OpenCode | AppType::OpenClaw | AppType::Hermes) {
        return Ok(match app_type {
            AppType::OpenCode => value
                .get("provider")
                .and_then(Value::as_object)
                .and_then(|providers| providers.get(&codego_provider_id(tool)).cloned()),
            AppType::OpenClaw => value
                .get("models")
                .and_then(|v| v.get("providers"))
                .and_then(Value::as_object)
                .and_then(|providers| providers.get(&codego_provider_id(tool)).cloned()),
            AppType::Hermes => value
                .get("custom_providers")
                .and_then(Value::as_array)
                .and_then(|providers| {
                    providers.iter().find(|provider| {
                        provider
                            .get("name")
                            .and_then(Value::as_str)
                            .is_some_and(|name| name == codego_provider_id(tool))
                    })
                })
                .cloned(),
            _ => None,
        });
    }

    Ok(Some(value))
}

fn live_preview_for_tool(tool: &str) -> String {
    match live_settings_value_for_tool(tool) {
        Ok(Some(value)) => preview_string_for_tool(tool, &value),
        Ok(None) => "(not configured)".to_string(),
        Err(error) => error,
    }
}

fn extract_live_endpoint(tool: &str, value: &Value) -> Option<String> {
    match tool {
        "claude" => value
            .pointer("/env/ANTHROPIC_BASE_URL")
            .and_then(Value::as_str)
            .map(|s| s.to_string()),
        "gemini" => value
            .pointer("/env/GOOGLE_GEMINI_BASE_URL")
            .and_then(Value::as_str)
            .map(|s| s.to_string()),
        "codex" => value
            .get("config")
            .and_then(Value::as_str)
            .and_then(|config_text| {
                let doc = config_text.parse::<toml_edit::DocumentMut>().ok()?;
                let provider_id = doc.get("model_provider")?.as_str()?.to_string();
                doc.get("model_providers")?
                    .get(&provider_id)?
                    .get("base_url")?
                    .as_str()
                    .map(|s| s.to_string())
            }),
        "opencode" => value
            .pointer("/options/baseURL")
            .and_then(Value::as_str)
            .map(|s| s.to_string()),
        "openclaw" => value
            .get("baseUrl")
            .and_then(Value::as_str)
            .map(|s| s.to_string()),
        "hermes" => value
            .get("base_url")
            .and_then(Value::as_str)
            .map(|s| s.to_string()),
        _ => None,
    }
}

fn has_live_credential(tool: &str, value: &Value) -> bool {
    match tool {
        "claude" => value
            .pointer("/env/ANTHROPIC_AUTH_TOKEN")
            .and_then(Value::as_str)
            .is_some_and(|s| !s.trim().is_empty()),
        "gemini" => value
            .pointer("/env/GEMINI_API_KEY")
            .and_then(Value::as_str)
            .is_some_and(|s| !s.trim().is_empty()),
        "codex" => value
            .pointer("/auth/OPENAI_API_KEY")
            .and_then(Value::as_str)
            .is_some_and(|s| !s.trim().is_empty()),
        "opencode" => value
            .pointer("/options/apiKey")
            .and_then(Value::as_str)
            .is_some_and(|s| !s.trim().is_empty()),
        "openclaw" => value
            .get("apiKey")
            .and_then(Value::as_str)
            .is_some_and(|s| !s.trim().is_empty()),
        "hermes" => value
            .get("api_key")
            .and_then(Value::as_str)
            .is_some_and(|s| !s.trim().is_empty()),
        _ => false,
    }
}

fn extract_live_credential(tool: &str, value: &Value) -> Option<String> {
    match tool {
        "claude" => value
            .pointer("/env/ANTHROPIC_AUTH_TOKEN")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        "gemini" => value
            .pointer("/env/GEMINI_API_KEY")
            .or_else(|| value.pointer("/env/GOOGLE_API_KEY"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        "codex" => value
            .pointer("/auth/OPENAI_API_KEY")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        "opencode" => value
            .pointer("/options/apiKey")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        "openclaw" => value
            .get("apiKey")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        "hermes" => value
            .get("api_key")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        _ => None,
    }
}

#[derive(Debug, Clone)]
struct CodeGoModelProbe {
    url: String,
    headers: HeaderMap,
}

fn build_model_probe(tool: &str, endpoint: &str, value: &Value) -> Result<Option<CodeGoModelProbe>, String> {
    let endpoint = endpoint.trim();
    if endpoint.is_empty() {
        return Ok(None);
    }
    let Some(credential) = extract_live_credential(tool, value) else {
        return Ok(None);
    };

    let mut headers = HeaderMap::new();
    let url = match tool {
        "claude" => {
            headers.insert(
                "x-api-key",
                HeaderValue::from_str(&credential)
                    .map_err(|e| format!("invalid Claude auth header: {e}"))?,
            );
            headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
            build_url(endpoint, "/v1/models")
        }
        "gemini" => {
            headers.insert(
                "x-goog-api-key",
                HeaderValue::from_str(&credential)
                    .map_err(|e| format!("invalid Gemini auth header: {e}"))?,
            );
            build_url(endpoint, "/v1beta/models")
        }
        "codex" | "opencode" | "openclaw" | "hermes" => {
            headers.insert(
                AUTHORIZATION,
                HeaderValue::from_str(&format!("Bearer {credential}"))
                    .map_err(|e| format!("invalid bearer auth header: {e}"))?,
            );
            build_url(endpoint, "/models")
        }
        _ => return Ok(None),
    };

    Ok(Some(CodeGoModelProbe { url, headers }))
}

fn probe_response_matches_tool(tool: &str, payload: &Value) -> bool {
    match tool {
        "claude" => payload.get("data").and_then(Value::as_array).is_some(),
        "gemini" => payload.get("models").and_then(Value::as_array).is_some(),
        "codex" | "opencode" | "openclaw" | "hermes" => payload
            .get("data")
            .and_then(Value::as_array)
            .is_some()
            || payload
                .get("object")
                .and_then(Value::as_str)
                .is_some_and(|value| value == "list"),
        _ => false,
    }
}

async fn probe_live_model_endpoint(
    tool: &str,
    endpoint: Option<&str>,
    value: Option<&Value>,
) -> Result<bool, String> {
    let Some(endpoint) = endpoint else {
        return Ok(false);
    };
    let Some(value) = value else {
        return Ok(false);
    };
    let Some(probe) = build_model_probe(tool, endpoint, value)? else {
        return Ok(false);
    };

    let client = build_public_client()?;
    let response = client
        .get(&probe.url)
        .headers(probe.headers)
        .send()
        .await
        .map_err(|e| format!("model probe request failed: {e}"))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("failed to read model probe response: {e}"))?;

    if !status.is_success() {
        let body = text.trim();
        return Err(if body.is_empty() {
            format!("model probe returned {status}")
        } else {
            format!("model probe returned {status}: {body}")
        });
    }

    let payload: Value = serde_json::from_str(&text)
        .map_err(|e| format!("invalid model probe response JSON: {e}"))?;
    Ok(probe_response_matches_tool(tool, &payload))
}

#[tauri::command]
pub async fn codego_get_tool_config_statuses(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<CodeGoToolConfigStatus>, String> {
    CODEGO_SUPPORTED_TOOLS
        .iter()
        .map(|tool| {
            let (config_exists, config_path) = config_status_for_app(tool)?;
            let (current_provider_id, current_provider_name) =
                current_provider_for_tool(state.inner(), tool)?;
            let has_backup = codego_backup_path(tool).exists();
            Ok(CodeGoToolConfigStatus {
                tool: (*tool).to_string(),
                app: tool_to_app_type(tool)?.as_str().to_string(),
                label: tool_label(tool).to_string(),
                config_exists,
                config_path,
                current_provider_is_codego: if matches!(*tool, "opencode" | "openclaw" | "hermes") {
                    provider_exists_in_live_config(&tool_to_app_type(tool)?, &codego_provider_id(tool))
                        .map_err(|e| e.to_string())?
                } else {
                    current_provider_id
                        .as_deref()
                        .is_some_and(|id| id == codego_provider_id(tool))
                },
                current_provider_id,
                current_provider_name,
                has_backup,
            })
        })
        .collect()
}

#[tauri::command]
pub async fn codego_get_tool_config_preview(
    tool: String,
) -> Result<CodeGoToolConfigPreview, String> {
    let auth = load_auth_state();
    if !auth.authenticated {
        return Err("Code Go is not authenticated".to_string());
    }

    let template = fetch_config_template(&auth, &tool).await?;
    let (full_key, _) = ensure_desktop_token(&auth).await?;
    let provider = build_provider_from_codego(&tool, &template, &full_key)?;
    let (_, config_path) = config_status_for_app(&tool)?;

    Ok(CodeGoToolConfigPreview {
        tool: tool.clone(),
        label: tool_label(&tool).to_string(),
        config_path,
        current_preview: live_preview_for_tool(&tool),
        next_preview: preview_string_for_tool(&tool, &provider.settings_config),
        endpoint: template
            .get("endpoint")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        provider_id: provider.id,
    })
}

#[tauri::command]
pub async fn codego_apply_tool_config(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    tool: String,
) -> Result<CodeGoToolConfigApplyResult, String> {
    let auth = load_auth_state();
    if !auth.authenticated {
        return Err("Code Go is not authenticated".to_string());
    }

    let template = fetch_config_template(&auth, &tool).await?;
    let (full_key, _) = ensure_desktop_token(&auth).await?;
    let provider = build_provider_from_codego(&tool, &template, &full_key)?;
    apply_provider_for_codego_tool(&app, state.inner(), &tool, provider)
}

#[tauri::command]
pub async fn codego_apply_tool_config_from_token(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    token_id: i64,
    tool: String,
) -> Result<CodeGoToolConfigApplyResult, String> {
    let auth = load_auth_state();
    if !auth.authenticated {
        return Err("Code Go is not authenticated".to_string());
    }

    let token_config = fetch_token_config(&auth, token_id).await?;
    let payload = token_config
        .tools
        .get(&tool)
        .ok_or_else(|| format!("token config missing tool {tool}"))?;
    let provider = build_provider_from_token_payload(payload)?;

    apply_provider_for_codego_tool(&app, state.inner(), &tool, provider)
}

#[tauri::command]
pub async fn codego_restore_tool_config(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    tool: String,
) -> Result<CodeGoToolRestoreResult, String> {
    let backup =
        load_tool_backup(&tool)?.ok_or_else(|| format!("no Code Go backup found for {tool}"))?;

    restore_live_snapshot(&backup.snapshot)?;

    if let Some(previous_provider_id) = backup.previous_provider_id.as_deref() {
        let app_type = tool_to_app_type(&tool)?;
        if state
            .db
            .get_provider_by_id(previous_provider_id, app_type.as_str())
            .map_err(|e| e.to_string())?
            .is_some()
        {
            crate::settings::set_current_provider(&app_type, Some(previous_provider_id))
                .map_err(|e| e.to_string())?;
            state
                .db
                .set_current_provider(app_type.as_str(), previous_provider_id)
                .map_err(|e| e.to_string())?;
        }
    }

    let _ = app.emit("codego-tool-config-updated", json!({ "tool": tool }));

    Ok(CodeGoToolRestoreResult {
        restored: true,
        backup_saved_at: Some(backup.saved_at),
    })
}

#[tauri::command]
pub async fn codego_test_tool_config(tool: String) -> Result<CodeGoToolConfigTestResult, String> {
    let auth = load_auth_state();
    let authenticated = auth.authenticated;
    let (config_exists, _) = config_status_for_app(&tool)?;
    let live_value = live_settings_value_for_tool(&tool)?;

    let live_endpoint = live_value
        .as_ref()
        .and_then(|value| extract_live_endpoint(&tool, value));
    let credential_present = live_value
        .as_ref()
        .is_some_and(|value| has_live_credential(&tool, value));

    let mut endpoint_matches = false;
    if authenticated {
        if let Ok(template) = fetch_config_template(&auth, &tool).await {
            endpoint_matches =
                live_endpoint.as_deref() == template.get("endpoint").and_then(Value::as_str);
        }
    }

    let summary_reachable = if authenticated {
        fetch_account_summary(&auth).await.is_ok()
    } else {
        false
    };
    let (connectivity_reachable, connectivity_error) = if config_exists && credential_present {
        match probe_live_model_endpoint(&tool, live_endpoint.as_deref(), live_value.as_ref()).await {
            Ok(result) => (result, None),
            Err(error) => (false, Some(error)),
        }
    } else {
        (false, None)
    };

    let message = if !authenticated {
        "Code Go account is not connected".to_string()
    } else if !config_exists {
        format!("{} config file was not found", tool_label(&tool))
    } else if !credential_present {
        "Configured file is missing the required API credential".to_string()
    } else if !endpoint_matches {
        "Configured endpoint does not match the current Code Go template".to_string()
    } else if !connectivity_reachable {
        connectivity_error.unwrap_or_else(|| {
            "Configured tool could not complete a low-cost model probe against the current endpoint"
                .to_string()
        })
    } else if !summary_reachable {
        "Code Go account check failed while testing the tool config".to_string()
    } else {
        format!(
            "{} is configured for the current Code Go endpoint",
            tool_label(&tool)
        )
    };

    Ok(CodeGoToolConfigTestResult {
        tool,
        config_exists,
        endpoint_matches,
        credential_present,
        authenticated,
        summary_reachable,
        connectivity_reachable,
        message,
    })
}

fn ensure_token_request_value(value: Value) -> Result<(String, String), String> {
    let full_key = value
        .get("full_key")
        .and_then(Value::as_str)
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| "Code Go desktop token is missing full_key".to_string())?
        .to_string();
    let token_name = value
        .get("token_name")
        .and_then(Value::as_str)
        .unwrap_or("Code Go Desktop - Default")
        .to_string();
    Ok((full_key, token_name))
}

async fn ensure_desktop_token(auth: &CodeGoAuthState) -> Result<(String, String), String> {
    let (client, server_address) = build_authed_client(auth)?;
    let payload = json!({
        "device_name": CODEGO_DESKTOP_TOKEN_DEVICE_NAME,
    });
    let value: Value = parse_response(
        client
            .post(build_url(&server_address, "/api/desktop/tokens/ensure"))
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("ensure token request failed: {e}"))?,
    )
    .await?;
    ensure_token_request_value(value)
}

async fn fetch_config_template(auth: &CodeGoAuthState, tool: &str) -> Result<Value, String> {
    let (client, server_address) = build_authed_client(auth)?;
    parse_response(
        client
            .get(build_url(&server_address, "/api/desktop/config/template"))
            .query(&[("tool", tool)])
            .send()
            .await
            .map_err(|e| format!("config template request failed: {e}"))?,
    )
    .await
}

async fn fetch_token_config(
    auth: &CodeGoAuthState,
    token_id: i64,
) -> Result<CodeGoTokenConfigResponse, String> {
    let (client, server_address) = build_authed_client(auth)?;
    parse_response(
        client
            .get(build_url(
                &server_address,
                &format!("/api/desktop/tokens/{token_id}/config"),
            ))
            .send()
            .await
            .map_err(|e| format!("token config request failed: {e}"))?,
    )
    .await
}

fn build_provider_from_codego(
    tool: &str,
    template: &Value,
    full_key: &str,
) -> Result<Provider, String> {
    let provider_id = codego_provider_id(tool);
    let endpoint = template
        .get("endpoint")
        .and_then(Value::as_str)
        .ok_or_else(|| "Code Go template missing endpoint".to_string())?;
    let server_address = template
        .get("server_address")
        .and_then(Value::as_str)
        .map(|value| value.to_string());

    let mut provider = match tool {
        "claude" => Provider::with_id(
            provider_id.clone(),
            "Code Go Claude".to_string(),
            json!({
                "env": {
                    "ANTHROPIC_BASE_URL": endpoint,
                    "ANTHROPIC_AUTH_TOKEN": full_key,
                }
            }),
            server_address,
        ),
        "gemini" => Provider::with_id(
            provider_id.clone(),
            "Code Go Gemini".to_string(),
            json!({
                "env": {
                    "GOOGLE_GEMINI_BASE_URL": endpoint,
                    "GEMINI_API_KEY": full_key,
                    "GEMINI_MODEL": "gemini-2.5-pro",
                }
            }),
            server_address,
        ),
        "codex" => Provider::with_id(
            provider_id.clone(),
            "Code Go Codex".to_string(),
            json!({
                "auth": {
                    "OPENAI_API_KEY": full_key,
                },
                "config": format!(
                    "model_provider = \"custom\"\nmodel = \"gpt-5.5\"\nmodel_reasoning_effort = \"high\"\ndisable_response_storage = true\n\n[model_providers.custom]\nname = \"Code Go\"\nbase_url = \"{endpoint}\"\nwire_api = \"responses\"\nrequires_openai_auth = true"
                ),
            }),
            server_address,
        ),
        "opencode" => Provider::with_id(
            provider_id.clone(),
            "Code Go OpenCode".to_string(),
            json!({
                "npm": "@ai-sdk/openai-compatible",
                "name": "Code Go OpenCode",
                "options": {
                    "baseURL": endpoint,
                    "apiKey": full_key,
                    "setCacheKey": true,
                },
                "models": {
                    "gpt-5.5": {
                        "name": "gpt-5.5",
                    }
                }
            }),
            server_address,
        ),
        "openclaw" => Provider::with_id(
            provider_id.clone(),
            "Code Go OpenClaw".to_string(),
            json!({
                "baseUrl": endpoint,
                "apiKey": full_key,
                "api": "openai-completions",
                "models": [
                    {
                        "id": "gpt-5.5",
                        "name": "gpt-5.5",
                    }
                ]
            }),
            server_address,
        ),
        "hermes" => Provider::with_id(
            provider_id.clone(),
            "Code Go Hermes".to_string(),
            json!({
                "name": "Code Go Hermes",
                "base_url": endpoint,
                "api_key": full_key,
                "api_mode": "chat_completions",
                "models": [
                    {
                        "id": "gpt-5.5",
                        "name": "gpt-5.5",
                    }
                ]
            }),
            server_address,
        ),
        _ => return Err(format!("unsupported Code Go tool: {tool}")),
    };
    provider.category = Some("custom".to_string());
    provider.icon = Some("newapi".to_string());
    provider.icon_color = Some(
        match tool {
            "claude" => "#E37A1F",
            "gemini" => "#4285F4",
            "codex" => "#0F172A",
            "opencode" => "#8B5CF6",
            "openclaw" => "#2563EB",
            "hermes" => "#14B8A6",
            _ => "#E37A1F",
        }
        .to_string(),
    );
    Ok(provider)
}

fn decode_token_config_json(payload: &CodeGoTokenToolConfigPayload) -> Result<Value, String> {
    let decoded = BASE64_STANDARD
        .decode(payload.config.as_bytes())
        .map_err(|e| format!("failed to decode token config for {}: {e}", payload.tool))?;
    let text = String::from_utf8(decoded)
        .map_err(|e| format!("invalid UTF-8 in token config for {}: {e}", payload.tool))?;
    serde_json::from_str(&text)
        .map_err(|e| format!("invalid JSON in token config for {}: {e}", payload.tool))
}

fn build_provider_from_token_payload(
    payload: &CodeGoTokenToolConfigPayload,
) -> Result<Provider, String> {
    let settings_config = match payload.tool.as_str() {
        "claude" | "codex" | "opencode" | "openclaw" | "hermes" => decode_token_config_json(payload)?,
        "gemini" => {
            let decoded = decode_token_config_json(payload)?;
            if decoded.get("env").is_some() {
                decoded
            } else {
                json!({ "env": decoded })
            }
        }
        _ => return Err(format!("unsupported Code Go tool: {}", payload.tool)),
    };

    let mut provider = Provider::with_id(
        codego_provider_id(&payload.tool),
        payload.name.clone(),
        settings_config,
        Some(payload.homepage.clone()).filter(|value| !value.trim().is_empty()),
    );
    provider.category = Some("custom".to_string());
    provider.icon = payload
        .icon
        .clone()
        .or_else(|| Some("newapi".to_string()));
    provider.icon_color = Some(
        match payload.tool.as_str() {
            "claude" => "#E37A1F",
            "gemini" => "#4285F4",
            "codex" => "#0F172A",
            "opencode" => "#8B5CF6",
            "openclaw" => "#2563EB",
            "hermes" => "#14B8A6",
            _ => "#E37A1F",
        }
        .to_string(),
    );
    provider.notes = payload
        .notes
        .clone()
        .filter(|value| !value.trim().is_empty());
    Ok(provider)
}

fn apply_provider_for_codego_tool(
    app: &tauri::AppHandle,
    state: &AppState,
    tool: &str,
    provider: Provider,
) -> Result<CodeGoToolConfigApplyResult, String> {
    let app_type = tool_to_app_type(tool)?;
    let previous_provider_id = crate::settings::get_effective_current_provider(&state.db, &app_type)
        .map_err(|e| e.to_string())?;

    let snapshot = capture_live_snapshot(tool)?;
    save_tool_backup(
        tool,
        &CodeGoSavedToolBackup {
            saved_at: iso_now_string(),
            previous_provider_id,
            snapshot,
        },
    )?;

    let exists = state
        .db
        .get_provider_by_id(&provider.id, app_type.as_str())
        .map_err(|e| e.to_string())?
        .is_some();

    if exists {
        ProviderService::update(state, app_type.clone(), Some(&provider.id), provider.clone())
            .map_err(|e| e.to_string())?;
    } else {
        ProviderService::add(state, app_type.clone(), provider.clone(), true)
            .map_err(|e| e.to_string())?;
    }

    ProviderService::switch(state, app_type, &provider.id).map_err(|e| e.to_string())?;

    let _ = app.emit(
        "codego-tool-config-updated",
        json!({ "tool": tool, "providerId": provider.id }),
    );

    Ok(CodeGoToolConfigApplyResult {
        tool: tool.to_string(),
        provider_id: provider.id,
        provider_name: provider.name,
        backup_saved: true,
    })
}

#[tauri::command]
pub async fn codego_get_auth_state() -> Result<CodeGoAuthState, String> {
    let mut state = load_auth_state();
    state.access_token = None;
    Ok(state)
}

#[tauri::command]
pub async fn codego_logout(app: tauri::AppHandle) -> Result<bool, String> {
    let auth = load_auth_state();
    if auth.authenticated {
        if let Some(device_id) = auth.device_id {
            if let Err(error) = revoke_authorized_device_remote(&auth, device_id).await {
                log::warn!("撤销 Code Go 桌面设备失败，将继续清理本地状态: {error}");
            }
        }
    }
    clear_auth_state()?;
    crate::tray::refresh_tray_menu(&app);
    Ok(true)
}

#[tauri::command]
pub async fn codego_start_auth_session(
    request: Option<CodeGoStartAuthRequest>,
) -> Result<CodeGoAuthSessionStartResponse, String> {
    let request = request.unwrap_or(CodeGoStartAuthRequest {
        server_address: None,
        device_name: None,
    });
    let server_address = normalize_server_address(request.server_address.as_deref());
    let client = build_public_client()?;
    let payload = json!({
        "device_name": desktop_device_name(request.device_name.as_deref()),
        "platform": current_platform_label(),
        "app_version": CODEGO_APP_VERSION,
    });

    parse_response(
        client
            .post(build_url(&server_address, "/api/desktop/auth/session"))
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("desktop auth session request failed: {e}"))?,
    )
    .await
}

#[tauri::command]
pub async fn codego_poll_auth_session(
    app: tauri::AppHandle,
    request: CodeGoAuthSessionStateRequest,
) -> Result<CodeGoAuthSessionPollResponse, String> {
    let server_address = normalize_server_address(request.server_address.as_deref());
    let client = build_public_client()?;
    let response: CodeGoAuthSessionPollResponse = parse_response(
        client
            .post(build_url(&server_address, "/api/desktop/auth/poll"))
            .json(&json!({ "session_id": request.session_id }))
            .send()
            .await
            .map_err(|e| format!("desktop auth poll request failed: {e}"))?,
    )
    .await?;

    if response.authenticated {
        let access_token = response
            .access_token
            .clone()
            .ok_or_else(|| "Code Go desktop auth completed without access token".to_string())?;
        let user_id = response
            .user_id
            .ok_or_else(|| "Code Go desktop auth completed without user id".to_string())?;
        let device_id = response
            .device_id
            .ok_or_else(|| "Code Go desktop auth completed without device id".to_string())?;
        let last_username = response
            .last_username
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| format!("user-{user_id}"));

        persist_auth_state(
            server_address.clone(),
            access_token,
            user_id,
            device_id,
            last_username,
        )?;
        let _ = maybe_send_codego_telemetry_event(
            "auth_connected",
            "desktop_auth",
            json!({
                "result": "approved",
                "platform": current_platform_label(),
            }),
        )
        .await;
        let _ = refresh_codego_account_summary(Some(&app), true).await;
    }

    Ok(CodeGoAuthSessionPollResponse {
        server_address: Some(server_address),
        access_token: None,
        ..response
    })
}

#[tauri::command]
pub async fn codego_get_account_summary(app: tauri::AppHandle) -> Result<Value, String> {
    if let Some(summary) = refresh_codego_account_summary(Some(&app), true).await? {
        return Ok(summary);
    }

    fetch_account_summary(&load_auth_state()).await
}

#[tauri::command]
pub async fn codego_list_authorized_devices() -> Result<Vec<CodeGoAuthorizedDevice>, String> {
    let auth = load_auth_state();
    let (client, server_address) = build_authed_client(&auth)?;
    parse_response(
        client
            .get(build_url(&server_address, "/api/desktop/devices"))
            .send()
            .await
            .map_err(|e| format!("authorized devices request failed: {e}"))?,
    )
    .await
}

#[tauri::command]
pub async fn codego_revoke_authorized_device(
    app: tauri::AppHandle,
    id: i64,
) -> Result<bool, String> {
    let auth = load_auth_state();
    let is_current_device = auth.device_id == Some(id);

    if let Err(error) = revoke_authorized_device_remote(&auth, id).await {
        if is_current_device {
            log::warn!("撤销当前 Code Go 桌面设备失败，将继续清理本地状态: {error}");
            clear_auth_state()?;
            crate::tray::refresh_tray_menu(&app);
            return Ok(true);
        }
        return Err(error);
    }

    if is_current_device {
        clear_auth_state()?;
        crate::tray::refresh_tray_menu(&app);
    }

    Ok(true)
}

#[tauri::command]
pub async fn codego_get_usage_trends(days: Option<u32>) -> Result<Value, String> {
    let auth = load_auth_state();
    let (client, server_address) = build_authed_client(&auth)?;
    let days = days.unwrap_or(7).clamp(7, 30);
    parse_response(
        client
            .get(build_url(&server_address, "/api/desktop/usage/trends"))
            .query(&[("days", days.to_string())])
            .send()
            .await
            .map_err(|e| format!("usage trends request failed: {e}"))?,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::{
        apply_account_summary_side_effects, apply_account_summary_side_effects_with_sink,
        build_model_probe, build_provider_from_codego, build_provider_from_token_payload,
        codego_balance_usd_from_summary, codego_provider_id, codego_tray_snapshot,
        extract_live_endpoint, has_live_credential, probe_response_matches_tool,
        should_send_low_balance_notification, summary_topup_url, BASE64_STANDARD,
        CodeGoSummarySideEffectSink,
        CodeGoTokenToolConfigPayload,
    };
    use base64::Engine;
    use crate::settings::{
        get_codego_last_seen_quota_usd, get_settings, update_settings, AppSettings,
    };
    use reqwest::header::AUTHORIZATION;
    use serde_json::json;
    use serial_test::serial;
    use std::sync::{Mutex, OnceLock};
    use tempfile::TempDir;

    struct TempSettingsEnv {
        _dir: TempDir,
        previous_cc_switch_test_home: Option<std::ffi::OsString>,
        previous_home: Option<std::ffi::OsString>,
        previous_userprofile: Option<std::ffi::OsString>,
        original_settings: AppSettings,
    }

    impl TempSettingsEnv {
        fn new() -> Self {
            let dir = TempDir::new().expect("create temp settings dir");
            let previous_cc_switch_test_home = std::env::var_os("CC_SWITCH_TEST_HOME");
            let previous_home = std::env::var_os("HOME");
            let previous_userprofile = std::env::var_os("USERPROFILE");
            let original_settings = get_settings();

            std::env::set_var("CC_SWITCH_TEST_HOME", dir.path());
            std::env::set_var("HOME", dir.path());
            std::env::set_var("USERPROFILE", dir.path());

            update_settings(AppSettings::default()).expect("reset temp settings");

            Self {
                _dir: dir,
                previous_cc_switch_test_home,
                previous_home,
                previous_userprofile,
                original_settings,
            }
        }
    }

    impl Drop for TempSettingsEnv {
        fn drop(&mut self) {
            update_settings(self.original_settings.clone()).expect("restore original settings");

            match &self.previous_cc_switch_test_home {
                Some(value) => std::env::set_var("CC_SWITCH_TEST_HOME", value),
                None => std::env::remove_var("CC_SWITCH_TEST_HOME"),
            }
            match &self.previous_home {
                Some(value) => std::env::set_var("HOME", value),
                None => std::env::remove_var("HOME"),
            }
            match &self.previous_userprofile {
                Some(value) => std::env::set_var("USERPROFILE", value),
                None => std::env::remove_var("USERPROFILE"),
            }
        }
    }

    fn settings_test_guard() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
            .lock()
            .unwrap_or_else(|error| error.into_inner())
    }

    #[derive(Debug, Clone, PartialEq)]
    struct RecordedLowBalanceNotification {
        quota_usd: f64,
        threshold_usd: f64,
        topup_url: String,
    }

    #[derive(Default)]
    struct RecordingSummarySideEffectSink {
        notifications: Mutex<Vec<RecordedLowBalanceNotification>>,
        emitted_summaries: Mutex<Vec<serde_json::Value>>,
        tray_refreshes: Mutex<usize>,
    }

    impl RecordingSummarySideEffectSink {
        fn notifications(&self) -> Vec<RecordedLowBalanceNotification> {
            self.notifications
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .clone()
        }

        fn emitted_summaries(&self) -> Vec<serde_json::Value> {
            self.emitted_summaries
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .clone()
        }

        fn tray_refreshes(&self) -> usize {
            *self
                .tray_refreshes
                .lock()
                .unwrap_or_else(|error| error.into_inner())
        }
    }

    impl CodeGoSummarySideEffectSink for RecordingSummarySideEffectSink {
        fn send_low_balance_notification(
            &self,
            quota_usd: f64,
            threshold_usd: f64,
            topup_url: &str,
        ) {
            self.notifications
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .push(RecordedLowBalanceNotification {
                    quota_usd,
                    threshold_usd,
                    topup_url: topup_url.to_string(),
                });
        }

        fn refresh_tray_menu(&self) {
            let mut refreshes = self
                .tray_refreshes
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            *refreshes += 1;
        }

        fn emit_summary_updated(&self, summary: &serde_json::Value) {
            self.emitted_summaries
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .push(summary.clone());
        }
    }

    #[test]
    fn low_balance_notification_triggers_on_first_snapshot_below_threshold() {
        assert!(should_send_low_balance_notification(None, 8.0, 10.0));
    }

    #[test]
    fn low_balance_notification_triggers_when_crossing_threshold() {
        assert!(should_send_low_balance_notification(Some(12.0), 9.5, 10.0));
    }

    #[test]
    fn low_balance_notification_does_not_repeat_while_remaining_below_threshold() {
        assert!(!should_send_low_balance_notification(Some(9.0), 8.5, 10.0));
    }

    #[test]
    fn low_balance_notification_does_not_trigger_above_threshold() {
        assert!(!should_send_low_balance_notification(
            Some(15.0),
            11.0,
            10.0
        ));
    }

    #[test]
    fn balance_from_summary_accepts_non_negative_numbers() {
        let summary = json!({
            "account": {
                "quota_usd": 12.5
            }
        });

        assert_eq!(codego_balance_usd_from_summary(&summary), Some(12.5));
    }

    #[test]
    fn balance_from_summary_rejects_negative_or_invalid_values() {
        let negative = json!({
            "account": {
                "quota_usd": -1
            }
        });
        let string_value = json!({
            "account": {
                "quota_usd": "12.5"
            }
        });

        assert_eq!(codego_balance_usd_from_summary(&negative), None);
        assert_eq!(codego_balance_usd_from_summary(&string_value), None);
        assert_eq!(codego_balance_usd_from_summary(&json!({})), None);
    }

    #[test]
    fn summary_topup_url_prefers_absolute_action_link() {
        let summary = json!({
            "actions": {
                "topup_link": "https://billing.example.com/recharge"
            }
        });

        assert_eq!(
            summary_topup_url(&summary, "https://shu26.cfd"),
            "https://billing.example.com/recharge"
        );
    }

    #[test]
    fn summary_topup_url_resolves_relative_action_link() {
        let summary = json!({
            "actions": {
                "topup_link": "/billing/topup"
            }
        });

        assert_eq!(
            summary_topup_url(&summary, "https://shu26.cfd"),
            "https://shu26.cfd/billing/topup"
        );
    }

    #[test]
    fn summary_topup_url_falls_back_to_default_topup_path() {
        assert_eq!(
            summary_topup_url(&json!({}), "https://shu26.cfd"),
            "https://shu26.cfd/topup"
        );
    }

    #[test]
    fn additive_tool_live_endpoint_and_credential_detection_works() {
        let opencode = json!({
            "options": {
                "baseURL": "https://shu26.cfd/v1",
                "apiKey": "sk-opencode",
            }
        });
        let openclaw = json!({
            "baseUrl": "https://shu26.cfd/v1",
            "apiKey": "sk-openclaw",
        });
        let hermes = json!({
            "base_url": "https://shu26.cfd/v1",
            "api_key": "sk-hermes",
        });
        let hermes_missing_credential = json!({
            "base_url": "https://shu26.cfd/v1",
            "api_key": "   ",
        });

        assert_eq!(
            extract_live_endpoint("opencode", &opencode).as_deref(),
            Some("https://shu26.cfd/v1")
        );
        assert_eq!(
            extract_live_endpoint("openclaw", &openclaw).as_deref(),
            Some("https://shu26.cfd/v1")
        );
        assert_eq!(
            extract_live_endpoint("hermes", &hermes).as_deref(),
            Some("https://shu26.cfd/v1")
        );

        assert!(has_live_credential("opencode", &opencode));
        assert!(has_live_credential("openclaw", &openclaw));
        assert!(has_live_credential("hermes", &hermes));
        assert!(!has_live_credential("hermes", &hermes_missing_credential));
    }

    #[test]
    fn build_model_probe_uses_claude_headers_and_models_path() {
        let value = json!({
            "env": {
                "ANTHROPIC_BASE_URL": "https://shu26.cfd",
                "ANTHROPIC_AUTH_TOKEN": "cg_claude_key",
            }
        });

        let probe = build_model_probe("claude", "https://shu26.cfd", &value)
            .expect("claude probe")
            .expect("claude probe payload");

        assert_eq!(probe.url, "https://shu26.cfd/v1/models");
        assert_eq!(
            probe
                .headers
                .get("x-api-key")
                .and_then(|value| value.to_str().ok()),
            Some("cg_claude_key")
        );
        assert_eq!(
            probe
                .headers
                .get("anthropic-version")
                .and_then(|value| value.to_str().ok()),
            Some("2023-06-01")
        );
    }

    #[test]
    fn build_model_probe_uses_gemini_headers_and_models_path() {
        let value = json!({
            "env": {
                "GOOGLE_GEMINI_BASE_URL": "https://shu26.cfd",
                "GEMINI_API_KEY": "cg_gemini_key",
            }
        });

        let probe = build_model_probe("gemini", "https://shu26.cfd", &value)
            .expect("gemini probe")
            .expect("gemini probe payload");

        assert_eq!(probe.url, "https://shu26.cfd/v1beta/models");
        assert_eq!(
            probe
                .headers
                .get("x-goog-api-key")
                .and_then(|value| value.to_str().ok()),
            Some("cg_gemini_key")
        );
    }

    #[test]
    fn build_model_probe_uses_bearer_auth_for_openai_compatible_tools() {
        let value = json!({
            "options": {
                "baseURL": "https://shu26.cfd/v1",
                "apiKey": "cg_opencode_key",
            }
        });

        let probe = build_model_probe("opencode", "https://shu26.cfd/v1", &value)
            .expect("opencode probe")
            .expect("opencode probe payload");

        assert_eq!(probe.url, "https://shu26.cfd/v1/models");
        assert_eq!(
            probe
                .headers
                .get(AUTHORIZATION)
                .and_then(|value| value.to_str().ok()),
            Some("Bearer cg_opencode_key")
        );
    }

    #[test]
    fn probe_response_matcher_accepts_expected_payload_shapes() {
        assert!(probe_response_matches_tool(
            "claude",
            &json!({ "data": [{ "id": "claude-sonnet-4" }] })
        ));
        assert!(probe_response_matches_tool(
            "gemini",
            &json!({ "models": [{ "name": "gemini-2.5-pro" }] })
        ));
        assert!(probe_response_matches_tool(
            "codex",
            &json!({ "object": "list", "data": [{ "id": "gpt-5.5" }] })
        ));
        assert!(!probe_response_matches_tool(
            "gemini",
            &json!({ "data": [{ "id": "wrong-shape" }] })
        ));
    }

    #[test]
    fn build_provider_from_codego_supports_openclaw_and_hermes() {
        let template = json!({
            "endpoint": "https://shu26.cfd/v1",
            "server_address": "https://shu26.cfd",
        });

        let openclaw =
            build_provider_from_codego("openclaw", &template, "sk-openclaw").expect("openclaw");
        assert_eq!(openclaw.id, codego_provider_id("openclaw"));
        assert_eq!(openclaw.name, "Code Go OpenClaw");
        assert_eq!(openclaw.website_url.as_deref(), Some("https://shu26.cfd"));
        assert_eq!(openclaw.icon_color.as_deref(), Some("#2563EB"));
        assert_eq!(
            openclaw
                .settings_config
                .get("baseUrl")
                .and_then(serde_json::Value::as_str),
            Some("https://shu26.cfd/v1")
        );
        assert_eq!(
            openclaw
                .settings_config
                .get("apiKey")
                .and_then(serde_json::Value::as_str),
            Some("sk-openclaw")
        );

        let hermes =
            build_provider_from_codego("hermes", &template, "sk-hermes").expect("hermes");
        assert_eq!(hermes.id, codego_provider_id("hermes"));
        assert_eq!(hermes.name, "Code Go Hermes");
        assert_eq!(hermes.website_url.as_deref(), Some("https://shu26.cfd"));
        assert_eq!(hermes.icon_color.as_deref(), Some("#14B8A6"));
        assert_eq!(
            hermes
                .settings_config
                .get("base_url")
                .and_then(serde_json::Value::as_str),
            Some("https://shu26.cfd/v1")
        );
        assert_eq!(
            hermes
                .settings_config
                .get("api_key")
                .and_then(serde_json::Value::as_str),
            Some("sk-hermes")
        );
    }

    #[test]
    fn build_provider_from_token_payload_decodes_openclaw_and_hermes_json() {
        let openclaw_payload = CodeGoTokenToolConfigPayload {
            tool: "openclaw".to_string(),
            name: "Code Go OpenClaw".to_string(),
            homepage: "https://shu26.cfd".to_string(),
            endpoint: "https://shu26.cfd/v1".to_string(),
            api_key: "masked".to_string(),
            model: None,
            haiku_model: None,
            sonnet_model: None,
            opus_model: None,
            enabled: true,
            config: BASE64_STANDARD.encode(
                br#"{"baseUrl":"https://shu26.cfd/v1","apiKey":"sk-openclaw","api":"openai-completions"}"#,
            ),
            config_format: "json".to_string(),
            icon: None,
            notes: Some("test".to_string()),
        };
        let hermes_payload = CodeGoTokenToolConfigPayload {
            tool: "hermes".to_string(),
            name: "Code Go Hermes".to_string(),
            homepage: "https://shu26.cfd".to_string(),
            endpoint: "https://shu26.cfd/v1".to_string(),
            api_key: "masked".to_string(),
            model: None,
            haiku_model: None,
            sonnet_model: None,
            opus_model: None,
            enabled: true,
            config: BASE64_STANDARD.encode(
                br#"{"name":"Code Go Hermes","base_url":"https://shu26.cfd/v1","api_key":"sk-hermes","api_mode":"chat_completions"}"#,
            ),
            config_format: "json".to_string(),
            icon: Some("newapi".to_string()),
            notes: None,
        };

        let openclaw =
            build_provider_from_token_payload(&openclaw_payload).expect("openclaw payload");
        assert_eq!(openclaw.id, codego_provider_id("openclaw"));
        assert_eq!(
            openclaw
                .settings_config
                .get("apiKey")
                .and_then(serde_json::Value::as_str),
            Some("sk-openclaw")
        );
        assert_eq!(openclaw.notes.as_deref(), Some("test"));

        let hermes = build_provider_from_token_payload(&hermes_payload).expect("hermes payload");
        assert_eq!(hermes.id, codego_provider_id("hermes"));
        assert_eq!(
            hermes
                .settings_config
                .get("api_key")
                .and_then(serde_json::Value::as_str),
            Some("sk-hermes")
        );
        assert_eq!(hermes.icon.as_deref(), Some("newapi"));
    }

    #[test]
    #[serial]
    fn tray_snapshot_returns_none_when_disabled() {
        let _guard = settings_test_guard();
        let _env = TempSettingsEnv::new();
        let mut settings = AppSettings::default();
        settings.codego_tray_enabled = false;
        update_settings(settings).expect("persist test settings");

        assert!(codego_tray_snapshot().is_none());
    }

    #[test]
    #[serial]
    fn tray_snapshot_marks_low_balance_and_normalizes_urls() {
        let _guard = settings_test_guard();
        let _env = TempSettingsEnv::new();
        let mut settings = AppSettings::default();
        settings.codego_tray_enabled = true;
        settings.codego_server_address = Some("shu26.cfd/".to_string());
        settings.codego_last_username = Some("desk-user".to_string());
        settings.codego_low_balance_threshold_usd = 10.0;
        settings.codego_last_seen_quota_usd = Some(3.25);
        settings.codego_user_id = Some(42);
        update_settings(settings).expect("persist test settings");

        let snapshot = codego_tray_snapshot().expect("tray snapshot");
        assert!(!snapshot.authenticated);
        assert_eq!(snapshot.last_username.as_deref(), Some("desk-user"));
        assert_eq!(snapshot.quota_usd, Some(3.25));
        assert_eq!(snapshot.low_balance_threshold_usd, 10.0);
        assert!(snapshot.low_balance);
        assert_eq!(snapshot.server_address, "https://shu26.cfd");
        assert_eq!(snapshot.topup_url, "https://shu26.cfd/topup");
    }

    #[test]
    #[serial]
    fn apply_account_summary_side_effects_updates_cached_quota_without_app_handle() {
        let _guard = settings_test_guard();
        let _env = TempSettingsEnv::new();

        let summary = json!({
            "account": {
                "quota_usd": 18.75
            }
        });

        apply_account_summary_side_effects(None, &summary).expect("apply summary side effects");

        assert_eq!(get_codego_last_seen_quota_usd(), Some(18.75));
    }

    #[test]
    #[serial]
    fn apply_account_summary_side_effects_clears_invalid_cached_quota_without_app_handle() {
        let _guard = settings_test_guard();
        let _env = TempSettingsEnv::new();
        let mut settings = AppSettings::default();
        settings.codego_last_seen_quota_usd = Some(9.5);
        update_settings(settings).expect("persist initial quota");

        let summary = json!({
            "account": {
                "quota_usd": -3
            }
        });

        apply_account_summary_side_effects(None, &summary).expect("apply summary side effects");

        assert_eq!(get_codego_last_seen_quota_usd(), None);
    }

    #[test]
    #[serial]
    fn apply_account_summary_side_effects_records_notification_refresh_and_emit_with_sink() {
        let _guard = settings_test_guard();
        let _env = TempSettingsEnv::new();
        let mut settings = AppSettings::default();
        settings.codego_last_seen_quota_usd = Some(15.0);
        settings.codego_low_balance_threshold_usd = 10.0;
        settings.codego_low_balance_notifications_enabled = true;
        settings.codego_server_address = Some("shu26.cfd/".to_string());
        update_settings(settings).expect("persist initial settings");

        let summary = json!({
            "account": {
                "quota_usd": 8.25
            },
            "actions": {
                "topup_link": "/billing/topup"
            }
        });
        let sink = RecordingSummarySideEffectSink::default();

        apply_account_summary_side_effects_with_sink(Some(&sink), &summary)
            .expect("apply summary side effects");

        assert_eq!(get_codego_last_seen_quota_usd(), Some(8.25));
        assert_eq!(
            sink.notifications(),
            vec![RecordedLowBalanceNotification {
                quota_usd: 8.25,
                threshold_usd: 10.0,
                topup_url: "https://shu26.cfd/billing/topup".to_string(),
            }]
        );
        assert_eq!(sink.tray_refreshes(), 1);
        assert_eq!(sink.emitted_summaries(), vec![summary]);
    }

    #[test]
    #[serial]
    fn apply_account_summary_side_effects_still_refreshes_and_emits_when_notifications_disabled() {
        let _guard = settings_test_guard();
        let _env = TempSettingsEnv::new();
        let mut settings = AppSettings::default();
        settings.codego_last_seen_quota_usd = Some(14.0);
        settings.codego_low_balance_threshold_usd = 10.0;
        settings.codego_low_balance_notifications_enabled = false;
        update_settings(settings).expect("persist initial settings");

        let summary = json!({
            "account": {
                "quota_usd": 6.5
            }
        });
        let sink = RecordingSummarySideEffectSink::default();

        apply_account_summary_side_effects_with_sink(Some(&sink), &summary)
            .expect("apply summary side effects");

        assert!(sink.notifications().is_empty());
        assert_eq!(sink.tray_refreshes(), 1);
        assert_eq!(sink.emitted_summaries(), vec![summary]);
    }
}

#[tauri::command]
pub async fn codego_get_tokens(query: Option<CodeGoPageQuery>) -> Result<Value, String> {
    let auth = load_auth_state();
    let (client, server_address) = build_authed_client(&auth)?;
    let query = query.unwrap_or(CodeGoPageQuery {
        p: None,
        page: None,
        size: None,
        page_size: None,
    });

    parse_response(
        client
            .get(build_url(&server_address, "/api/token/"))
            .query(&[
                ("p", page_query_value(&query).to_string()),
                ("size", page_query_size(&query).to_string()),
            ])
            .send()
            .await
            .map_err(|e| format!("token list request failed: {e}"))?,
    )
    .await
}

#[tauri::command]
pub async fn codego_get_token_key(id: i64) -> Result<Value, String> {
    let auth = load_auth_state();
    let (client, server_address) = build_authed_client(&auth)?;
    parse_response(
        client
            .post(build_url(&server_address, &format!("/api/token/{id}/key")))
            .send()
            .await
            .map_err(|e| format!("token key request failed: {e}"))?,
    )
    .await
}

#[tauri::command]
pub async fn codego_create_token(
    app: tauri::AppHandle,
    request: CodeGoTokenWriteRequest,
) -> Result<bool, String> {
    let auth = load_auth_state();
    let (client, server_address) = build_authed_client(&auth)?;
    let payload = serde_json::json!({
        "name": request.name,
        "expired_time": request.expired_time,
        "remain_quota": request.remain_quota,
        "unlimited_quota": request.unlimited_quota,
        "group": request.group,
        "model_limits_enabled": request.model_limits_enabled,
        "model_limits": request.model_limits,
    });

    parse_empty_response(
        client
            .post(build_url(&server_address, "/api/token/"))
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("create token request failed: {e}"))?,
    )
    .await?;

    let _ = app.emit(
        "codego-tokens-updated",
        serde_json::json!({ "action": "create" }),
    );
    Ok(true)
}

#[tauri::command]
pub async fn codego_update_token(
    app: tauri::AppHandle,
    request: CodeGoTokenWriteRequest,
) -> Result<Value, String> {
    let auth = load_auth_state();
    let (client, server_address) = build_authed_client(&auth)?;
    let id = request
        .id
        .ok_or_else(|| "token id is required".to_string())?;
    let payload = serde_json::json!({
        "id": id,
        "name": request.name,
        "expired_time": request.expired_time,
        "remain_quota": request.remain_quota,
        "unlimited_quota": request.unlimited_quota,
        "group": request.group,
        "model_limits_enabled": request.model_limits_enabled,
        "model_limits": request.model_limits,
    });

    let response: Value = parse_response(
        client
            .put(build_url(&server_address, "/api/token/"))
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("update token request failed: {e}"))?,
    )
    .await?;

    let _ = app.emit(
        "codego-tokens-updated",
        serde_json::json!({ "action": "update", "id": id }),
    );
    Ok(response)
}

#[tauri::command]
pub async fn codego_delete_token(app: tauri::AppHandle, id: i64) -> Result<bool, String> {
    let auth = load_auth_state();
    let (client, server_address) = build_authed_client(&auth)?;
    parse_empty_response(
        client
            .delete(build_url(&server_address, &format!("/api/token/{id}")))
            .send()
            .await
            .map_err(|e| format!("delete token request failed: {e}"))?,
    )
    .await?;

    let _ = app.emit(
        "codego-tokens-updated",
        serde_json::json!({ "action": "delete", "id": id }),
    );
    Ok(true)
}

#[tauri::command]
pub async fn codego_get_usage_logs(query: Option<CodeGoUsageLogsQuery>) -> Result<Value, String> {
    let auth = load_auth_state();
    let (client, server_address) = build_authed_client(&auth)?;
    let query = query.unwrap_or(CodeGoUsageLogsQuery {
        p: None,
        page: None,
        size: None,
        page_size: None,
        r#type: None,
        start_timestamp: None,
        end_timestamp: None,
        token_name: None,
        model_name: None,
        group: None,
        request_id: None,
        upstream_request_id: None,
    });

    let mut request = client
        .get(build_url(&server_address, "/api/desktop/usage/logs"))
        .query(&[
            ("p", page_value(&query).to_string()),
            ("size", page_size_value(&query).to_string()),
        ]);

    if let Some(value) = query.r#type {
        request = request.query(&[("type", value.to_string())]);
    }
    if let Some(value) = query.start_timestamp {
        request = request.query(&[("start_timestamp", value.to_string())]);
    }
    if let Some(value) = query.end_timestamp {
        request = request.query(&[("end_timestamp", value.to_string())]);
    }
    if let Some(value) = query.token_name.filter(|v| !v.trim().is_empty()) {
        request = request.query(&[("token_name", value)]);
    }
    if let Some(value) = query.model_name.filter(|v| !v.trim().is_empty()) {
        request = request.query(&[("model_name", value)]);
    }
    if let Some(value) = query.group.filter(|v| !v.trim().is_empty()) {
        request = request.query(&[("group", value)]);
    }
    if let Some(value) = query.request_id.filter(|v| !v.trim().is_empty()) {
        request = request.query(&[("request_id", value)]);
    }
    if let Some(value) = query.upstream_request_id.filter(|v| !v.trim().is_empty()) {
        request = request.query(&[("upstream_request_id", value)]);
    }

    parse_response(
        request
            .send()
            .await
            .map_err(|e| format!("usage log request failed: {e}"))?,
    )
    .await
}

#[tauri::command]
pub async fn codego_ensure_token(
    request: Option<CodeGoEnsureTokenRequest>,
) -> Result<Value, String> {
    let auth = load_auth_state();
    let (client, server_address) = build_authed_client(&auth)?;
    let payload = serde_json::json!({
        "device_name": request
            .and_then(|r| r.device_name)
            .unwrap_or_else(|| "Desktop".to_string()),
    });

    parse_response(
        client
            .post(build_url(&server_address, "/api/desktop/tokens/ensure"))
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("ensure token request failed: {e}"))?,
    )
    .await
}

#[tauri::command]
pub async fn codego_get_config_template(tool: String) -> Result<Value, String> {
    let auth = load_auth_state();
    let (client, server_address) = build_authed_client(&auth)?;
    parse_response(
        client
            .get(build_url(&server_address, "/api/desktop/config/template"))
            .query(&[("tool", tool)])
            .send()
            .await
            .map_err(|e| format!("config template request failed: {e}"))?,
    )
    .await
}

#[tauri::command]
pub async fn codego_get_config_templates() -> Result<Value, String> {
    let auth = load_auth_state();
    let (client, server_address) = build_authed_client(&auth)?;
    parse_response(
        client
            .get(build_url(&server_address, "/api/desktop/config/templates"))
            .send()
            .await
            .map_err(|e| format!("config templates request failed: {e}"))?,
    )
    .await
}

#[tauri::command]
pub async fn codego_get_service_status() -> Result<Value, String> {
    let auth = load_auth_state();
    let (client, server_address) = build_authed_client(&auth)?;
    parse_response(
        client
            .get(build_url(&server_address, "/api/desktop/service/status"))
            .send()
            .await
            .map_err(|e| format!("service status request failed: {e}"))?,
    )
    .await
}
