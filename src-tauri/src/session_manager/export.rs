use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::{load_messages, scan_sessions};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportQualifiedSessionsRequest {
    pub output_dir: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportQualifiedSessionsSummary {
    pub output_dir: String,
    pub scanned: usize,
    pub exported: usize,
    pub claude: usize,
    pub non_claude: usize,
    pub appended: usize,
    pub rewritten: usize,
    pub unchanged: usize,
    pub failed: usize,
    pub failed_sessions: Vec<FailedSessionExport>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FailedSessionExport {
    pub provider_id: String,
    pub session_id: String,
    pub source_path: Option<String>,
    pub error: String,
}

enum SyncOutcome {
    Appended,
    Rewritten,
    Unchanged,
}

/// Sync every local session into a stable `.txt` file.
///
/// Existing files are treated as append-only snapshots: if the current source
/// extends the existing txt, only new lines are appended. If the file content is
/// not a prefix of the current source, it is rewritten to avoid duplicate turns.
pub fn export_qualified_sessions(
    request: ExportQualifiedSessionsRequest,
) -> Result<ExportQualifiedSessionsSummary, String> {
    let output_dir = PathBuf::from(request.output_dir.trim());
    if output_dir.as_os_str().is_empty() {
        return Err("outputDir is required".to_string());
    }

    let claude_dir = output_dir.join("claude");
    let non_claude_dir = output_dir.join("non-claude");
    fs::create_dir_all(&claude_dir)
        .map_err(|e| format!("Failed to create {}: {e}", claude_dir.display()))?;
    fs::create_dir_all(&non_claude_dir)
        .map_err(|e| format!("Failed to create {}: {e}", non_claude_dir.display()))?;

    let sessions = scan_sessions();
    let scanned = sessions.len();
    let mut summary = ExportQualifiedSessionsSummary {
        output_dir: output_dir.to_string_lossy().to_string(),
        scanned,
        exported: 0,
        claude: 0,
        non_claude: 0,
        appended: 0,
        rewritten: 0,
        unchanged: 0,
        failed: 0,
        failed_sessions: Vec::new(),
    };

    for session in sessions {
        let Some(source_path) = session.source_path.clone() else {
            fail(
                &mut summary,
                &session.provider_id,
                &session.session_id,
                None,
                "missing source path",
            );
            continue;
        };

        let export_lines = match session_lines(&session.provider_id, &source_path) {
            Ok(lines) => lines,
            Err(error) => {
                fail(
                    &mut summary,
                    &session.provider_id,
                    &session.session_id,
                    Some(&source_path),
                    &error,
                );
                continue;
            }
        };

        let target_dir = if is_claude_export(&session.provider_id, &export_lines) {
            summary.claude += 1;
            &claude_dir
        } else {
            summary.non_claude += 1;
            &non_claude_dir
        };
        let target = target_dir.join(session_filename(&session.provider_id, &session.session_id));

        match sync_session_file(&target, &export_lines) {
            Ok(SyncOutcome::Appended) => summary.appended += 1,
            Ok(SyncOutcome::Rewritten) => summary.rewritten += 1,
            Ok(SyncOutcome::Unchanged) => summary.unchanged += 1,
            Err(error) => {
                fail(
                    &mut summary,
                    &session.provider_id,
                    &session.session_id,
                    Some(&source_path),
                    &error,
                );
                continue;
            }
        }
        summary.exported += 1;
    }

    Ok(summary)
}

fn session_lines(provider_id: &str, source_path: &str) -> Result<Vec<String>, String> {
    if source_path.starts_with("sqlite:") {
        let messages = load_messages(provider_id, source_path)?;
        return Ok(messages
            .into_iter()
            .map(|message| {
                serde_json::to_string(&message)
                    .unwrap_or_else(|_| json!({"role": "unknown", "content": ""}).to_string())
            })
            .collect());
    }

    read_lines(Path::new(source_path))
}

fn sync_session_file(target: &Path, source_lines: &[String]) -> Result<SyncOutcome, String> {
    if !target.exists() {
        write_all_lines(target, source_lines)?;
        return Ok(SyncOutcome::Rewritten);
    }

    let existing_lines = read_lines(target)?;
    if existing_lines == source_lines {
        return Ok(SyncOutcome::Unchanged);
    }

    if source_lines.starts_with(&existing_lines) {
        append_lines(target, &source_lines[existing_lines.len()..])?;
        return Ok(SyncOutcome::Appended);
    }

    write_all_lines(target, source_lines)?;
    Ok(SyncOutcome::Rewritten)
}

fn write_all_lines(target: &Path, lines: &[String]) -> Result<(), String> {
    fs::write(target, lines.join("\n") + "\n")
        .map_err(|e| format!("Failed to write {}: {e}", target.display()))
}

fn append_lines(target: &Path, lines: &[String]) -> Result<(), String> {
    if lines.is_empty() {
        return Ok(());
    }
    let mut file = OpenOptions::new()
        .append(true)
        .open(target)
        .map_err(|e| format!("Failed to open {} for append: {e}", target.display()))?;
    for line in lines {
        writeln!(file, "{line}")
            .map_err(|e| format!("Failed to append {}: {e}", target.display()))?;
    }
    Ok(())
}

fn fail(
    summary: &mut ExportQualifiedSessionsSummary,
    provider_id: &str,
    session_id: &str,
    source_path: Option<&str>,
    error: &str,
) {
    summary.failed += 1;
    summary.failed_sessions.push(FailedSessionExport {
        provider_id: provider_id.to_string(),
        session_id: session_id.to_string(),
        source_path: source_path.map(str::to_string),
        error: error.to_string(),
    });
}

fn read_lines(path: &Path) -> Result<Vec<String>, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open {}: {e}", path.display()))?;
    let reader = BufReader::new(file);
    reader
        .lines()
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read {}: {e}", path.display()))
}

fn is_claude_export(provider_id: &str, lines: &[String]) -> bool {
    if provider_id == "claude" {
        return true;
    }
    let models = collect_models(lines);
    !models.is_empty()
        && models
            .iter()
            .all(|model| model.to_ascii_lowercase().contains("claude"))
}

fn collect_models(lines: &[String]) -> HashSet<String> {
    let mut models = HashSet::new();
    for line in lines {
        if let Ok(value) = serde_json::from_str::<Value>(line) {
            collect_model_fields(&value, &mut models);
        }
    }
    models
}

fn collect_model_fields(value: &Value, out: &mut HashSet<String>) {
    match value {
        Value::Object(map) => {
            for (key, child) in map {
                if key == "model" {
                    if let Some(model) = child.as_str() {
                        out.insert(model.to_string());
                    }
                }
                collect_model_fields(child, out);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_model_fields(item, out);
            }
        }
        _ => {}
    }
}

fn session_filename(provider_id: &str, session_id: &str) -> String {
    format!(
        "{}__{}.txt",
        sanitize_filename(provider_id),
        sanitize_filename(session_id)
    )
}

fn sanitize_filename(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();
    let trimmed = sanitized.trim_matches('_');
    if trimmed.is_empty() {
        "session".to_string()
    } else {
        trimmed.chars().take(120).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn sync_session_file_appends_only_new_lines() {
        let dir = tempdir().expect("tempdir");
        let target = dir.path().join("session.txt");
        fs::write(&target, "a\nb\n").expect("write existing");

        let outcome = sync_session_file(
            &target,
            &["a".to_string(), "b".to_string(), "c".to_string()],
        )
        .expect("sync");

        assert!(matches!(outcome, SyncOutcome::Appended));
        assert_eq!(fs::read_to_string(&target).unwrap(), "a\nb\nc\n");
    }

    #[test]
    fn sync_session_file_rewrites_when_existing_is_not_prefix() {
        let dir = tempdir().expect("tempdir");
        let target = dir.path().join("session.txt");
        fs::write(&target, "old\n").expect("write existing");

        let outcome =
            sync_session_file(&target, &["new".to_string(), "turn".to_string()]).expect("sync");

        assert!(matches!(outcome, SyncOutcome::Rewritten));
        assert_eq!(fs::read_to_string(&target).unwrap(), "new\nturn\n");
    }
}
