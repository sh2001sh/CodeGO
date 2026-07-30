use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};

use crate::error::AppError;

pub const APP_CONFIG_DIR_NAME: &str = ".codego";
pub const DATABASE_FILE_NAME: &str = "codego.db";

const LEGACY_APP_CONFIG_DIR_NAMES: &[&str] = &[".cc-switch", ".ccswitch"];
const DATABASE_FILE_NAMES: &[&str] = &[DATABASE_FILE_NAME, "cc-switch.db", "ccswitch.db"];

/// 获取用户主目录，带回退和日志
///
/// ## Windows 注意事项
///
/// - `dirs::home_dir()` 在 Windows 上使用 `SHGetKnownFolderPath(FOLDERID_Profile)`，
///   返回的是真实用户目录（类似 `C:\\Users\\Alice`），与 v3.10.2 行为一致。
/// - 不要直接使用 `HOME` 环境变量：它可能由 Git/Cygwin/MSYS 等第三方工具注入，
///   且不一定等于用户目录，可能导致应用数据路径变化，从而“看起来像数据丢失”。
///
/// ## 测试隔离
///
/// 为了让 Windows CI/本地测试能稳定隔离真实用户数据，可通过 `CC_SWITCH_TEST_HOME`
/// 显式覆盖 home dir（仅用于测试/调试场景）。
pub fn get_home_dir() -> PathBuf {
    if let Ok(home) = std::env::var("CC_SWITCH_TEST_HOME") {
        let trimmed = home.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }

    dirs::home_dir().unwrap_or_else(|| {
        log::warn!("无法获取用户主目录，回退到当前目录");
        PathBuf::from(".")
    })
}

/// 获取 Claude Code 配置目录路径
pub fn get_claude_config_dir() -> PathBuf {
    if let Some(custom) = crate::settings::get_claude_override_dir() {
        return custom;
    }

    get_home_dir().join(".claude")
}

/// 默认 Claude MCP 配置文件路径 (~/.claude.json)
pub fn get_default_claude_mcp_path() -> PathBuf {
    get_home_dir().join(".claude.json")
}

fn normalize_path_lexically(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();

    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                if !normalized.pop() {
                    normalized.push(component.as_os_str());
                }
            }
            Component::Normal(part) => normalized.push(part),
            Component::RootDir | Component::Prefix(_) => normalized.push(component.as_os_str()),
        }
    }

    normalized
}

fn comparable_path_key(path: &Path) -> String {
    let mut key = normalize_path_lexically(path).to_string_lossy().to_string();

    #[cfg(windows)]
    {
        key = key.replace('\\', "/");
    }

    while key.len() > 1 && key.ends_with('/') {
        key.pop();
    }

    #[cfg(windows)]
    {
        key.make_ascii_lowercase();
    }

    key
}

fn path_eq_lexical(left: &Path, right: &Path) -> bool {
    comparable_path_key(left) == comparable_path_key(right)
}

fn read_database_user_version(path: &Path) -> Result<i32, AppError> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| AppError::Database(format!("打开数据库失败: {e}")))?;
    conn.query_row("PRAGMA user_version;", [], |row| row.get(0))
        .map_err(|e| AppError::Database(format!("读取 user_version 失败: {e}")))
}

/// 判断数据库是否可以作为 CodeGo 的旧数据库迁入。
///
/// CC Switch 与 CodeGo 共享过历史数据目录，但两者的 Schema 版本可能不同。
/// 旧版数据库只有在版本不高于当前 CodeGo 支持版本时才可以安全迁移；更高版本
/// 必须保留在原处，避免旧应用对未知表结构执行写操作。
fn is_database_supported(path: &Path) -> bool {
    match read_database_user_version(path) {
        Ok(version) if version <= crate::database::SCHEMA_VERSION => true,
        Ok(version) => {
            log::warn!(
                "跳过迁移数据库 {}：版本 v{version} 高于 CodeGo 支持的 v{}，保留原文件",
                path.display(),
                crate::database::SCHEMA_VERSION
            );
            false
        }
        Err(error) => {
            log::warn!(
                "跳过迁移数据库 {}：无法读取数据库版本：{error}",
                path.display()
            );
            false
        }
    }
}

