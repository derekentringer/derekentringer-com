use std::path::PathBuf;
use std::sync::Mutex;
use keyring::Entry;
use tauri::{Emitter, Manager, RunEvent};
use tauri::menu::{MenuBuilder, SubmenuBuilder, MenuItemBuilder, PredefinedMenuItem};
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg(any(target_os = "macos", target_os = "windows"))]
mod audio_capture_shared;

#[cfg(target_os = "macos")]
mod audio_capture;

#[cfg(target_os = "windows")]
mod audio_capture_win;

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
        Migration {
            version: 12,
            description: "add transcript column to notes",
            sql: include_str!("../migrations/012.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "drop foreign key constraint on folders.parent_id",
            sql: include_str!("../migrations/013.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "drop foreign key constraint on images.note_id",
            sql: include_str!("../migrations/014.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "add managed_directories table",
            sql: include_str!("../migrations/015.sql"),
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
    #[cfg(target_os = "windows")]
    {
        audio_capture_win::check_support()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
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
    #[cfg(target_os = "windows")]
    {
        audio_capture_win::start_recording(app_handle)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = app_handle;
        Err("Meeting recording is not supported on this platform".into())
    }
}

#[tauri::command]
fn stop_meeting_recording() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        audio_capture::stop_recording()
    }
    #[cfg(target_os = "windows")]
    {
        audio_capture_win::stop_recording()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err("Meeting recording is not supported on this platform".into())
    }
}

#[tauri::command]
fn get_meeting_audio_chunk() -> Result<Vec<u8>, String> {
    #[cfg(target_os = "macos")]
    {
        audio_capture::get_audio_chunk()
    }
    #[cfg(target_os = "windows")]
    {
        audio_capture_win::get_audio_chunk()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err("Meeting recording is not supported on this platform".into())
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

/// Update enabled state of menu items by ID
#[tauri::command]
fn set_menu_items_enabled(app: tauri::AppHandle, ids: Vec<String>, enabled: bool) {
    for id in ids {
        if let Some(item) = app.menu().and_then(|m| m.get(&id)) {
            match item {
                tauri::menu::MenuItemKind::MenuItem(mi) => { let _ = mi.set_enabled(enabled); },
                _ => {}
            }
        }
    }
}

/// Menu item IDs that require an open note
const NOTE_MENU_IDS: &[&str] = &["save", "export-md", "close-tab"];

/// Menu item IDs that require editor focus
const EDITOR_MENU_IDS: &[&str] = &["bold", "italic", "strikethrough", "inline-code", "heading"];

#[cfg_attr(mobile, tauri::mobile_entry_point)]
fn build_menu(app: &tauri::App) -> Result<tauri::menu::Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let handle = app.handle();

    // --- File menu ---
    let mut file_builder = SubmenuBuilder::new(handle, "File");
    file_builder = file_builder
        .item(&MenuItemBuilder::with_id("new-note", "New Note").accelerator("CmdOrCtrl+N").build(handle)?)
        .item(&MenuItemBuilder::with_id("quick-switcher", "Quick Switcher").accelerator("CmdOrCtrl+O").build(handle)?)
        .item(&MenuItemBuilder::with_id("close-tab", "Close Tab").accelerator("CmdOrCtrl+W").build(handle)?)
        .separator()
        .item(&MenuItemBuilder::with_id("save", "Save").accelerator("CmdOrCtrl+S").build(handle)?)
        .item(&MenuItemBuilder::with_id("export-md", "Export as Markdown...").build(handle)?)
        .separator()
        .item(&MenuItemBuilder::with_id("import-files", "Import Files...").build(handle)?)
        .item(&MenuItemBuilder::with_id("import-folder", "Import Folder...").build(handle)?);
    // On Windows/Linux, add Settings to File menu (macOS has it in App menu)
    #[cfg(not(target_os = "macos"))]
    {
        file_builder = file_builder
            .separator()
            .item(&MenuItemBuilder::with_id("settings", "Settings").accelerator("CmdOrCtrl+,").build(handle)?);
    }
    let file_menu = file_builder.build()?;

    // --- Edit menu ---
    let edit_menu = SubmenuBuilder::new(handle, "Edit")
        .item(&PredefinedMenuItem::undo(handle, None)?)
        .item(&PredefinedMenuItem::redo(handle, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(handle, None)?)
        .item(&PredefinedMenuItem::copy(handle, None)?)
        .item(&PredefinedMenuItem::paste(handle, None)?)
        .item(&PredefinedMenuItem::select_all(handle, None)?)
        .separator()
        .item(&MenuItemBuilder::with_id("find", "Find").accelerator("CmdOrCtrl+K").build(handle)?)
        .separator()
        .item(&MenuItemBuilder::with_id("bold", "Bold").accelerator("CmdOrCtrl+B").build(handle)?)
        .item(&MenuItemBuilder::with_id("italic", "Italic").accelerator("CmdOrCtrl+I").build(handle)?)
        .item(&MenuItemBuilder::with_id("strikethrough", "Strikethrough").accelerator("CmdOrCtrl+Shift+X").build(handle)?)
        .item(&MenuItemBuilder::with_id("inline-code", "Inline Code").accelerator("CmdOrCtrl+Shift+C").build(handle)?)
        .item(&MenuItemBuilder::with_id("heading", "Cycle Heading").accelerator("CmdOrCtrl+Shift+H").build(handle)?)
        .build()?;

    // --- View menu ---
    let view_menu = SubmenuBuilder::new(handle, "View")
        .item(&MenuItemBuilder::with_id("view-editor", "Editor").build(handle)?)
        .item(&MenuItemBuilder::with_id("view-split", "Split").build(handle)?)
        .item(&MenuItemBuilder::with_id("view-live", "Live Preview").build(handle)?)
        .item(&MenuItemBuilder::with_id("view-preview", "Preview").build(handle)?)
        .separator()
        .item(&MenuItemBuilder::with_id("cycle-view", "Cycle View Mode").accelerator("CmdOrCtrl+E").build(handle)?)
        .separator()
        .item(&MenuItemBuilder::with_id("toggle-sidebar", "Toggle Sidebar").accelerator("CmdOrCtrl+\\").build(handle)?)
        .item(&MenuItemBuilder::with_id("toggle-notelist", "Toggle Note List").accelerator("CmdOrCtrl+Shift+\\").build(handle)?)
        .item(&MenuItemBuilder::with_id("focus-mode", "Toggle Focus Mode").accelerator("CmdOrCtrl+Shift+D").build(handle)?)
        .separator()
        .item(&MenuItemBuilder::with_id("command-palette", "Command Palette").accelerator("CmdOrCtrl+P").build(handle)?)
        .separator()
        .item(&MenuItemBuilder::with_id("toggle-fullscreen", "Toggle Full Screen").accelerator("Ctrl+CmdOrCtrl+F").build(handle)?)
        .build()?;

    // --- Window menu ---
    let window_menu = SubmenuBuilder::new(handle, "Window")
        .item(&PredefinedMenuItem::minimize(handle, None)?)
        .item(&PredefinedMenuItem::maximize(handle, None)?)
        .separator()
        .item(&MenuItemBuilder::with_id("prev-tab", "Previous Tab").accelerator("CmdOrCtrl+Shift+[").build(handle)?)
        .item(&MenuItemBuilder::with_id("next-tab", "Next Tab").accelerator("CmdOrCtrl+Shift+]").build(handle)?)
        .build()?;

    // --- Help menu ---
    let mut help_builder = SubmenuBuilder::new(handle, "Help");
    help_builder = help_builder
        .item(&MenuItemBuilder::with_id("keyboard-shortcuts", "Keyboard Shortcuts").build(handle)?);
    // On Windows/Linux, add About to Help menu (macOS has it in App menu)
    #[cfg(not(target_os = "macos"))]
    {
        help_builder = help_builder
            .separator()
            .item(&MenuItemBuilder::with_id("about", "About NoteSync").build(handle)?);
    }
    let help_menu = help_builder.build()?;

    // --- macOS App menu ---
    #[cfg(target_os = "macos")]
    let app_menu = SubmenuBuilder::new(handle, "NoteSync")
        .item(&MenuItemBuilder::with_id("about", "About NoteSync").build(handle)?)
        .separator()
        .item(&MenuItemBuilder::with_id("settings", "Settings...").accelerator("CmdOrCtrl+,").build(handle)?)
        .separator()
        .item(&PredefinedMenuItem::hide(handle, None)?)
        .item(&PredefinedMenuItem::hide_others(handle, None)?)
        .item(&PredefinedMenuItem::show_all(handle, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(handle, None)?)
        .build()?;

    #[cfg(target_os = "macos")]
    let menu = MenuBuilder::new(handle)
        .items(&[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu, &help_menu])
        .build()?;

    #[cfg(not(target_os = "macos"))]
    let menu = MenuBuilder::new(handle)
        .items(&[&file_menu, &edit_menu, &view_menu, &window_menu, &help_menu])
        .build()?;

    Ok(menu)
}

pub fn run() {
    #[cfg(target_os = "macos")]
    force_legacy_scrollbars();

    let app = tauri::Builder::default()
        .manage(OpenedFiles(Mutex::new(Vec::new())))
        .invoke_handler(tauri::generate_handler![get_opened_files, get_secure_item, set_secure_item, remove_secure_item, download_file, check_meeting_recording_support, start_meeting_recording, stop_meeting_recording, get_meeting_audio_chunk, set_menu_items_enabled])
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:notesync.db", get_migrations())
                .add_migrations("sqlite:notesync_localhost.db", get_migrations())
                .build(),
        )
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Build and set custom menu
            if let Ok(menu) = build_menu(app) {
                app.set_menu(menu)?;
            }

            // Disable editor and note menu items until a note is open / editor focused
            let handle = app.handle().clone();
            for id in NOTE_MENU_IDS.iter().chain(EDITOR_MENU_IDS.iter()) {
                if let Some(item) = handle.menu().and_then(|m| m.get(*id)) {
                    if let tauri::menu::MenuItemKind::MenuItem(mi) = item {
                        let _ = mi.set_enabled(false);
                    }
                }
            }

            // Handle menu events — emit to frontend for command registry dispatch
            app.on_menu_event(move |app_handle, event| {
                let _ = app_handle.emit("menu-event", event.id().0.as_str());
            });

            // Windows file association: files opened via double-click are passed as CLI args
            #[cfg(target_os = "windows")]
            {
                let file_paths: Vec<String> = std::env::args()
                    .skip(1) // skip the exe path
                    .filter(|arg| {
                        let p = std::path::Path::new(arg);
                        p.exists() && p.extension().map_or(false, |ext| {
                            matches!(ext.to_str(), Some("md" | "txt" | "markdown"))
                        })
                    })
                    .collect();
                if !file_paths.is_empty() {
                    if let Some(state) = app.try_state::<OpenedFiles>() {
                        state.0.lock().unwrap().extend(file_paths);
                    }
                }
            }

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

    app.run(|_app_handle, _event| {
        #[cfg(target_os = "macos")]
        if let RunEvent::Opened { urls } = _event {
            let paths = urls_to_paths(urls);
            if paths.is_empty() {
                return;
            }
            // Buffer for cold-launch (frontend may not be ready yet)
            if let Some(state) = _app_handle.try_state::<OpenedFiles>() {
                state.0.lock().unwrap().extend(paths.clone());
            }
            // Emit for hot-open (frontend listener picks it up immediately)
            let _ = _app_handle.emit("open-files", &paths);
        }
    });
}
