use serde::Serialize;
use serde_json::{json, Value};
use std::{
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager};

static ROSTER_WRITE_LOCK: Mutex<()> = Mutex::new(());
static STATISTICS_WRITE_LOCK: Mutex<()> = Mutex::new(());
const DEFAULT_ROSTER: &str = include_str!("../../data/players.json");
const DEFAULT_STATISTICS: &str = include_str!("../../data/statistics.json");

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    players: Option<Vec<Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    matches: Option<Vec<Value>>,
    path: String,
    git_trackable: bool,
    exists: bool,
}

fn source_data_path(file_name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri must be inside the project")
        .join("data")
        .join(file_name)
}

fn writable_data_path(app: &AppHandle, file_name: &str) -> Result<(PathBuf, bool), String> {
    if cfg!(debug_assertions) {
        return Ok((source_data_path(file_name), true));
    }
    app.path()
        .app_data_dir()
        .map(|directory| (directory.join(file_name), false))
        .map_err(|error| format!("Nepodařilo se určit složku aplikace: {error}"))
}

fn bundled_document(file_name: &str) -> Result<Value, String> {
    let source = match file_name {
        "players.json" => DEFAULT_ROSTER,
        "statistics.json" => DEFAULT_STATISTICS,
        _ => return Err("Neznámý výchozí datový soubor.".to_string()),
    };
    serde_json::from_str(source)
        .map_err(|error| format!("Přibalený soubor {file_name} neobsahuje platný JSON: {error}"))
}

fn document_items(document: &Value, field: &str) -> Result<Vec<Value>, String> {
    let object = document
        .as_object()
        .ok_or_else(|| "Datový soubor musí být JSON objekt.".to_string())?;
    if object.get("schemaVersion").and_then(Value::as_u64) != Some(1) {
        return Err("Datový soubor má nepodporovanou verzi schématu.".to_string());
    }
    if object.get("updatedAt").and_then(Value::as_str).is_none() {
        return Err("Datový soubor nemá platné datum aktualizace.".to_string());
    }
    object
        .get(field)
        .and_then(Value::as_array)
        .cloned()
        .ok_or_else(|| format!("Datový soubor neobsahuje platné pole {field}."))
}

fn validate_roster(document: &Value) -> Result<Vec<Value>, String> {
    let players = document_items(document, "players")?;
    for player in &players {
        let object = player
            .as_object()
            .ok_or_else(|| "Každý hráč musí být JSON objekt.".to_string())?;
        let id = object.get("id").and_then(Value::as_str).unwrap_or_default();
        let name = object
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let riot_id = object
            .get("riotId")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if id.is_empty() || name.trim().is_empty() || name.len() > 40 || riot_id.len() > 81 {
            return Err("Soubor hráčů obsahuje neplatný záznam.".to_string());
        }
        if !riot_id.is_empty() && !riot_id.contains('#') {
            return Err("Riot ID musí být prázdné nebo ve formátu Jméno#TAG.".to_string());
        }
    }
    Ok(players)
}

fn validate_statistics(document: &Value) -> Result<Vec<Value>, String> {
    let matches = document_items(document, "matches")?;
    if matches.len() > 50_000 {
        return Err("Soubor statistik je příliš velký.".to_string());
    }
    for summary in &matches {
        let object = summary
            .as_object()
            .ok_or_else(|| "Každý zápas musí být JSON objekt.".to_string())?;
        if object
            .get("matchId")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .is_empty()
            || !object.get("participants").is_some_and(Value::is_array)
        {
            return Err("Soubor statistik obsahuje neplatný zápas.".to_string());
        }
    }
    Ok(matches)
}

fn load_document(
    app: &AppHandle,
    file_name: &str,
    field: &str,
    validate: fn(&Value) -> Result<Vec<Value>, String>,
) -> Result<FileResult, String> {
    let (path, git_trackable) = writable_data_path(app, file_name)?;
    match fs::read_to_string(&path) {
        Ok(source) => {
            let document: Value = serde_json::from_str(&source).map_err(|error| {
                format!("Soubor {} neobsahuje platný JSON: {error}", path.display())
            })?;
            let items = validate(&document)?;
            Ok(file_result(field, items, path, git_trackable, true))
        }
        Err(error) if error.kind() == ErrorKind::NotFound => {
            let fallback = if cfg!(debug_assertions) {
                json!({ "schemaVersion": 1, "updatedAt": "1970-01-01T00:00:00.000Z", (field): [] })
            } else {
                bundled_document(file_name)?
            };
            let items = validate(&fallback)?;
            Ok(file_result(field, items, path, git_trackable, false))
        }
        Err(error) => Err(format!("Soubor {} nelze načíst: {error}", path.display())),
    }
}