fn unsupported_database_backup_path(path: &Path, version: i32, index: usize) -> PathBuf {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(DATABASE_FILE_NAME);
    let suffix = if index == 0 {
        String::new()
    } else {
        format!(".{index}")
    };
    path.with_file_name(format!("{file_name}.unsupported-v{version}{suffix}"))
}

fn restore_database_sidecars(moved: &[(PathBuf, PathBuf)]) {
    for (source, backup) in moved.iter().rev() {
        if let Err(error) = fs::rename(backup, source) {
            log::error!(
                "恢复数据库辅助文件失败 ({} -> {}): {error}",
                backup.display(),
                source.display()
            );
        }
    }
}

/// 将旧版本迁移逻辑遗留的未来版本 CodeGo 数据库移出活动路径。
///
/// 这一步只在当前规范数据库 `codego.db` 上执行。数据库及其 WAL/SHM 文件会
/// 一起改名保留，随后由正常初始化流程创建新的 CodeGo 数据库。
fn isolate_unsupported_database(dir: &Path) -> Result<bool, AppError> {
    let db_path = dir.join(DATABASE_FILE_NAME);
    if !db_path.exists() {
        return Ok(false);
    }

    let Ok(version) = read_database_user_version(&db_path) else {
        return Ok(false);
    };
    if version <= crate::database::SCHEMA_VERSION {
        return Ok(false);
    }

    let backup_path = (0..)
        .map(|index| unsupported_database_backup_path(&db_path, version, index))
        .find(|path| {
            !path.exists()
                && !PathBuf::from(format!("{}-wal", path.display())).exists()
                && !PathBuf::from(format!("{}-shm", path.display())).exists()
        })
        .expect("infinite backup path sequence should contain an unused path");

    let mut moved_sidecars = Vec::new();
    for suffix in ["-wal", "-shm"] {
        let source = PathBuf::from(format!("{}{}", db_path.display(), suffix));
        if !source.exists() {
            continue;
        }

        let backup = PathBuf::from(format!("{}{}", backup_path.display(), suffix));
        if let Err(error) = fs::rename(&source, &backup) {
            restore_database_sidecars(&moved_sidecars);
            return Err(AppError::IoContext {
                context: format!(
                    "隔离不兼容数据库辅助文件失败 ({} -> {})",
                    source.display(),
                    backup.display()
                ),
                source: error,
            });
        }
        moved_sidecars.push((source, backup));
    }

    if let Err(error) = fs::rename(&db_path, &backup_path) {
        restore_database_sidecars(&moved_sidecars);
        return Err(AppError::IoContext {
            context: format!(
                "隔离不兼容数据库失败 ({} -> {})",
                db_path.display(),
                backup_path.display()
            ),
            source: error,
        });
    }

    log::warn!(
        "检测到 CodeGo 数据库版本 v{version} 高于支持版本 v{}，已保留备份 {}",
        crate::database::SCHEMA_VERSION,
        backup_path.display()
    );
    Ok(true)
}

#[cfg(windows)]
fn derive_wsl_default_mcp_path(dir: &Path) -> Option<PathBuf> {
    use std::path::Prefix;

    let normalized = normalize_path_lexically(dir);
    let mut components = normalized.components();
    let prefix = match components.next()? {
        Component::Prefix(prefix) => prefix,
        _ => return None,
    };

    let server = match prefix.kind() {
        Prefix::UNC(server, _) | Prefix::VerbatimUNC(server, _) => server.to_string_lossy(),
        _ => return None,
    };

    if !server.eq_ignore_ascii_case("wsl$") && !server.eq_ignore_ascii_case("wsl.localhost") {
        return None;
    }

    let mut parts = Vec::new();
    for component in components {
        match component {
            Component::RootDir | Component::CurDir => {}
            Component::Normal(part) => parts.push(part.to_string_lossy().to_string()),
            Component::ParentDir | Component::Prefix(_) => return None,
        }
    }

    let is_wsl_home_default =
        parts.len() == 3 && parts[0] == "home" && !parts[1].is_empty() && parts[2] == ".claude";
    let is_wsl_root_default = parts.len() == 2 && parts[0] == "root" && parts[1] == ".claude";

    if is_wsl_home_default || is_wsl_root_default {
        return normalized
            .parent()
            .map(|parent| parent.join(".claude.json"));
    }

    None
}

