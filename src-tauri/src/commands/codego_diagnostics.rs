use super::codego::{build_authed_client, build_url, load_auth_state, parse_response};
use super::codego_telemetry::maybe_send_codego_telemetry_event;
use crate::panic_hook::get_crash_log_path;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::time::UNIX_EPOCH;

const DIAGNOSTIC_PREVIEW_LIMIT: usize = 6000;
const DIAGNOSTIC_NOTE_LIMIT: usize = 1500;
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

static BEARER_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)bearer\s+[A-Za-z0-9._-]+").expect("valid bearer regex"));
static AUTH_HEADER_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?im)(authorization\s*[:=]\s*)([^\s"']+)"#).expect("valid auth header regex")
});
static API_KEY_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?im)((?:api[_ -]?key|access[_ -]?token)\s*[:=]\s*["']?)([^"'\s,;]+)"#)
        .expect("valid api key regex")
});
static OPENAI_KEY_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\bsk-[A-Za-z0-9_-]{12,}\b").expect("valid openai key regex"));
static WINDOWS_PATH_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"[A-Za-z]:\\(?:[^\\\r\n\t ]+\\)*[^\\\r\n\t ]*").expect("valid windows path regex")
});
static MAC_HOME_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"/Users/[^/\s]+(?:/[^\s]*)?").expect("valid mac home path regex"));
static LINUX_HOME_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"/home/[^/\s]+(?:/[^\s]*)?").expect("valid linux home path regex"));
static MESSAGE_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?m)^Message:\s*(.+)$").expect("valid message regex"));

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeGoDiagnosticPreview {
    pub has_report: bool,
    pub report_type: String,
    pub source: String,
    pub summary: String,
    pub preview: String,
    pub generated_at: Option<i64>,
    pub redactions_applied: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeGoSubmitDiagnosticReportRequest {
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeGoSubmitDiagnosticReportResponse {
    pub id: i64,
    pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteDiagnosticReportRequest {
    report_type: String,
    source: String,
    summary: String,
    payload: String,
    app_version: String,
    platform: String,
    locale: String,
    consent: bool,
}

fn current_platform_label() -> String {
    if cfg!(target_os = "windows") {
        "windows".to_string()
    } else if cfg!(target_os = "macos") {
        "macos".to_string()
    } else if cfg!(target_os = "linux") {
        "linux".to_string()
    } else {
        std::env::consts::OS.to_string()
    }
}

fn latest_crash_report(contents: &str) -> Option<&str> {
    let marker = "[CRASH REPORT]";
    contents
        .rfind(marker)
        .map(|index| contents[index..].trim())
        .filter(|value| !value.is_empty())
}

fn sanitize_diagnostic_text(raw: &str, limit: usize) -> (String, Vec<String>) {
    let mut value = raw.trim().replace("\r\n", "\n");
    if value.is_empty() {
        return (String::new(), Vec::new());
    }

    let mut redactions = Vec::new();
    let mut apply = |regex: &Regex, replacement: &str, label: &str, input: String| -> String {
        if regex.is_match(&input) {
            if !redactions.iter().any(|item| item == label) {
                redactions.push(label.to_string());
            }
            regex.replace_all(&input, replacement).into_owned()
        } else {
            input
        }
    };

    value = apply(&BEARER_RE, "Bearer [REDACTED]", "authorization", value);
    value = apply(&AUTH_HEADER_RE, "${1}[REDACTED]", "authorization", value);
    value = apply(&API_KEY_RE, "${1}[REDACTED]", "token", value);
    value = apply(&OPENAI_KEY_RE, "[REDACTED_API_KEY]", "token", value);
    value = apply(&WINDOWS_PATH_RE, "[REDACTED_PATH]", "path", value);
    value = apply(&MAC_HOME_RE, "[REDACTED_PATH]", "path", value);
    value = apply(&LINUX_HOME_RE, "[REDACTED_PATH]", "path", value);

    if value.len() > limit {
        value.truncate(limit);
        value.push_str("\n[TRUNCATED]");
    }

    (value, redactions)
}

fn build_diagnostic_preview() -> Result<CodeGoDiagnosticPreview, String> {
    let crash_log_path = get_crash_log_path();
    if !crash_log_path.exists() {
        return Ok(CodeGoDiagnosticPreview {
            has_report: false,
            report_type: "crash".to_string(),
            source: "panic_hook".to_string(),
            summary: String::new(),
            preview: String::new(),
            generated_at: None,
            redactions_applied: Vec::new(),
        });
    }

    let raw = fs::read_to_string(&crash_log_path)
        .map_err(|e| format!("failed to read crash log: {e}"))?;
    let latest = latest_crash_report(&raw).unwrap_or(raw.trim());
    let (preview, redactions_applied) = sanitize_diagnostic_text(latest, DIAGNOSTIC_PREVIEW_LIMIT);
    let summary = MESSAGE_RE
        .captures(&preview)
        .and_then(|captures| captures.get(1))
        .map(|capture| capture.as_str().trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "Latest crash report".to_string());

    let generated_at = fs::metadata(&crash_log_path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs() as i64);

    Ok(CodeGoDiagnosticPreview {
        has_report: !preview.is_empty(),
        report_type: "crash".to_string(),
        source: "panic_hook".to_string(),
        summary,
        preview,
        generated_at,
        redactions_applied,
    })
}

#[tauri::command]
pub async fn codego_get_diagnostic_preview() -> Result<CodeGoDiagnosticPreview, String> {
    build_diagnostic_preview()
}

#[tauri::command]
pub async fn codego_submit_diagnostic_report(
    request: Option<CodeGoSubmitDiagnosticReportRequest>,
) -> Result<CodeGoSubmitDiagnosticReportResponse, String> {
    let preview = build_diagnostic_preview()?;
    if !preview.has_report {
        return Err("No crash report is available on this device".to_string());
    }

    let auth = load_auth_state();
    let (client, server_address) = build_authed_client(&auth)?;
    let locale = crate::settings::get_settings()
        .language
        .unwrap_or_else(|| "zh".to_string());

    let note = request
        .and_then(|payload| payload.note)
        .map(|value| sanitize_diagnostic_text(&value, DIAGNOSTIC_NOTE_LIMIT).0)
        .filter(|value| !value.is_empty());
    let has_note = note.is_some();

    let payload = if let Some(note) = note {
        format!("{}\n\nUser note:\n{}", preview.preview, note)
    } else {
        preview.preview.clone()
    };

    let response: CodeGoSubmitDiagnosticReportResponse = parse_response(
        client
            .post(build_url(
                &server_address,
                "/api/desktop/diagnostics/report",
            ))
            .json(&RemoteDiagnosticReportRequest {
                report_type: preview.report_type,
                source: preview.source,
                summary: preview.summary,
                payload,
                app_version: APP_VERSION.to_string(),
                platform: current_platform_label(),
                locale,
                consent: true,
            })
            .send()
            .await
            .map_err(|e| format!("diagnostic report request failed: {e}"))?,
    )
    .await?;

    let _ = maybe_send_codego_telemetry_event(
        "diagnostic_report_submitted",
        "diagnostics",
        serde_json::json!({
            "reportType": "crash",
            "hasNote": has_note,
        }),
    )
    .await;

    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_diagnostic_text_redacts_tokens_and_paths() {
        let (value, redactions) = sanitize_diagnostic_text(
            "Authorization: Bearer secret-token\napi_key=sk-secret-123456789012\nC:\\Users\\alice\\repo\n/Users/alice/project",
            400,
        );

        assert!(!value.contains("secret-token"));
        assert!(!value.contains("sk-secret-123456789012"));
        assert!(!value.contains("alice"));
        assert!(value.contains("[REDACTED]"));
        assert!(value.contains("[REDACTED_PATH]"));
        assert!(redactions.iter().any(|item| item == "authorization"));
        assert!(redactions.iter().any(|item| item == "token"));
        assert!(redactions.iter().any(|item| item == "path"));
    }

    #[test]
    fn latest_crash_report_returns_last_entry() {
        let raw = "\n[CRASH REPORT] old\nMessage: first\n\n[CRASH REPORT] new\nMessage: second";
        let latest = latest_crash_report(raw).expect("latest crash report should exist");
        assert!(latest.contains("Message: second"));
        assert!(!latest.contains("Message: first"));
    }
}
