use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use chrono::{DateTime, Duration, SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

struct AppState {
    database_path: PathBuf,
    reminder_context: Mutex<Option<ReminderContext>>,
}

#[derive(Clone)]
struct ReminderContext {
    session_id: String,
    triggered_at: DateTime<Utc>,
    elapsed_seconds: u64,
    planned_minutes: u32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TaskSession {
    id: String,
    title: String,
    planned_minutes: u32,
    started_at: i64,
    next_reminder_at: i64,
    ended_at: Option<i64>,
    status: String,
    note: Option<String>,
    record_skipped: bool,
    created_at: i64,
    updated_at: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReminderPayload {
    session_id: String,
    task_title: String,
    planned_minutes: u32,
    elapsed_seconds: u64,
    reminder_options: Vec<u32>,
    theme: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReminderActionPayload {
    action: String,
    next_reminder_at: Option<i64>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    default_planned_minutes: u32,
    reminder_options: Vec<u32>,
    always_on_top: bool,
    theme: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            default_planned_minutes: 30,
            reminder_options: vec![5, 15, 30],
            always_on_top: true,
            theme: "system".to_string(),
        }
    }
}

fn database_connection(path: &Path) -> Result<Connection, String> {
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    connection
        .execute_batch(
            "
            PRAGMA foreign_keys = ON;
            PRAGMA journal_mode = WAL;
            ",
        )
        .map_err(|error| error.to_string())?;
    Ok(connection)
}

fn initialize_database(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let connection = database_connection(path)?;
    connection
        .execute_batch(
            "
            CREATE TABLE IF NOT EXISTS task_sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                planned_minutes INTEGER NOT NULL,
                started_at TEXT NOT NULL,
                next_reminder_at TEXT NOT NULL,
                ended_at TEXT,
                status TEXT NOT NULL,
                note TEXT,
                record_skipped INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_task_sessions_status_started
            ON task_sessions(status, started_at DESC);

            CREATE TABLE IF NOT EXISTS reminder_events (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                triggered_at TEXT NOT NULL,
                elapsed_minutes INTEGER NOT NULL,
                planned_minutes INTEGER NOT NULL,
                action TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES task_sessions(id)
            );

            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            ",
        )
        .map_err(|error| error.to_string())
}

fn to_iso(datetime: DateTime<Utc>) -> String {
    datetime.to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn parse_timestamp(value: String) -> rusqlite::Result<i64> {
    DateTime::parse_from_rfc3339(&value)
        .map(|datetime| datetime.timestamp_millis())
        .map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })
}

fn task_session_from_row(row: &Row<'_>) -> rusqlite::Result<TaskSession> {
    let started_at: String = row.get("started_at")?;
    let next_reminder_at: String = row.get("next_reminder_at")?;
    let ended_at: Option<String> = row.get("ended_at")?;
    let created_at: String = row.get("created_at")?;
    let updated_at: String = row.get("updated_at")?;

    Ok(TaskSession {
        id: row.get("id")?,
        title: row.get("title")?,
        planned_minutes: row.get("planned_minutes")?,
        started_at: parse_timestamp(started_at)?,
        next_reminder_at: parse_timestamp(next_reminder_at)?,
        ended_at: ended_at.map(parse_timestamp).transpose()?,
        status: row.get("status")?,
        note: row.get("note")?,
        record_skipped: row.get::<_, i64>("record_skipped")? != 0,
        created_at: parse_timestamp(created_at)?,
        updated_at: parse_timestamp(updated_at)?,
    })
}

fn get_session(connection: &Connection, session_id: &str) -> Result<TaskSession, String> {
    connection
        .query_row(
            "
            SELECT id, title, planned_minutes, started_at, next_reminder_at,
                   ended_at, status, note, record_skipped, created_at, updated_at
            FROM task_sessions
            WHERE id = ?1
            ",
            [session_id],
            task_session_from_row,
        )
        .map_err(|error| error.to_string())
}

fn insert_task(
    connection: &Connection,
    title: String,
    planned_minutes: u32,
    now: DateTime<Utc>,
) -> Result<TaskSession, String> {
    if planned_minutes == 0 || planned_minutes > 1_440 {
        return Err("预计时间必须在 1 到 1440 分钟之间".to_string());
    }

    let running_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM task_sessions WHERE status = 'running'",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;

    if running_count > 0 {
        return Err("已有未结束任务，请先处理后再开始新任务".to_string());
    }

    let next_reminder_at = now + Duration::minutes(i64::from(planned_minutes));
    let session_id = Uuid::new_v4().to_string();
    let normalized_title = {
        let trimmed = title.trim();
        if trimmed.is_empty() {
            "未命名任务".to_string()
        } else {
            trimmed.to_string()
        }
    };
    let now_iso = to_iso(now);

    connection
        .execute(
            "
            INSERT INTO task_sessions (
                id, title, planned_minutes, started_at, next_reminder_at,
                status, record_skipped, created_at, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, 'running', 0, ?4, ?4)
            ",
            params![
                session_id,
                normalized_title,
                planned_minutes,
                now_iso,
                to_iso(next_reminder_at),
            ],
        )
        .map_err(|error| error.to_string())?;

    get_session(connection, &session_id)
}

#[tauri::command]
fn start_task(
    state: State<'_, AppState>,
    title: String,
    planned_minutes: u32,
) -> Result<TaskSession, String> {
    let connection = database_connection(&state.database_path)?;
    insert_task(&connection, title, planned_minutes, Utc::now())
}

fn find_running_session(connection: &Connection) -> Result<Option<TaskSession>, String> {
    connection
        .query_row(
            "
            SELECT id, title, planned_minutes, started_at, next_reminder_at,
                   ended_at, status, note, record_skipped, created_at, updated_at
            FROM task_sessions
            WHERE status = 'running'
            ORDER BY started_at DESC
            LIMIT 1
            ",
            [],
            task_session_from_row,
        )
        .optional()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_running_session(state: State<'_, AppState>) -> Result<Option<TaskSession>, String> {
    let connection = database_connection(&state.database_path)?;
    find_running_session(&connection)
}

fn find_completed_sessions(
    connection: &Connection,
    start_at: DateTime<Utc>,
    end_at: DateTime<Utc>,
) -> Result<Vec<TaskSession>, String> {
    let mut statement = connection
        .prepare(
            "
            SELECT id, title, planned_minutes, started_at, next_reminder_at,
                   ended_at, status, note, record_skipped, created_at, updated_at
            FROM task_sessions
            WHERE status = 'completed'
              AND ended_at >= ?1
              AND ended_at < ?2
            ORDER BY ended_at DESC
            ",
        )
        .map_err(|error| error.to_string())?;
    let sessions = statement
        .query_map(
            params![to_iso(start_at), to_iso(end_at)],
            task_session_from_row,
        )
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(sessions)
}

#[tauri::command]
fn get_today_logs(
    state: State<'_, AppState>,
    start_at: i64,
    end_at: i64,
) -> Result<Vec<TaskSession>, String> {
    let start_at = DateTime::from_timestamp_millis(start_at)
        .ok_or_else(|| "无效的日期开始时间".to_string())?;
    let end_at =
        DateTime::from_timestamp_millis(end_at).ok_or_else(|| "无效的日期结束时间".to_string())?;
    if end_at <= start_at {
        return Err("日期结束时间必须晚于开始时间".to_string());
    }

    let connection = database_connection(&state.database_path)?;
    find_completed_sessions(&connection, start_at, end_at)
}

fn delete_completed_task_record(
    connection: &mut Connection,
    session_id: &str,
) -> Result<(), String> {
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    let exists: bool = transaction
        .query_row(
            "
            SELECT EXISTS(
                SELECT 1
                FROM task_sessions
                WHERE id = ?1 AND status = 'completed'
            )
            ",
            [session_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;

    if !exists {
        return Err("完成记录不存在或不能删除".to_string());
    }

    transaction
        .execute(
            "DELETE FROM reminder_events WHERE session_id = ?1",
            [session_id],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "DELETE FROM task_sessions WHERE id = ?1 AND status = 'completed'",
            [session_id],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_completed_task(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    let mut connection = database_connection(&state.database_path)?;
    delete_completed_task_record(&mut connection, &session_id)
}

fn validate_settings(settings: &AppSettings) -> Result<(), String> {
    if settings.default_planned_minutes == 0 || settings.default_planned_minutes > 1_440 {
        return Err("默认预计时间必须在 1 到 1440 分钟之间".to_string());
    }
    if settings.reminder_options.len() != 3 {
        return Err("请设置 3 个提醒延长选项".to_string());
    }
    if settings
        .reminder_options
        .iter()
        .any(|minutes| *minutes == 0 || *minutes > 1_440)
    {
        return Err("提醒延长时间必须在 1 到 1440 分钟之间".to_string());
    }
    let mut unique_options = settings.reminder_options.clone();
    unique_options.sort_unstable();
    unique_options.dedup();
    if unique_options.len() != settings.reminder_options.len() {
        return Err("提醒延长选项不能重复".to_string());
    }
    if !matches!(settings.theme.as_str(), "system" | "light" | "dark") {
        return Err("不支持的主题设置".to_string());
    }
    Ok(())
}

fn load_settings(connection: &Connection) -> Result<AppSettings, String> {
    let mut statement = connection
        .prepare("SELECT key, value FROM app_settings")
        .map_err(|error| error.to_string())?;
    let values = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<HashMap<_, _>, _>>()
        .map_err(|error| error.to_string())?;

    let defaults = AppSettings::default();
    let settings = AppSettings {
        default_planned_minutes: values
            .get("default_planned_minutes")
            .and_then(|value| value.parse().ok())
            .unwrap_or(defaults.default_planned_minutes),
        reminder_options: values
            .get("reminder_options")
            .map(|value| {
                value
                    .split(',')
                    .filter_map(|item| item.parse().ok())
                    .collect()
            })
            .filter(|options: &Vec<u32>| !options.is_empty())
            .unwrap_or(defaults.reminder_options),
        always_on_top: values
            .get("always_on_top")
            .and_then(|value| value.parse().ok())
            .unwrap_or(defaults.always_on_top),
        theme: values.get("theme").cloned().unwrap_or(defaults.theme),
    };

    validate_settings(&settings)?;
    Ok(settings)
}

fn persist_settings(
    connection: &mut Connection,
    settings: &AppSettings,
) -> Result<AppSettings, String> {
    validate_settings(settings)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    let values = [
        (
            "default_planned_minutes",
            settings.default_planned_minutes.to_string(),
        ),
        (
            "reminder_options",
            settings
                .reminder_options
                .iter()
                .map(u32::to_string)
                .collect::<Vec<_>>()
                .join(","),
        ),
        ("always_on_top", settings.always_on_top.to_string()),
        ("theme", settings.theme.clone()),
    ];

    for (key, value) in values {
        transaction
            .execute(
                "
                INSERT INTO app_settings (key, value)
                VALUES (?1, ?2)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                ",
                params![key, value],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(settings.clone())
}

#[tauri::command]
fn get_app_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let connection = database_connection(&state.database_path)?;
    load_settings(&connection)
}

#[tauri::command]
fn save_app_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    let mut connection = database_connection(&state.database_path)?;
    let saved = persist_settings(&mut connection, &settings)?;
    if let Some(window) = app.get_webview_window("reminder") {
        window
            .set_always_on_top(saved.always_on_top)
            .map_err(|error| error.to_string())?;
    }
    Ok(saved)
}

fn write_markdown_export(directory: &Path, date: &str, content: &str) -> Result<PathBuf, String> {
    if date.len() != 10
        || !date
            .chars()
            .enumerate()
            .all(|(index, character)| match index {
                4 | 7 => character == '-',
                _ => character.is_ascii_digit(),
            })
    {
        return Err("无效的导出日期".to_string());
    }
    if content.len() > 1_000_000 {
        return Err("导出内容过大".to_string());
    }

    let export_path = directory.join(format!("done-log-{date}.md"));
    fs::write(&export_path, content).map_err(|error| error.to_string())?;
    Ok(export_path)
}

#[tauri::command]
fn save_markdown_export(app: AppHandle, date: String, content: String) -> Result<String, String> {
    let download_directory = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?;
    write_markdown_export(&download_directory, &date, &content)
        .map(|path| path.to_string_lossy().into_owned())
}

fn complete_task_record(
    connection: &Connection,
    session_id: &str,
    note: &str,
    record_skipped: bool,
    ended_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
) -> Result<TaskSession, String> {
    let normalized_note = note.trim().to_string();
    let changed = connection
        .execute(
            "
            UPDATE task_sessions
            SET ended_at = ?1,
                status = 'completed',
                note = ?2,
                record_skipped = ?3,
                updated_at = ?4
            WHERE id = ?5 AND status = 'running'
            ",
            params![
                to_iso(ended_at),
                normalized_note,
                if record_skipped { 1 } else { 0 },
                to_iso(updated_at),
                session_id,
            ],
        )
        .map_err(|error| error.to_string())?;

    if changed == 0 {
        return Err("任务不存在或已经结束".to_string());
    }

    get_session(connection, session_id)
}

#[tauri::command]
fn complete_task(
    state: State<'_, AppState>,
    session_id: String,
    note: String,
    record_skipped: bool,
    ended_at: i64,
) -> Result<TaskSession, String> {
    let ended_at = DateTime::from_timestamp_millis(ended_at)
        .ok_or_else(|| "无效的任务结束时间".to_string())?;
    let connection = database_connection(&state.database_path)?;
    complete_task_record(
        &connection,
        &session_id,
        &note,
        record_skipped,
        ended_at,
        Utc::now(),
    )
}

fn discard_task_record(
    connection: &Connection,
    session_id: &str,
    now: DateTime<Utc>,
) -> Result<(), String> {
    let now = to_iso(now);
    let changed = connection
        .execute(
            "
            UPDATE task_sessions
            SET ended_at = ?1, status = 'cancelled', updated_at = ?1
            WHERE id = ?2 AND status = 'running'
            ",
            params![now, session_id],
        )
        .map_err(|error| error.to_string())?;

    if changed == 0 {
        return Err("任务不存在或已经结束".to_string());
    }

    Ok(())
}

#[tauri::command]
fn discard_task(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    let connection = database_connection(&state.database_path)?;
    discard_task_record(&connection, &session_id, Utc::now())
}

fn record_reminder_action(
    connection: &mut Connection,
    context: &ReminderContext,
    action: &str,
    created_at: DateTime<Utc>,
) -> Result<Option<DateTime<Utc>>, String> {
    let extension_minutes = if action == "finish" {
        None
    } else {
        let minutes = action
            .strip_prefix("extend_")
            .and_then(|value| value.parse::<i64>().ok())
            .filter(|value| (1..=1_440).contains(value))
            .ok_or_else(|| "不支持的提醒操作".to_string())?;
        Some(minutes)
    };
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    let next_reminder_at = extension_minutes.map(|minutes| created_at + Duration::minutes(minutes));

    transaction
        .execute(
            "
            INSERT INTO reminder_events (
                id, session_id, triggered_at, elapsed_minutes,
                planned_minutes, action, created_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ",
            params![
                Uuid::new_v4().to_string(),
                context.session_id,
                to_iso(context.triggered_at),
                (context.elapsed_seconds / 60) as i64,
                context.planned_minutes,
                action,
                to_iso(created_at),
            ],
        )
        .map_err(|error| error.to_string())?;

    if let Some(next_reminder_at) = next_reminder_at {
        let changed = transaction
            .execute(
                "
                UPDATE task_sessions
                SET next_reminder_at = ?1, updated_at = ?2
                WHERE id = ?3 AND status = 'running'
                ",
                params![
                    to_iso(next_reminder_at),
                    to_iso(created_at),
                    context.session_id,
                ],
            )
            .map_err(|error| error.to_string())?;

        if changed == 0 {
            return Err("任务不存在或已经结束".to_string());
        }
    }

    transaction.commit().map_err(|error| error.to_string())?;
    Ok(next_reminder_at)
}

#[tauri::command]
fn show_reminder(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    task_title: String,
    planned_minutes: u32,
    elapsed_seconds: u64,
) -> Result<(), String> {
    let window = app
        .get_webview_window("reminder")
        .ok_or_else(|| "找不到提醒窗口".to_string())?;
    let connection = database_connection(&state.database_path)?;
    let settings = load_settings(&connection)?;

    {
        let mut context = state
            .reminder_context
            .lock()
            .map_err(|_| "无法锁定提醒状态".to_string())?;
        *context = Some(ReminderContext {
            session_id: session_id.clone(),
            triggered_at: Utc::now(),
            elapsed_seconds,
            planned_minutes,
        });
    }

    window
        .emit(
            "reminder-data",
            ReminderPayload {
                session_id,
                task_title,
                planned_minutes,
                elapsed_seconds,
                reminder_options: settings.reminder_options,
                theme: settings.theme,
            },
        )
        .map_err(|error| error.to_string())?;
    window
        .set_always_on_top(settings.always_on_top)
        .map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.center().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
fn hide_reminder(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let window = app
        .get_webview_window("reminder")
        .ok_or_else(|| "找不到提醒窗口".to_string())?;

    if let Ok(mut context) = state.reminder_context.lock() {
        *context = None;
    }

    window.hide().map_err(|error| error.to_string())
}

#[tauri::command]
fn submit_reminder_action(
    app: AppHandle,
    state: State<'_, AppState>,
    action: String,
) -> Result<(), String> {
    let context = state
        .reminder_context
        .lock()
        .map_err(|_| "无法锁定提醒状态".to_string())?
        .clone()
        .ok_or_else(|| "当前没有待处理的提醒".to_string())?;

    let mut connection = database_connection(&state.database_path)?;
    let created_at = Utc::now();
    let next_reminder_at = record_reminder_action(&mut connection, &context, &action, created_at)?;

    let main_window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    main_window
        .emit(
            "reminder-action",
            ReminderActionPayload {
                action,
                next_reminder_at: next_reminder_at.map(|value| value.timestamp_millis()),
            },
        )
        .map_err(|error| error.to_string())?;

    {
        let mut reminder_context = state
            .reminder_context
            .lock()
            .map_err(|_| "无法锁定提醒状态".to_string())?;
        *reminder_context = None;
    }

    app.get_webview_window("reminder")
        .ok_or_else(|| "找不到提醒窗口".to_string())?
        .hide()
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let database_path = app
                .path()
                .app_data_dir()
                .map_err(|error| std::io::Error::other(error.to_string()))?
                .join("focus_reminder.sqlite");
            initialize_database(&database_path).map_err(std::io::Error::other)?;
            app.manage(AppState {
                database_path,
                reminder_context: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_task,
            get_running_session,
            complete_task,
            discard_task,
            get_today_logs,
            delete_completed_task,
            get_app_settings,
            save_app_settings,
            save_markdown_export,
            show_reminder,
            hide_reminder,
            submit_reminder_action
        ])
        .run(tauri::generate_context!())
        .expect("error while running Focus Reminder");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary_database_path() -> PathBuf {
        std::env::temp_dir().join(format!("focus-reminder-{}.sqlite", Uuid::new_v4()))
    }

    #[test]
    fn persists_task_reminder_and_completion_lifecycle() {
        let database_path = temporary_database_path();
        initialize_database(&database_path).expect("database should initialize");
        let connection = database_connection(&database_path).expect("database should open");
        let started_at = Utc::now();
        let session = insert_task(&connection, "编写 MVP-2 测试".to_string(), 30, started_at)
            .expect("task should start");
        drop(connection);

        let mut connection = database_connection(&database_path).expect("database should reopen");
        let recovered = find_running_session(&connection)
            .expect("running task lookup should work")
            .expect("running task should persist");
        assert_eq!(recovered.id, session.id);

        let reminder_context = ReminderContext {
            session_id: session.id.clone(),
            triggered_at: started_at + Duration::minutes(30),
            elapsed_seconds: 30 * 60,
            planned_minutes: 30,
        };
        let extended_at = reminder_context.triggered_at;
        let next_reminder_at =
            record_reminder_action(&mut connection, &reminder_context, "extend_15", extended_at)
                .expect("reminder event should persist")
                .expect("extension should return next reminder");

        let updated_session =
            get_session(&connection, &session.id).expect("task should still exist");
        assert_eq!(
            updated_session.next_reminder_at,
            next_reminder_at.timestamp_millis()
        );

        let finish_context = ReminderContext {
            session_id: session.id.clone(),
            triggered_at: next_reminder_at,
            elapsed_seconds: 45 * 60,
            planned_minutes: 30,
        };
        let finish_result =
            record_reminder_action(&mut connection, &finish_context, "finish", next_reminder_at)
                .expect("finish event should persist");
        assert!(finish_result.is_none());

        let event_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM reminder_events WHERE session_id = ?1",
                [&session.id],
                |row| row.get(0),
            )
            .expect("event count should load");
        assert_eq!(event_count, 2);

        let ended_at = started_at + Duration::minutes(42);
        let completed = complete_task_record(
            &connection,
            &session.id,
            "完成 SQLite 生命周期",
            false,
            ended_at,
            ended_at,
        )
        .expect("task should complete");
        assert_eq!(completed.status, "completed");
        assert_eq!(completed.note.as_deref(), Some("完成 SQLite 生命周期"));
        assert!(!completed.record_skipped);
        assert_eq!(completed.ended_at, Some(ended_at.timestamp_millis()));

        drop(connection);
        let _ = fs::remove_file(database_path);
    }

    #[test]
    fn saves_skipped_completion_as_an_empty_record() {
        let database_path = temporary_database_path();
        initialize_database(&database_path).expect("database should initialize");
        let connection = database_connection(&database_path).expect("database should open");
        let started_at = Utc::now();
        let session = insert_task(&connection, String::new(), 30, started_at)
            .expect("unnamed task should start");
        let ended_at = started_at + Duration::minutes(5);
        let completed =
            complete_task_record(&connection, &session.id, "", true, ended_at, ended_at)
                .expect("skipped record should save");

        assert_eq!(completed.title, "未命名任务");
        assert_eq!(completed.note.as_deref(), Some(""));
        assert!(completed.record_skipped);

        drop(connection);
        let _ = fs::remove_file(database_path);
    }

    #[test]
    fn queries_completed_sessions_within_local_day_bounds() {
        let database_path = temporary_database_path();
        initialize_database(&database_path).expect("database should initialize");
        let connection = database_connection(&database_path).expect("database should open");
        let day_start = DateTime::parse_from_rfc3339("2026-06-08T16:00:00Z")
            .expect("date should parse")
            .with_timezone(&Utc);
        let first = insert_task(
            &connection,
            "整理今日记录".to_string(),
            30,
            day_start + Duration::hours(1),
        )
        .expect("first task should start");
        complete_task_record(
            &connection,
            &first.id,
            "完成今日记录",
            false,
            day_start + Duration::hours(1) + Duration::minutes(25),
            day_start + Duration::hours(1) + Duration::minutes(25),
        )
        .expect("first task should complete");

        let second = insert_task(
            &connection,
            "跨日任务".to_string(),
            15,
            day_start + Duration::hours(25),
        )
        .expect("second task should start");
        complete_task_record(
            &connection,
            &second.id,
            "不应出现在当天",
            false,
            day_start + Duration::hours(25) + Duration::minutes(10),
            day_start + Duration::hours(25) + Duration::minutes(10),
        )
        .expect("second task should complete");

        let sessions =
            find_completed_sessions(&connection, day_start, day_start + Duration::days(1))
                .expect("completed sessions should load");
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].id, first.id);

        drop(connection);
        let _ = fs::remove_file(database_path);
    }

    #[test]
    fn deletes_completed_session_and_its_reminder_events() {
        let database_path = temporary_database_path();
        initialize_database(&database_path).expect("database should initialize");
        let mut connection = database_connection(&database_path).expect("database should open");
        let started_at = Utc::now();
        let session = insert_task(&connection, "删除完成记录".to_string(), 30, started_at)
            .expect("task should start");
        let reminder_context = ReminderContext {
            session_id: session.id.clone(),
            triggered_at: started_at + Duration::minutes(30),
            elapsed_seconds: 30 * 60,
            planned_minutes: 30,
        };
        record_reminder_action(
            &mut connection,
            &reminder_context,
            "finish",
            reminder_context.triggered_at,
        )
        .expect("reminder event should save");
        complete_task_record(
            &connection,
            &session.id,
            "准备删除",
            false,
            started_at + Duration::minutes(30),
            started_at + Duration::minutes(30),
        )
        .expect("task should complete");

        delete_completed_task_record(&mut connection, &session.id)
            .expect("completed record should delete");

        let session_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM task_sessions WHERE id = ?1",
                [&session.id],
                |row| row.get(0),
            )
            .expect("session count should load");
        let event_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM reminder_events WHERE session_id = ?1",
                [&session.id],
                |row| row.get(0),
            )
            .expect("event count should load");
        assert_eq!(session_count, 0);
        assert_eq!(event_count, 0);

        let running_session = insert_task(
            &connection,
            "不能删除进行中任务".to_string(),
            15,
            Utc::now(),
        )
        .expect("running task should start");
        assert!(delete_completed_task_record(&mut connection, &running_session.id).is_err());
        assert_eq!(
            get_session(&connection, &running_session.id)
                .expect("running task should remain")
                .status,
            "running"
        );

        drop(connection);
        let _ = fs::remove_file(database_path);
    }

    #[test]
    fn persists_and_reloads_app_settings() {
        let database_path = temporary_database_path();
        initialize_database(&database_path).expect("database should initialize");
        let mut connection = database_connection(&database_path).expect("database should open");
        assert_eq!(
            load_settings(&connection).expect("defaults should load"),
            AppSettings::default()
        );

        let settings = AppSettings {
            default_planned_minutes: 45,
            reminder_options: vec![10, 20, 40],
            always_on_top: false,
            theme: "dark".to_string(),
        };
        persist_settings(&mut connection, &settings).expect("settings should save");
        drop(connection);

        let connection = database_connection(&database_path).expect("database should reopen");
        assert_eq!(
            load_settings(&connection).expect("saved settings should load"),
            settings
        );

        drop(connection);
        let _ = fs::remove_file(database_path);
    }

    #[test]
    fn writes_markdown_export_with_expected_filename() {
        let export_directory =
            std::env::temp_dir().join(format!("focus-reminder-export-{}", Uuid::new_v4()));
        fs::create_dir_all(&export_directory).expect("export directory should exist");
        let content = "# Done Log - 2026-06-09\n";

        let export_path = write_markdown_export(&export_directory, "2026-06-09", content)
            .expect("Markdown should export");

        assert_eq!(
            export_path.file_name().and_then(|name| name.to_str()),
            Some("done-log-2026-06-09.md")
        );
        assert_eq!(
            fs::read_to_string(&export_path).expect("export should be readable"),
            content
        );

        let _ = fs::remove_dir_all(export_directory);
    }
}