fn default_mcp_path_for_config_dir(dir: &Path) -> Option<PathBuf> {
    let default_config_dir = get_home_dir().join(".claude");
    if path_eq_lexical(dir, &default_config_dir) {
        return Some(get_default_claude_mcp_path());
    }

    #[cfg(windows)]
    {
        if let Some(path) = derive_wsl_default_mcp_path(dir) {
            return Some(path);
        }
    }

    None
}

fn derive_mcp_path_from_override(dir: &Path) -> PathBuf {
    dir.join(".claude.json")
}

/// 获取 Claude MCP 配置文件路径
pub fn get_claude_mcp_path() -> PathBuf {
    if let Some(custom_dir) = crate::settings::get_claude_override_dir() {
        if let Some(path) = default_mcp_path_for_config_dir(&custom_dir) {
            return path;
        }
        return derive_mcp_path_from_override(&custom_dir);
    }
    get_default_claude_mcp_path()
}

/// 获取 Claude Code 主配置文件路径
pub fn get_claude_settings_path() -> PathBuf {
    let dir = get_claude_config_dir();
    let settings = dir.join("settings.json");
    if settings.exists() {
        return settings;
    }
    // 兼容旧版命名：若存在旧文件则继续使用
    let legacy = dir.join("claude.json");
    if legacy.exists() {
        return legacy;
    }
    // 默认新建：回落到标准文件名 settings.json（不再生成 claude.json）
    settings
}

/// 获取 CodeGo 应用配置目录路径 (`~/.codego`)
pub fn get_app_config_dir() -> PathBuf {
    if let Some(custom) = crate::app_store::get_app_config_dir_override() {
        return custom;
    }

    get_home_dir().join(APP_CONFIG_DIR_NAME)
}

fn database_path_in(dir: &Path) -> PathBuf {
    let canonical = dir.join(DATABASE_FILE_NAME);
    if canonical.exists() {
        return canonical;
    }

    DATABASE_FILE_NAMES
        .iter()
        .skip(1)
        .map(|name| dir.join(name))
        .find(|path| path.exists() && is_database_supported(path))
        .unwrap_or(canonical)
}

/// 获取当前使用的数据库路径。
///
/// 新安装使用 `~/.codego/codego.db`。仅当同目录下的旧数据库版本仍受支持时，
/// 才回退读取 `cc-switch.db` / `ccswitch.db`；更高版本会被忽略并创建独立数据库。
pub fn get_database_path() -> PathBuf {
    database_path_in(&get_app_config_dir())
}

fn is_database_artifact(name: &str) -> bool {
    DATABASE_FILE_NAMES
        .iter()
        .any(|base| name == *base || name == format!("{base}-wal") || name == format!("{base}-shm"))
}

fn copy_missing_tree(source: &Path, destination: &Path) -> Result<bool, AppError> {
    fs::create_dir_all(destination).map_err(|e| AppError::io(destination, e))?;
    let mut copied = false;

    for entry in fs::read_dir(source).map_err(|e| AppError::io(source, e))? {
        let entry = entry.map_err(|e| AppError::io(source, e))?;
        let source_path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|e| AppError::io(&source_path, e))?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if is_database_artifact(&name_str) {
            continue;
        }

        let destination_path = destination.join(&name);
        if file_type.is_dir() {
            copied |= copy_missing_tree(&source_path, &destination_path)?;
        } else if file_type.is_file() && !destination_path.exists() {
            fs::copy(&source_path, &destination_path).map_err(|e| AppError::IoContext {
                context: format!(
                    "复制旧版 CodeGo 配置失败 ({} -> {})",
                    source_path.display(),
                    destination_path.display()
                ),
                source: e,
            })?;
            copied = true;
        }
    }

    Ok(copied)
}

