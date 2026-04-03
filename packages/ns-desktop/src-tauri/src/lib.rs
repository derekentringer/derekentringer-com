use std::path::PathBuf;
use std::sync::Mutex;
use keyring::Entry;
use tauri::{Emitter, Manager, RunEvent};
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg(target_os = "macos")]
mod audio_capture;

const KEYRING_SERVICE: &str = "com.derekentringer.notesync";

fn get_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create notes, sync_queue, and sync_meta tables",
            sql: include_str!("../migrations/001.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add tags, summary, favorite, sort_order, deleted_at, sync_status to notes",
            sql: include_str!("../migrations/002.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add folders table and FTS5 search index",
            sql: include_str!("../migrations/003.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add note_links table for wiki-link tracking",
            sql: include_str!("../migrations/004.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add note_versions table for version history",
            sql: include_str!("../migrations/005.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add deleted_at to folders for soft-delete sync",
            sql: include_str!("../migrations/006.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "add favorite_sort_order to notes",
            sql: include_str!("../migrations/007.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "add note_embeddings table for semantic search",
            sql: include_str!("../migrations/008.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "add local file support columns to notes",
            sql: include_str!("../migrations/009.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "add audio_mode column to notes",
            sql: include_str!("../migrations/010.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "add images table",
            sql: include_str!("../migrations/011.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

struct OpenedFiles(Mutex<Vec<String>>);

fn urls_to_paths(urls: Vec<tauri::Url>) -> Vec<String> {
    urls.into_iter()
        .filter_map(|u: tauri::Url| u.to_file_path().ok())
        .map(|p: PathBuf| p.to_string_lossy().into_owned())
        .collect()
}

#[tauri::command]
fn get_opened_files(state: tauri::State<'_, OpenedFiles>) -> Vec<String> {
    let mut buf = state.0.lock().unwrap();
    buf.drain(..).collect()
}

#[tauri::command]
fn get_secure_item(key: String) -> Result<Option<String>, String> {
    let entry = Entry::new(KEYRING_SERVICE, &key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(pw) => Ok(Some(pw)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn set_secure_item(key: String, value: String) -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, &key).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_secure_item(key: String) -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, &key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn download_file(url: String, save_path: String) -> Result<(), String> {
    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    std::fs::write(&save_path, &bytes).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn check_meeting_recording_support() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        audio_capture::check_support()
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(false)
    }
}

#[tauri::command]
fn start_meeting_recording(app_handle: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        audio_capture::start_recording(app_handle)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app_handle;
        Err("Meeting recording is only supported on macOS".into())
    }
}

#[tauri::command]
fn stop_meeting_recording() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        audio_capture::stop_recording()
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Meeting recording is only supported on macOS".into())
    }
}

/// Force legacy (non-overlay) scrollbars so CSS ::-webkit-scrollbar styling
/// is always respected. macOS overlay scrollbars bypass custom CSS on hover.
#[cfg(target_os = "macos")]
fn force_legacy_scrollbars() {
    use objc2_foundation::{NSString, NSUserDefaults};
    unsafe {
        let defaults = NSUserDefaults::standardUserDefaults();
        let key = NSString::from_str("AppleShowScrollBars");
        let value = NSString::from_str("Always");
        defaults.setObject_forKey(Some(&value), &key);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "macos")]
    force_legacy_scrollbars();

    let app = tauri::Builder::default()
        .manage(OpenedFiles(Mutex::new(Vec::new())))
        .invoke_handler(tauri::generate_handler![get_opened_files, get_secure_item, set_secure_item, remove_secure_item, download_file, check_meeting_recording_support, start_meeting_recording, stop_meeting_recording])
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:notesync.db", get_migrations())
                .add_migrations("sqlite:notesync_localhost.db", get_migrations())
                .build(),
        )
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::Opened { urls } = event {
            let paths = urls_to_paths(urls);
            if paths.is_empty() {
                return;
            }
            // Buffer for cold-launch (frontend may not be ready yet)
            if let Some(state) = app_handle.try_state::<OpenedFiles>() {
                state.0.lock().unwrap().extend(paths.clone());
            }
            // Emit for hot-open (frontend listener picks it up immediately)
            let _ = app_handle.emit("open-files", &paths);
        }
    });
}
