use keyring::Entry;
use std::sync::{Mutex, OnceLock};

const CODEGO_SERVICE_NAME: &str = "cc-switch.codego";
const CODEGO_TOKEN_ACCOUNT: &str = "access-token";

#[cfg(test)]
#[derive(Default)]
struct TestCodeGoAuthStore {
    override_active: bool,
    token: Option<String>,
}

#[cfg(test)]
fn test_codego_auth_store() -> &'static Mutex<TestCodeGoAuthStore> {
    static STORE: OnceLock<Mutex<TestCodeGoAuthStore>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(TestCodeGoAuthStore::default()))
}

#[cfg(test)]
pub(crate) fn set_test_codego_auth_token(token: Option<String>) {
    let mut store = test_codego_auth_store()
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    store.override_active = true;
    store.token = token;
}

fn codego_token_entry() -> Result<Entry, String> {
    Entry::new(CODEGO_SERVICE_NAME, CODEGO_TOKEN_ACCOUNT)
        .map_err(|error| format!("failed to initialize secure store entry: {error}"))
}

fn is_missing_secret_error(error: &keyring::Error) -> bool {
    let message = error.to_string().to_ascii_lowercase();
    message.contains("no entry")
        || message.contains("credential not found")
        || message.contains("element not found")
        || message.contains("cannot find the item")
}

pub fn load_codego_auth() -> Result<Option<String>, String> {
    #[cfg(test)]
    {
        let store = test_codego_auth_store()
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if store.override_active {
            return Ok(store.token.clone());
        }
    }

    let entry = codego_token_entry()?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(error) if is_missing_secret_error(&error) => Ok(None),
        Err(error) => Err(format!("failed to load Code Go credential: {error}")),
    }
}

pub fn save_codego_auth(access_token: &str) -> Result<(), String> {
    #[cfg(test)]
    {
        let mut store = test_codego_auth_store()
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if store.override_active {
            store.token = Some(access_token.to_string());
            return Ok(());
        }
    }

    let entry = codego_token_entry()?;
    entry
        .set_password(access_token)
        .map_err(|error| format!("failed to save Code Go credential: {error}"))
}

pub fn clear_codego_auth() -> Result<(), String> {
    #[cfg(test)]
    {
        let mut store = test_codego_auth_store()
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if store.override_active {
            store.token = None;
            return Ok(());
        }
    }

    let entry = codego_token_entry()?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(error) if is_missing_secret_error(&error) => Ok(()),
        Err(error) => Err(format!("failed to clear Code Go credential: {error}")),
    }
}
