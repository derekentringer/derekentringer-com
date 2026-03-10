use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
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
    ];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:notesync.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_stronghold::Builder::new(|_| "".into()).build())
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
