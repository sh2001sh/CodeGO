fn command_targets_codego(command: &str) -> bool {
    let command = command.trim();
    let executable = if let Some(quoted) = command.strip_prefix('"') {
        quoted.split('"').next().unwrap_or_default()
    } else {
        command.split_whitespace().next().unwrap_or_default()
    };

    executable
        .rsplit(['\\', '/'])
        .next()
        .is_some_and(|name| name.eq_ignore_ascii_case("codego.exe"))
}

/// Removes the protocol registration left by CodeGo versions that claimed
/// `ccswitch://`. Registrations owned by the official CC Switch app are kept.
#[cfg(target_os = "windows")]
pub(crate) enum LegacyRegistrationMigration {
    NotNeeded,
    Removed,
    Restored(std::path::PathBuf),
}

#[cfg(target_os = "windows")]
fn find_official_cc_switch_executable() -> Option<std::path::PathBuf> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    const UNINSTALL_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall";
    for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        let Ok(uninstall) = RegKey::predef(root).open_subkey_with_flags(UNINSTALL_KEY, KEY_READ)
        else {
            continue;
        };
        for name in uninstall.enum_keys().flatten() {
            let Ok(app) = uninstall.open_subkey_with_flags(name, KEY_READ) else {
                continue;
            };
            let display_name = app
                .get_value::<String, _>("DisplayName")
                .unwrap_or_default();
            if !display_name.eq_ignore_ascii_case("CC Switch") {
                continue;
            }
            let install_location = app
                .get_value::<String, _>("InstallLocation")
                .unwrap_or_default();
            for executable in ["CC-Switch.exe", "cc-switch.exe"] {
                let candidate = std::path::Path::new(&install_location).join(executable);
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }
    None
}

/// Releases `ccswitch://` registrations left by old CodeGo versions. When the
/// official CC Switch installation is discoverable, ownership is restored to it.
#[cfg(target_os = "windows")]
pub(crate) fn migrate_legacy_ccswitch_registration(
) -> Result<LegacyRegistrationMigration, std::io::Error> {
    use std::io::ErrorKind;
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
    use winreg::RegKey;

    const PROTOCOL_KEY: &str = r"Software\Classes\ccswitch";
    const COMMAND_KEY: &str = r"Software\Classes\ccswitch\shell\open\command";

    let current_user = RegKey::predef(HKEY_CURRENT_USER);
    let command = match current_user.open_subkey_with_flags(COMMAND_KEY, KEY_READ) {
        Ok(key) => key.get_value::<String, _>("")?,
        Err(error) if error.kind() == ErrorKind::NotFound => {
            return Ok(LegacyRegistrationMigration::NotNeeded)
        }
        Err(error) => return Err(error),
    };

    if !command_targets_codego(&command) {
        return Ok(LegacyRegistrationMigration::NotNeeded);
    }

    current_user.delete_subkey_all(PROTOCOL_KEY)?;
    let Some(executable) = find_official_cc_switch_executable() else {
        return Ok(LegacyRegistrationMigration::Removed);
    };

    let (protocol, _) = current_user.create_subkey(PROTOCOL_KEY)?;
    protocol.set_value("", &"URL:CC Switch protocol")?;
    protocol.set_value("URL Protocol", &"")?;
    let (open_command, _) = current_user.create_subkey(COMMAND_KEY)?;
    open_command.set_value("", &format!(r#""{}" "%1""#, executable.display()))?;

    Ok(LegacyRegistrationMigration::Restored(executable))
}

#[cfg(test)]
mod tests {
    use super::command_targets_codego;

    #[test]
    fn identifies_legacy_codego_protocol_commands() {
        assert!(command_targets_codego(
            r#""D:\Program Files (x86)\CodeGo\codego.exe" "%1""#
        ));
        assert!(command_targets_codego(
            r#"D:\PROGRA~3\CodeGo\codego.exe "%1""#
        ));
    }

    #[test]
    fn preserves_official_cc_switch_protocol_commands() {
        assert!(!command_targets_codego(
            r#""D:\Program Files\cc-switch\CC-Switch.exe" "%1""#
        ));
        assert!(!command_targets_codego(""));
    }
}