fn copy_legacy_database(source: &Path, destination: &Path) -> Result<bool, AppError> {
    let destination_db = destination.join(DATABASE_FILE_NAME);
    if destination_db.exists() {
        return Ok(false);
    }

    let source_db = DATABASE_FILE_NAMES
        .iter()
        .map(|name| source.join(name))
        .find(|path| path.exists());
    let Some(source_db) = source_db else {
        return Ok(false);
    };

    if !is_database_supported(&source_db) {
        return Ok(false);
    }

    fs::copy(&source_db, &destination_db).map_err(|e| AppError::IoContext {
        context: format!(
            "复制旧版 CodeGo 数据库失败 ({} -> {})",
            source_db.display(),
            destination_db.display()
        ),
        source: e,
    })?;

    for suffix in ["-wal", "-shm"] {
        let source_sidecar = PathBuf::from(format!("{}{}", source_db.display(), suffix));
        if source_sidecar.exists() {
            let destination_sidecar =
                PathBuf::from(format!("{}{}", destination_db.display(), suffix));
            fs::copy(&source_sidecar, &destination_sidecar).map_err(|e| AppError::IoContext {
                context: format!(
                    "复制旧版 CodeGo 数据库辅助文件失败 ({} -> {})",
                    source_sidecar.display(),
                    destination_sidecar.display()
                ),
                source: e,
            })?;
        }
    }

    Ok(true)
}

fn migrate_legacy_directory(source: &Path, destination: &Path) -> Result<bool, AppError> {
    if !source.is_dir() {
        return Ok(false);
    }

    let copied_files = copy_missing_tree(source, destination)?;
    let copied_database = copy_legacy_database(source, destination)?;
    Ok(copied_files || copied_database)
}

/// 将旧版 `~/.cc-switch` 或 `~/.ccswitch` 内容复制到 `~/.codego`。
///
/// 迁移只补齐目标目录中不存在的文件，旧目录始终保留；受支持的旧数据库会
/// 改名为 `codego.db`，未来版本数据库则保留为独立备份。
pub fn migrate_legacy_app_data() -> Result<bool, AppError> {
    let destination = get_app_config_dir();
    let mut migrated = isolate_unsupported_database(&destination)?;

    if crate::app_store::get_app_config_dir_override().is_some() {
        return Ok(migrated);
    }

    let home = get_home_dir();
    let legacy_dirs = LEGACY_APP_CONFIG_DIR_NAMES
        .iter()
        .map(|name| home.join(name))
        .collect::<Vec<_>>();

    #[cfg(windows)]
    let legacy_dirs = {
        let mut legacy_dirs = legacy_dirs;
        if let Ok(home_env) = std::env::var("HOME") {
            let trimmed = home_env.trim();
            if !trimmed.is_empty() {
                let env_home = PathBuf::from(trimmed);
                for name in LEGACY_APP_CONFIG_DIR_NAMES {
                    let candidate = env_home.join(name);
                    if !legacy_dirs.iter().any(|path| path == &candidate) {
                        legacy_dirs.push(candidate);
                    }
                }
            }
        }
        legacy_dirs
    };

    if destination.is_dir() {
        migrated |= copy_legacy_database(&destination, &destination)?;
    }

    for source in legacy_dirs {
        migrated |= migrate_legacy_directory(&source, &destination)?;
    }

    Ok(migrated)
}

/// 获取应用配置文件路径
pub fn get_app_config_path() -> PathBuf {
    get_app_config_dir().join("config.json")
}

