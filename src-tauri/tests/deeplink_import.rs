use std::sync::Arc;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use codego_lib::{
    import_provider_from_deeplink, parse_deeplink_url, AppState, Database, DeepLinkImportRequest,
};

#[path = "support.rs"]
mod support;
use support::{ensure_test_home, reset_test_fs, test_mutex};

#[test]
fn website_ccswitch_contract_uses_official_direct_parameters() {
    let url = "ccswitch://v1/import?resource=provider&app=codex&name=CodeGo&endpoint=https%3A%2F%2Fshu26.cfd%2Fv1&homepage=https%3A%2F%2Fshu26.cfd&enabled=true&icon=codego&apiKey=sk-contract&model=gpt-5.6-luna";
    let request = parse_deeplink_url(url).expect("parse website CC Switch link");

    assert_eq!(request.resource, "provider");
    assert_eq!(request.app.as_deref(), Some("codex"));
    assert_eq!(request.model.as_deref(), Some("gpt-5.6-luna"));
    assert_eq!(request.endpoint.as_deref(), Some("https://shu26.cfd/v1"));
    assert_eq!(request.api_key.as_deref(), Some("sk-contract"));
    assert!(
        request.config.is_none(),
        "API key config must not be embedded in the URL"
    );
    assert!(
        request.config_url.is_none(),
        "official CC Switch does not support remote config URLs"
    );
    assert!(request.codego_action.is_none());
    assert!(request.token_id.is_none());
}

#[test]
fn codego_registers_only_its_owned_protocol() {
    let config: serde_json::Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).expect("parse tauri config");
    let schemes = config
        .pointer("/plugins/deep-link/desktop/schemes")
        .and_then(|value| value.as_array())
        .expect("deep-link schemes");

    assert_eq!(schemes, &[serde_json::Value::String("codego".to_string())]);

    let macos_plist = include_str!("../Info.plist");
    assert!(macos_plist.contains("<string>codego</string>"));
    assert!(!macos_plist.contains("<string>ccswitch</string>"));
}

#[test]
fn codego_codex_config_contract_imports_after_config_resolution() {
    let _guard = test_mutex().lock().expect("acquire test mutex");
    reset_test_fs();
    let _home = ensure_test_home();

    let config = r#"{"auth":{"OPENAI_API_KEY":"sk-contract"},"config":"model_provider = \"custom\"\nmodel = \"gpt-5.6-luna\"\n\n[model_providers.custom]\nname = \"Code Go\"\nbase_url = \"https://shu26.cfd/v1\"\nwire_api = \"responses\"\nrequires_openai_auth = true\n"}"#;
    let request = DeepLinkImportRequest {
        version: "v1".to_string(),
        resource: "provider".to_string(),
        app: Some("codex".to_string()),
        name: Some("CodeGo contract".to_string()),
        config: Some(STANDARD.encode(config)),
        config_format: Some("json".to_string()),
        ..Default::default()
    };

    let db = Arc::new(Database::memory().expect("create memory db"));
    let state = AppState::new(db.clone());
    let provider_id = import_provider_from_deeplink(&state, request)
        .expect("import new-api Codex config contract");
    let providers = db.get_all_providers("codex").expect("get providers");
    let provider = providers.get(&provider_id).expect("provider created");

    assert_eq!(
        provider
            .settings_config
            .pointer("/auth/OPENAI_API_KEY")
            .and_then(|value| value.as_str()),
        Some("sk-contract")
    );
    let config_text = provider
        .settings_config
        .get("config")
        .and_then(|value| value.as_str())
        .expect("Codex config text");
    assert!(config_text.contains("https://shu26.cfd/v1"));
    assert!(config_text.contains("gpt-5.6-luna"));
}

#[test]
fn deeplink_import_claude_provider_persists_to_db() {
    let _guard = test_mutex().lock().expect("acquire test mutex");
    reset_test_fs();
    let _home = ensure_test_home();

    let url = "ccswitch://v1/import?resource=provider&app=claude&name=DeepLink%20Claude&homepage=https%3A%2F%2Fexample.com&endpoint=https%3A%2F%2Fapi.example.com%2Fv1&apiKey=sk-test-claude-key&model=claude-sonnet-4&icon=claude";
    let request = parse_deeplink_url(url).expect("parse deeplink url");

    let db = Arc::new(Database::memory().expect("create memory db"));
    let state = AppState::new(db.clone());

    let provider_id = import_provider_from_deeplink(&state, request.clone())
        .expect("import provider from deeplink");

    // Verify DB state
    let providers = db.get_all_providers("claude").expect("get providers");
    let provider = providers
        .get(&provider_id)
        .expect("provider created via deeplink");

    assert_eq!(provider.name, request.name.clone().unwrap());
    assert_eq!(provider.website_url.as_deref(), request.homepage.as_deref());
    assert_eq!(provider.icon.as_deref(), Some("claude"));
    let auth_token = provider
        .settings_config
        .pointer("/env/ANTHROPIC_AUTH_TOKEN")
        .and_then(|v| v.as_str());
    let base_url = provider
        .settings_config
        .pointer("/env/ANTHROPIC_BASE_URL")
        .and_then(|v| v.as_str());
    assert_eq!(auth_token, request.api_key.as_deref());
    assert_eq!(base_url, request.endpoint.as_deref());
}
#[test]
fn deeplink_import_codex_provider_builds_auth_and_config() {
    let _guard = test_mutex().lock().expect("acquire test mutex");
    reset_test_fs();
    let _home = ensure_test_home();

    let url = "ccswitch://v1/import?resource=provider&app=codex&name=DeepLink%20Codex&homepage=https%3A%2F%2Fopenai.example&endpoint=https%3A%2F%2Fapi.openai.example%2Fv1&apiKey=sk-test-codex-key&model=gpt-4o&icon=openai";
    let request = parse_deeplink_url(url).expect("parse deeplink url");

    let db = Arc::new(Database::memory().expect("create memory db"));
    let state = AppState::new(db.clone());

    let provider_id = import_provider_from_deeplink(&state, request.clone())
        .expect("import provider from deeplink");

    let providers = db.get_all_providers("codex").expect("get providers");
    let provider = providers
        .get(&provider_id)
        .expect("provider created via deeplink");

    assert_eq!(provider.name, request.name.clone().unwrap());
    assert_eq!(provider.website_url.as_deref(), request.homepage.as_deref());
    assert_eq!(provider.icon.as_deref(), Some("openai"));
    let auth_value = provider
        .settings_config
        .pointer("/auth/OPENAI_API_KEY")
        .and_then(|v| v.as_str());
    let config_text = provider
        .settings_config
        .get("config")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    assert_eq!(auth_value, request.api_key.as_deref());
    assert!(
        config_text.contains(request.endpoint.as_deref().unwrap()),
        "config.toml content should contain endpoint"
    );
    assert!(
        config_text.contains("model = \"gpt-4o\""),
        "config.toml content should contain model setting"
    );
}
