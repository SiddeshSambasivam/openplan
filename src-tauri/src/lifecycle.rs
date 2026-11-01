//! What closing the window and quitting the app do.
//!
//! On macOS the window's close button hides it and the app keeps running,
//! so agents can still reach their sessions. The Dock icon shows it again.
//! Elsewhere there is no Dock to come back from, so closing the window quits.

use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, RunEvent, Window, WindowEvent};

/// The page writes unsaved edits when it hears this, then exits the app.
const QUIT_REQUESTED: &str = "quit-requested";
/// How long a page that never answers can hold up a quit.
const QUIT_GRACE: Duration = Duration::from_secs(3);
const QUIT_MENU_ID: &str = "quit";

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    let WindowEvent::CloseRequested { api, .. } = event else {
        return;
    };
    api.prevent_close();
    if cfg!(target_os = "macos") {
        let _ = window.hide();
    } else {
        request_quit(window.app_handle());
    }
}

pub fn on_run_event(app: &AppHandle, event: RunEvent) {
    match event {
        #[cfg(target_os = "macos")]
        RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        RunEvent::MenuEvent(event) if event.id() == QUIT_MENU_ID => request_quit(app),
        RunEvent::Exit => crate::sessions::teardown(),
        _ => {}
    }
}

/// The standard menu, with Quit asking the page to save first. The stock
/// Quit item ends the app before the page can write anything.
#[cfg(target_os = "macos")]
pub fn menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{Menu, MenuItem};
    let menu = Menu::default(app)?;
    if let Some(app_menu) = menu.items()?.first().and_then(|item| item.as_submenu()) {
        let stock_quit = app_menu.items()?.len().saturating_sub(1);
        app_menu.remove_at(stock_quit)?;
        let name = &app.package_info().name;
        let quit = MenuItem::with_id(
            app,
            QUIT_MENU_ID,
            format!("Quit {name}"),
            true,
            Some("CmdOrCtrl+Q"),
        )?;
        app_menu.append(&quit)?;
    }
    Ok(menu)
}

fn request_quit(app: &AppHandle) {
    let _ = app.emit_to("main", QUIT_REQUESTED, ());
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(QUIT_GRACE);
        app.exit(0);
    });
}