/// 清理供应商名称，确保文件名安全
#[allow(dead_code)]
pub fn sanitize_provider_name(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            _ => c,
        })
        .collect::<String>()
        .to_lowercase()
}

/// 获取供应商配置文件路径
#[allow(dead_code)]
pub fn get_provider_config_path(provider_id: &str, provider_name: Option<&str>) -> PathBuf {
    let base_name = provider_name
        .map(sanitize_provider_name)
        .unwrap_or_else(|| sanitize_provider_name(provider_id));

    get_claude_config_dir().join(format!("settings-{base_name}.json"))
}

/// 读取 JSON 配置文件
pub fn read_json_file<T: for<'a> Deserialize<'a>>(path: &Path) -> Result<T, AppError> {
    if !path.exists() {
        return Err(AppError::Config(format!("文件不存在: {}", path.display())));
    }

    let content = fs::read_to_string(path).map_err(|e| AppError::io(path, e))?;

    serde_json::from_str(&content).map_err(|e| AppError::json(path, e))
}

/// 递归排序 JSON 对象的键（按字母顺序），确保序列化输出是确定性的
fn sort_json_keys(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut sorted_map = Map::new();
            let mut keys: Vec<_> = map.keys().collect();
            keys.sort();
            for key in keys {
                sorted_map.insert(key.clone(), sort_json_keys(&map[key]));
            }
            Value::Object(sorted_map)
        }
        Value::Array(arr) => Value::Array(arr.iter().map(sort_json_keys).collect()),
        other => other.clone(),
    }
}

/// 写入 JSON 配置文件（键按字母排序，确保确定性输出）
pub fn write_json_file<T: Serialize>(path: &Path, data: &T) -> Result<(), AppError> {
    // 确保目录存在
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| AppError::io(parent, e))?;
    }

    let value = serde_json::to_value(data).map_err(|e| AppError::JsonSerialize { source: e })?;
    let sorted_value = sort_json_keys(&value);
    let json = serde_json::to_string_pretty(&sorted_value)
        .map_err(|e| AppError::JsonSerialize { source: e })?;

    atomic_write(path, json.as_bytes())
}

/// 原子写入文本文件（用于 TOML/纯文本）
pub fn write_text_file(path: &Path, data: &str) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| AppError::io(parent, e))?;
    }
    atomic_write(path, data.as_bytes())
}

