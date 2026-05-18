// Tide native shell.
//
// At startup: spawn the compiled `tide.exe` (the Bun-compiled backend) as a
// sidecar process, wait for the dev-bridge port to accept TCP connections,
// then show the main window pointing at http://127.0.0.1:5733. On window
// destroy we kill the sidecar so nothing leaks.

use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, WindowEvent};

const SIDECAR_PORT: u16 = 5733;
const SIDECAR_HOST: &str = "127.0.0.1";

struct SidecarHandle(Mutex<Option<Child>>);

fn wait_for_port(timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if TcpStream::connect_timeout(
            &format!("{SIDECAR_HOST}:{SIDECAR_PORT}").parse().unwrap(),
            Duration::from_millis(250),
        )
        .is_ok()
        {
            return true;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    false
}

fn resolve_sidecar_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<PathBuf> {
    // Production: tide.exe is bundled under <install>/binaries/tide.exe.
    // (Tauri preserves the path from `bundle.resources` relative to src-tauri/.)
    if let Ok(res) = app.path().resource_dir() {
        for candidate in [
            res.join("binaries").join("tide.exe"),
            res.join("tide.exe"),
        ] {
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    // Dev fallback: run the unpacked target/release/app.exe against the
    // sidecar that `bun run build:exe` emits into src-tauri/binaries/.
    if let Ok(cwd) = std::env::current_dir() {
        for candidate in [
            cwd.join("src-tauri").join("binaries").join("tide.exe"),
            cwd.join("binaries").join("tide.exe"),
            cwd.join("..").join("binaries").join("tide.exe"),
        ] {
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SidecarHandle(Mutex::new(None)))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let exe_path = resolve_sidecar_path(&app.handle())
                .ok_or("could not locate tide.exe sidecar")?;

            // Per-user data dir under %APPDATA%\Tide (created if missing). This
            // is where SQLite and cloned repos live for end-user installs.
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir).ok();

            let mut cmd = Command::new(&exe_path);
            cmd.env("TIDE_PORT", SIDECAR_PORT.to_string())
                .env("TIDE_DATA_DIR", &data_dir);
            #[cfg(windows)]
            {
                // CREATE_NO_WINDOW so the sidecar doesn't pop a console.
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x08000000);
            }
            let child = cmd.spawn().map_err(|e| format!("spawn sidecar: {e}"))?;
            *app.state::<SidecarHandle>().0.lock().unwrap() = Some(child);

            // Wait for the sidecar to start accepting connections (≤ 10s).
            // If it never comes up we still surface the window so the user
            // sees the connection error rather than a frozen splash.
            wait_for_port(Duration::from_secs(10));

            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::Destroyed) {
                let handle = window.state::<SidecarHandle>();
                let taken = handle.0.lock().unwrap().take();
                if let Some(mut child) = taken {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
