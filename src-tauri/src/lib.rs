use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use chrono::{DateTime, Duration, SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Serialize;
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
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReminderActionPayload {
    action: String,
    next_reminder_at: Option<i64>,
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
    let extension_minutes = match action {
        "extend_5" => Some(5),
        "extend_15" => Some(15),
        "extend_30" => Some(30),
        "finish" => None,
        _ => return Err("不支持的提醒操作".to_string()),
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
}