/// 原子写入：写入临时文件后 rename 替换，避免半写状态
pub fn atomic_write(path: &Path, data: &[u8]) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| AppError::io(parent, e))?;
    }

    let parent = path
        .parent()
        .ok_or_else(|| AppError::Config("无效的路径".to_string()))?;
    let mut tmp = parent.to_path_buf();
    let file_name = path
        .file_name()
        .ok_or_else(|| AppError::Config("无效的文件名".to_string()))?
        .to_string_lossy()
        .to_string();
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    tmp.push(format!("{file_name}.tmp.{ts}"));

    {
        let mut f = fs::File::create(&tmp).map_err(|e| AppError::io(&tmp, e))?;
        f.write_all(data).map_err(|e| AppError::io(&tmp, e))?;
        f.flush().map_err(|e| AppError::io(&tmp, e))?;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = fs::metadata(path) {
            let perm = meta.permissions().mode();
            let _ = fs::set_permissions(&tmp, fs::Permissions::from_mode(perm));
        }
    }

    #[cfg(windows)]
    {
        // Windows 上 rename 目标存在会失败，先移除再重命名（尽量接近原子性）
        if path.exists() {
            let _ = fs::remove_file(path);
        }
        fs::rename(&tmp, path).map_err(|e| AppError::IoContext {
            context: format!("原子替换失败: {} -> {}", tmp.display(), path.display()),
            source: e,
        })?;
    }

    #[cfg(not(windows))]
    {
        fs::rename(&tmp, path).map_err(|e| AppError::IoContext {
            context: format!("原子替换失败: {} -> {}", tmp.display(), path.display()),
            source: e,
        })?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_mcp_path_from_override_uses_config_dir_for_custom_path() {
        let override_dir = PathBuf::from("/tmp/profile/.claude");
        let derived = derive_mcp_path_from_override(&override_dir);
        assert_eq!(derived, PathBuf::from("/tmp/profile/.claude/.claude.json"));
    }

    #[test]
    fn derive_mcp_path_from_override_uses_config_dir_for_non_hidden_folder() {
        let override_dir = PathBuf::from("/data/claude-config");
        let derived = derive_mcp_path_from_override(&override_dir);
        assert_eq!(derived, PathBuf::from("/data/claude-config/.claude.json"));
    }

    #[test]
    fn derive_mcp_path_from_override_supports_relative_rootless_dir() {
        let override_dir = PathBuf::from("claude");
        let derived = derive_mcp_path_from_override(&override_dir);
        assert_eq!(derived, PathBuf::from("claude/.claude.json"));
    }

    #[test]
    fn derive_mcp_path_from_root_like_dir_uses_root_file() {
        let override_dir = PathBuf::from("/");
        let derived = derive_mcp_path_from_override(&override_dir);
        assert_eq!(derived, PathBuf::from("/.claude.json"));
    }

    #[test]
    fn derive_mcp_path_from_override_preserves_leading_parent_dirs() {
        let override_dir = PathBuf::from("../../profiles/work/.claude");
        let derived = derive_mcp_path_from_override(&override_dir);
        assert_eq!(derived, override_dir.join(".claude.json"));
    }

    #[cfg(windows)]
    #[test]
    fn wsl_unc_home_default_uses_split_mcp_path() {
        let override_dir = PathBuf::from(r"\\wsl$\Ubuntu\home\travis\.claude");
        let derived = default_mcp_path_for_config_dir(&override_dir)
            .expect("WSL home default should use split MCP path");
        assert_eq!(
            derived,
            PathBuf::from(r"\\wsl$\Ubuntu\home\travis\.claude.json")
        );
    }

    #[cfg(windows)]
    #[test]
    fn wsl_unc_root_default_uses_split_mcp_path() {
        let override_dir = PathBuf::from(r"\\wsl.localhost\Ubuntu\root\.claude");
        let derived = default_mcp_path_for_config_dir(&override_dir)
            .expect("WSL root default should use split MCP path");
        assert_eq!(
            derived,
            PathBuf::from(r"\\wsl.localhost\Ubuntu\root\.claude.json")
        );
    }

    #[cfg(windows)]
    #[test]
    fn wsl_unc_custom_dir_uses_nested_mcp_path() {
        let override_dir = PathBuf::from(r"\\wsl$\Ubuntu\opt\claude\.claude");
        assert!(default_mcp_path_for_config_dir(&override_dir).is_none());
        assert_eq!(
            derive_mcp_path_from_override(&override_dir),
            PathBuf::from(r"\\wsl$\Ubuntu\opt\claude\.claude\.claude.json")
        );
    }

    #[test]
    fn sort_json_keys_sorts_top_level_object() {
        let input = serde_json::json!({
            "z": 1,
            "a": 2,
            "m": 3,
        });
        let sorted = sort_json_keys(&input);
        let serialized = serde_json::to_string(&sorted).unwrap();
        assert_eq!(serialized, r#"{"a":2,"m":3,"z":1}"#);
    }

    #[test]
    fn sort_json_keys_recurses_into_nested_objects() {
        let input = serde_json::json!({
            "outer_b": {"z": 1, "a": 2},
            "outer_a": {"y": 3, "b": 4},
        });
        let sorted = sort_json_keys(&input);
        let serialized = serde_json::to_string(&sorted).unwrap();
        assert_eq!(
            serialized,
            r#"{"outer_a":{"b":4,"y":3},"outer_b":{"a":2,"z":1}}"#
        );
    }

    #[test]
    fn sort_json_keys_preserves_array_order() {
        let input = serde_json::json!([3, 1, 2]);
        let sorted = sort_json_keys(&input);
        let serialized = serde_json::to_string(&sorted).unwrap();
        assert_eq!(serialized, "[3,1,2]");
    }

    #[test]
    fn sort_json_keys_sorts_objects_inside_arrays_but_keeps_array_order() {
        let input = serde_json::json!([
            {"z": 1, "a": 2},
            {"y": 3, "b": 4},
        ]);
        let sorted = sort_json_keys(&input);
        let serialized = serde_json::to_string(&sorted).unwrap();
        assert_eq!(serialized, r#"[{"a":2,"z":1},{"b":4,"y":3}]"#);
    }

    #[test]
    fn sort_json_keys_passes_through_primitives() {
        let cases = vec![
            serde_json::json!("hello"),
            serde_json::json!(42),
            serde_json::json!(3.5),
            serde_json::json!(true),
            serde_json::json!(null),
        ];
        for value in cases {
            let sorted = sort_json_keys(&value);
            assert_eq!(sorted, value);
        }
    }

    #[test]
    fn sort_json_keys_handles_empty_collections() {
        let empty_obj = serde_json::json!({});
        assert_eq!(
            serde_json::to_string(&sort_json_keys(&empty_obj)).unwrap(),
            "{}"
        );

        let empty_arr = serde_json::json!([]);
        assert_eq!(
            serde_json::to_string(&sort_json_keys(&empty_arr)).unwrap(),
            "[]"
        );
    }

    #[test]
    fn sort_json_keys_produces_identical_output_for_different_insertion_orders() {
        // 核心保证：同一逻辑配置无论键的插入顺序如何，写出的字节序列必须一致。
        let mut a = Map::new();
        a.insert("env".to_string(), serde_json::json!({"PATH": "/usr/bin"}));
        a.insert("model".to_string(), serde_json::json!("claude-sonnet-4-5"));
        a.insert("permissions".to_string(), serde_json::json!({"allow": []}));

        let mut b = Map::new();
        b.insert("permissions".to_string(), serde_json::json!({"allow": []}));
        b.insert("model".to_string(), serde_json::json!("claude-sonnet-4-5"));
        b.insert("env".to_string(), serde_json::json!({"PATH": "/usr/bin"}));

        let sorted_a = sort_json_keys(&Value::Object(a));
        let sorted_b = sort_json_keys(&Value::Object(b));

        assert_eq!(
            serde_json::to_string(&sorted_a).unwrap(),
            serde_json::to_string(&sorted_b).unwrap(),
        );
    }

    #[test]
    fn database_path_prefers_codego_and_falls_back_to_legacy_names() {
        let temp = tempfile::tempdir().unwrap();
        let legacy = temp.path().join("cc-switch.db");
        let conn = Connection::open(&legacy).unwrap();
        conn.execute_batch("PRAGMA user_version = 13;").unwrap();
        drop(conn);
        assert_eq!(database_path_in(temp.path()), legacy);

        let canonical = temp.path().join(DATABASE_FILE_NAME);
        let conn = Connection::open(&canonical).unwrap();
        conn.execute_batch("PRAGMA user_version = 13;").unwrap();
        drop(conn);
        assert_eq!(database_path_in(temp.path()), canonical);
    }

    #[test]
    fn database_path_ignores_legacy_database_newer_than_supported() {
        let temp = tempfile::tempdir().unwrap();
        let legacy = temp.path().join("cc-switch.db");
        let conn = Connection::open(&legacy).unwrap();
        conn.execute_batch("PRAGMA user_version = 16;").unwrap();
        drop(conn);

        assert_eq!(
            database_path_in(temp.path()),
            temp.path().join(DATABASE_FILE_NAME)
        );
        assert!(legacy.exists());
    }

    #[test]
    fn unsupported_codego_database_isolated_with_sidecars() {
        let temp = tempfile::tempdir().unwrap();
        let destination = temp.path().join(APP_CONFIG_DIR_NAME);
        std::fs::create_dir_all(&destination).unwrap();
        let database = destination.join(DATABASE_FILE_NAME);
        let conn = Connection::open(&database).unwrap();
        conn.execute_batch("PRAGMA user_version = 16;").unwrap();
        drop(conn);
        std::fs::write(
            PathBuf::from(format!("{}-wal", database.display())),
            b"legacy wal",
        )
        .unwrap();
        std::fs::write(
            PathBuf::from(format!("{}-shm", database.display())),
            b"legacy shm",
        )
        .unwrap();

        assert!(isolate_unsupported_database(&destination).unwrap());
        let backup = destination.join("codego.db.unsupported-v16");
        assert!(!database.exists());
        assert_eq!(read_database_user_version(&backup).unwrap(), 16);
        assert!(PathBuf::from(format!("{}-wal", backup.display())).exists());
        assert!(PathBuf::from(format!("{}-shm", backup.display())).exists());
        assert!(!PathBuf::from(format!("{}-wal", database.display())).exists());
        assert!(!isolate_unsupported_database(&destination).unwrap());
    }

    #[test]
    fn legacy_directory_migration_copies_data_without_overwriting_or_deleting() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join(".cc-switch");
        let destination = temp.path().join(APP_CONFIG_DIR_NAME);
        std::fs::create_dir_all(&source).unwrap();
        let legacy_db = source.join("cc-switch.db");
        let conn = Connection::open(&legacy_db).unwrap();
        conn.execute_batch("PRAGMA user_version = 13;").unwrap();
        drop(conn);
        std::fs::write(source.join("cc-switch.db-wal"), b"legacy wal").unwrap();
        std::fs::write(source.join("settings.json"), b"old settings").unwrap();
        std::fs::create_dir_all(&destination).unwrap();
        std::fs::write(destination.join("settings.json"), b"new settings").unwrap();

        assert!(migrate_legacy_directory(&source, &destination).unwrap());
        assert_eq!(
            read_database_user_version(&destination.join(DATABASE_FILE_NAME)).unwrap(),
            13
        );
        assert_eq!(
            std::fs::read(destination.join("codego.db-wal")).unwrap(),
            b"legacy wal"
        );
        assert_eq!(
            std::fs::read(destination.join("settings.json")).unwrap(),
            b"new settings"
        );
        assert!(source.join("cc-switch.db").exists());
    }

    #[test]
    fn legacy_directory_migration_skips_database_newer_than_supported() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join(".cc-switch");
        let destination = temp.path().join(APP_CONFIG_DIR_NAME);
        std::fs::create_dir_all(&source).unwrap();
        let legacy_db = source.join("cc-switch.db");
        let conn = Connection::open(&legacy_db).unwrap();
        conn.execute_batch("PRAGMA user_version = 16;").unwrap();
        drop(conn);

        assert!(!migrate_legacy_directory(&source, &destination).unwrap());
        assert!(!destination.join(DATABASE_FILE_NAME).exists());
        assert!(legacy_db.exists());
    }
}

/// 复制文件
pub fn copy_file(from: &Path, to: &Path) -> Result<(), AppError> {
    fs::copy(from, to).map_err(|e| AppError::IoContext {
        context: format!("复制文件失败 ({} -> {})", from.display(), to.display()),
        source: e,
    })?;
    Ok(())
}

/// 删除文件
pub fn delete_file(path: &Path) -> Result<(), AppError> {
    if path.exists() {
        fs::remove_file(path).map_err(|e| AppError::io(path, e))?;
    }
    Ok(())
}

/// 检查 Claude Code 配置状态
#[derive(Serialize, Deserialize)]
pub struct ConfigStatus {
    pub exists: bool,
    pub path: String,
}

/// 获取 Claude Code 配置状态
pub fn get_claude_config_status() -> ConfigStatus {
    let path = get_claude_settings_path();
    ConfigStatus {
        exists: path.exists(),
        path: path.to_string_lossy().to_string(),
    }
}
