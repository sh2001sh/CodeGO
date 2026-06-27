use super::codego::{build_authed_client, build_url, load_auth_state, parse_empty_response};
use crate::settings::get_settings;
use serde::Serialize;
use serde_json::Value;

const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CodeGoTelemetryEventRequest {
    event_name: String,
    source: String,
    payload: Value,
    app_version: String,
    platform: String,
    locale: String,
    consent: bool,
}

pub(crate) fn current_platform_label() -> String {
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

pub(crate) async fn maybe_send_codego_telemetry_event(
    event_name: &str,
    source: &str,
    payload: Value,
) -> Result<(), String> {
    let settings = get_settings();
    if !settings.codego_telemetry_enabled {
        return Ok(());
    }

    let auth = load_auth_state();
    if !auth.authenticated {
        return Ok(());
    }

    let locale = settings.language.unwrap_or_else(|| "zh".to_string());
    let (client, server_address) = build_authed_client(&auth)?;
    parse_empty_response(
        client
            .post(build_url(&server_address, "/api/desktop/telemetry/events"))
            .json(&CodeGoTelemetryEventRequest {
                event_name: event_name.to_string(),
                source: source.to_string(),
                payload,
                app_version: APP_VERSION.to_string(),
                platform: current_platform_label(),
                locale,
                consent: true,
            })
            .send()
            .await
            .map_err(|e| format!("telemetry request failed: {e}"))?,
    )
    .await
}