fn file_result(
    field: &str,
    items: Vec<Value>,
    path: PathBuf,
    git_trackable: bool,
    exists: bool,
) -> FileResult {
    FileResult {
        players: (field == "players").then_some(items.clone()),
        matches: (field == "matches").then_some(items),
        path: path.to_string_lossy().into_owned(),
        git_trackable,
        exists,
    }
}

fn replace_file(temporary_path: &Path, path: &Path) -> Result<(), String> {
    if !path.exists() {
        return fs::rename(temporary_path, path)
            .map_err(|error| format!("Soubor {} nelze dokončit: {error}", path.display()));
    }
    let backup_path = path.with_extension("bak");
    if backup_path.exists() {
        fs::remove_file(&backup_path).map_err(|error| {
            format!(
                "Starou zálohu {} nelze odstranit: {error}",
                backup_path.display()
            )
        })?;
    }
    fs::rename(path, &backup_path)
        .map_err(|error| format!("Soubor {} nelze zazálohovat: {error}", path.display()))?;
    if let Err(error) = fs::rename(temporary_path, path) {
        let _ = fs::rename(&backup_path, path);
        return Err(format!("Soubor {} nelze dokončit: {error}", path.display()));
    }
    let _ = fs::remove_file(backup_path);
    Ok(())
}

fn save_document(
    app: &AppHandle,
    file_name: &str,
    field: &str,
    document: &Value,
    validate: fn(&Value) -> Result<Vec<Value>, String>,
    write_lock: &Mutex<()>,
) -> Result<FileResult, String> {
    let items = validate(document)?;
    let (path, git_trackable) = writable_data_path(app, file_name)?;
    let _guard = write_lock
        .lock()
        .map_err(|_| "Zámek datového souboru je poškozený.".to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Složku {} nelze vytvořit: {error}", parent.display()))?;
    }
    let temporary_path = path.with_extension(format!("{}.tmp", std::process::id()));
    let mut serialized = serde_json::to_string_pretty(document)
        .map_err(|error| format!("Data nelze převést do JSON: {error}"))?;
    serialized.push('\n');
    fs::write(&temporary_path, serialized).map_err(|error| {
        format!(
            "Dočasný soubor {} nelze uložit: {error}",
            temporary_path.display()
        )
    })?;
    replace_file(&temporary_path, &path)?;
    Ok(file_result(field, items, path, git_trackable, true))
}

#[tauri::command]
fn load_roster(app: AppHandle) -> Result<FileResult, String> {
    load_document(&app, "players.json", "players", validate_roster)
}

#[tauri::command]
fn save_roster(app: AppHandle, roster: Value) -> Result<FileResult, String> {
    save_document(
        &app,
        "players.json",
        "players",
        &roster,
        validate_roster,
        &ROSTER_WRITE_LOCK,
    )
}

#[tauri::command]
fn load_statistics(app: AppHandle) -> Result<FileResult, String> {
    load_document(&app, "statistics.json", "matches", validate_statistics)
}

#[tauri::command]
fn save_statistics(app: AppHandle, statistics: Value) -> Result<FileResult, String> {
    save_document(
        &app,
        "statistics.json",
        "matches",
        &statistics,
        validate_statistics,
        &STATISTICS_WRITE_LOCK,
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_roster,
            save_roster,
            load_statistics,
            save_statistics
        ])
        .run(tauri::generate_context!())
        .expect("LoL Randomizer se nepodařilo spustit");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_roster() {
        let invalid = json!({ "schemaVersion": 1, "updatedAt": "now", "players": [{ "id": "1", "name": "", "riotId": "" }] });
        assert!(validate_roster(&invalid).is_err());
    }

    #[test]
    fn accepts_statistics_cache() {
        let valid = json!({ "schemaVersion": 1, "updatedAt": "now", "matches": [{ "matchId": "OPGG_1", "participants": [] }] });
        assert_eq!(validate_statistics(&valid).unwrap().len(), 1);
    }
}
