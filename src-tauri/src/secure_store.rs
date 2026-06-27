use keyring::Entry;

const CODEGO_SERVICE_NAME: &str = "cc-switch.codego";
const CODEGO_TOKEN_ACCOUNT: &str = "access-token";

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
    let entry = codego_token_entry()?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(error) if is_missing_secret_error(&error) => Ok(None),
        Err(error) => Err(format!("failed to load Code Go credential: {error}")),
    }
}

pub fn save_codego_auth(access_token: &str) -> Result<(), String> {
    let entry = codego_token_entry()?;
    entry
        .set_password(access_token)
        .map_err(|error| format!("failed to save Code Go credential: {error}"))
}

pub fn clear_codego_auth() -> Result<(), String> {
    let entry = codego_token_entry()?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(error) if is_missing_secret_error(&error) => Ok(()),
        Err(error) => Err(format!("failed to clear Code Go credential: {error}")),
    }
}
