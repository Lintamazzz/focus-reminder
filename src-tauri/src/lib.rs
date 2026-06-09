use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReminderPayload {
    task_title: String,
    planned_minutes: u32,
    elapsed_seconds: u64,
}

#[derive(Clone, Serialize)]
struct ReminderActionPayload {
    action: String,
}

#[tauri::command]
fn show_reminder(
    app: AppHandle,
    task_title: String,
    planned_minutes: u32,
    elapsed_seconds: u64,
) -> Result<(), String> {
    let window = app
        .get_webview_window("reminder")
        .ok_or_else(|| "找不到提醒窗口".to_string())?;

    window
        .emit(
            "reminder-data",
            ReminderPayload {
                task_title,
                planned_minutes,
                elapsed_seconds,
            },
        )
        .map_err(|error| error.to_string())?;
    window
        .set_always_on_top(true)
        .map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.center().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
fn hide_reminder(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("reminder")
        .ok_or_else(|| "找不到提醒窗口".to_string())?;

    window.hide().map_err(|error| error.to_string())
}

#[tauri::command]
fn submit_reminder_action(app: AppHandle, action: String) -> Result<(), String> {
    if !matches!(
        action.as_str(),
        "extend_5" | "extend_15" | "extend_30" | "finish"
    ) {
        return Err("不支持的提醒操作".to_string());
    }

    let main_window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    main_window
        .emit("reminder-action", ReminderActionPayload { action })
        .map_err(|error| error.to_string())?;

    hide_reminder(app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            show_reminder,
            hide_reminder,
            submit_reminder_action
        ])
        .run(tauri::generate_context!())
        .expect("error while running Focus Reminder");
}
