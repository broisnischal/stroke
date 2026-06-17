mod cloudflare;
mod commands;
mod copilot;
mod db;
mod docker;
mod license;
mod mcp;
mod metrics;
mod secrets;

use db::{ActiveConnection, DbState, TunnelState};
use mcp::McpState;
use std::sync::{Arc, Mutex};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

/// Resolve the tray icon that matches the current system appearance.
/// A dark mark sits on the light menu bar; a light mark on the dark menu bar,
/// so the logo stays visible regardless of the OS theme.
fn tray_icon_for_theme(
    app: &tauri::AppHandle,
    theme: tauri::Theme,
) -> Option<tauri::image::Image<'static>> {
    let name = match theme {
        tauri::Theme::Dark => "icons/tray-light.png",
        _ => "icons/tray-dark.png",
    };
    let path = app
        .path()
        .resolve(name, tauri::path::BaseDirectory::Resource)
        .ok()?;
    tauri::image::Image::from_path(path).ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Linux WebKitGTK rendering fix — set before any threads spawn.
    #[cfg(target_os = "linux")]
    // SAFETY: called before any threads are spawned.
    unsafe {
        // WEBKIT_DISABLE_DMABUF_RENDERER: WebKitGTK's DMA-buf renderer composites
        // text as GPU textures that get bilinearly sampled at fractional pixel
        // offsets during scroll/zoom, producing the characteristic blur on Linux.
        // Disabling it falls back to a Cairo/FreeType software path that stays crisp.
        // This is the only verified safe WebKitGTK rendering env var — others like
        // WEBKIT_USE_LEGACY_TEXT_RENDERER are not real and can trigger SIGTRAP crashes.
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        // GDK_SCALE is intentionally NOT forced here — overriding it breaks HiDPI
        // setups (2× displays) and can cause rendering panics on Wayland compositors.
    }

    // Set a human-readable process title so the app shows as "stroke" in
    // htop / ps / /proc — makes it easy to identify among WebKit helper processes.
    let _ = metrics::set_process_title("stroke".into());
    // Create the shared connection Arc — both DbState and McpState point to the same lock.
    let db_conn: Arc<Mutex<Option<ActiveConnection>>> = Arc::new(Mutex::new(None));
    let db_state = DbState { conn: Arc::clone(&db_conn) };
    let mcp_state = McpState::new(db_conn);

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::AppleScript, None))
        .manage(db_state)
        .manage(mcp_state)
        .manage(TunnelState::new())
        .manage(db::live::LiveState::default())
        .setup(|app| {
            // Load or generate a stable MCP token from the app data directory.
            app.state::<McpState>().init_token(app.handle());

            let window = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("/".into()),
            )
            .title("Stroke")
            .inner_size(1280.0, 800.0)
            .min_inner_size(960.0, 600.0)
            .resizable(true)
            .maximized(true)
            .decorations(false)
            .transparent(true)
            .shadow(true)
            .visible(false)
            // devtools(true) enables WebKit's inspector protocol. On Linux with
            // WebKitGTK 2.48+, having the protocol active without a connected
            // DevTools client causes JavaScriptCore to emit SIGTRAP
            // ("NeedDebuggerBreak trap") on any JS exception or font-load race,
            // crashing the process. Auto-enable only in debug builds (dev mode);
            // keep disabled in release. The toggle_devtools command also exposes
            // them on demand via F12.
            .devtools(cfg!(debug_assertions))
            // The app implements its own CSS-based zoom; disable Tauri's injected
            // zoom polyfill. On macOS/Linux that polyfill attaches a `mousewheel`
            // (legacy event) listener that calls set_webview_zoom on ctrl+scroll —
            // a stray trackpad pinch near a column resize handle would then page-zoom
            // the whole webview (devicePixelRatio jumps, canvas renders blurry).
            .zoom_hotkeys_enabled(false)
            .on_navigation(|url| {
                let scheme = url.scheme();
                if matches!(scheme, "tauri" | "ipc") {
                    return true;
                }
                let host = url.host_str().unwrap_or("");
                host == "localhost" || host == "tauri.localhost" || host == "127.0.0.1"
            })
            .build()?;

            // Set native macOS window corner radius on the contentView's CALayer.
            // CSS border-radius alone doesn't work for transparent frameless windows
            // because WKWebView's backing layer clips at 0 radius by default.
            #[cfg(target_os = "macos")]
            {
                use objc2_app_kit::NSWindow;

                if let Ok(raw) = window.ns_window() {
                    unsafe {
                        let ns_win = raw as *mut objc2::runtime::AnyObject;
                        let ns_win_ref: &NSWindow = &*(ns_win as *const NSWindow);

                        if let Some(content_view) = ns_win_ref.contentView() {
                            content_view.setWantsLayer(true);
                            if let Some(layer) = content_view.layer() {
                                layer.setCornerRadius(10.0);
                                layer.setMasksToBounds(true);
                            }
                        }
                    }
                }

                // Defensive: disable every native WKWebView zoom path. App zoom is
                // CSS-based (--app-zoom); stray pinch near column resize handles
                // must never page-zoom the webview (devicePixelRatio drift → blur).
                let _ = window.with_webview(|webview| unsafe {
                    use objc2_web_kit::WKWebView;
                    let view: &WKWebView = &*webview.inner().cast();
                    view.setAllowsMagnification(false);
                    view.setMagnification(1.0);
                    view.setPageZoom(1.0);
                });
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // ── System tray ───────────────────────────────────────────────────
            let show_item = MenuItem::with_id(app, "show", "Open Stroke", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Stroke", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;

            let tray_menu = Menu::with_items(app, &[&show_item, &sep, &quit_item])?;

            // Dedicated tray icon (Stroke mark) chosen to stay visible against the
            // current system menu-bar theme; swapped live on ThemeChanged below.
            let initial_theme = window.theme().unwrap_or(tauri::Theme::Light);
            let tray_icon = tray_icon_for_theme(app.handle(), initial_theme)
                .unwrap_or_else(|| app.default_window_icon().unwrap().clone());

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(tray_icon)
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            // ── Hide to tray on close instead of quitting ─────────────────────
            let app_handle = app.handle().clone();
            window.on_window_event(move |event| match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let _ = w.hide();
                    }
                }
                // Keep the tray mark visible when the OS flips light/dark.
                tauri::WindowEvent::ThemeChanged(theme) => {
                    if let Some(tray) = app_handle.tray_by_id("main-tray") {
                        if let Some(icon) = tray_icon_for_theme(&app_handle, *theme) {
                            let _ = tray.set_icon(Some(icon));
                        }
                    }
                }
                _ => {}
            });

            // Suppress unused-variable warning in release builds
            let _ = &window;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ai_fetch,
            commands::save_file,
            commands::read_file,
            commands::restart_app,
            commands::toggle_devtools,
            commands::test_postgres_connection,
            commands::connect_postgres,
            commands::disconnect_postgres,
            commands::live_start,
            commands::live_stop,
            commands::test_sqlite,
            commands::connect_sqlite_db,
            commands::test_mysql,
            commands::connect_mysql_db,
            commands::test_d1,
            commands::connect_d1_db,
            commands::test_libsql,
            commands::connect_libsql_db,
            commands::test_clickhouse,
            commands::connect_clickhouse_db,
            commands::test_duckdb,
            commands::connect_duckdb_db,
            commands::test_mssql,
            commands::connect_mssql_db,
            commands::pg_list_schemas,
            commands::pg_list_tables,
            commands::pg_list_indexes,
            commands::pg_get_table_column_structure,
            commands::pg_get_incoming_foreign_keys,
            commands::pg_list_enums,
            commands::pg_list_triggers,
            commands::pg_list_sequences,
            commands::pg_truncate_table,
            commands::pg_drop_table,
            commands::get_table_ddl,
            commands::get_table_ddl_on_connection,
            commands::pg_get_table_rows,
            commands::pg_get_column_stats,
            commands::pg_execute_sql,
            commands::pg_execute_sql_multi,
            commands::pg_explain_sql,
            commands::execute_sql_on_connection,
            commands::list_schemas_on_connection,
            commands::list_tables_on_connection,
            commands::pg_execute_ddl,
            commands::pg_update_table_cell,
            commands::pg_delete_table_row,
            commands::pg_delete_table_rows,
            commands::pg_insert_table_row,
            mcp::mcp_start,
            mcp::mcp_stop,
            mcp::mcp_status,
            mcp::mcp_update_connections,
            mcp::mcp_set_readonly,
            docker::docker_check,
            docker::docker_run_db,
            secrets::ai_store_key,
            secrets::ai_load_key,
            secrets::ai_delete_key,
            copilot::copilot_start_device_flow,
            copilot::copilot_poll_oauth_token,
            copilot::copilot_get_copilot_token,
            copilot::copilot_fetch_models,
            cloudflare::cloudflare_start_oauth,
            cloudflare::cloudflare_oauth_status,
            cloudflare::cloudflare_get_valid_token,
            cloudflare::cloudflare_logout,
            cloudflare::cloudflare_list_accounts,
            cloudflare::cloudflare_list_d1_databases,
            db::backup::backup_export,
            db::backup::backup_import,
            commands::check_license_status,
            commands::activate_license,
            commands::deactivate_license,
            commands::run_license_check,
            commands::init_sample_db,
            metrics::get_app_metrics,
            metrics::set_process_title,
            commands::enable_autostart,
            commands::disable_autostart,
            commands::get_autostart_status,
            #[cfg(debug_assertions)]
            commands::debug_set_trial_days_ago,
            #[cfg(debug_assertions)]
            commands::debug_reset_trial,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
