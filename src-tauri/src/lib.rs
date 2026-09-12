mod repositories;
mod services;
use repositories::{fetch_project, member_from_row};
mod backup;
mod preferences;
mod workflow;
#[cfg(test)]
mod workflow_tests;

use serde::{Deserialize, Serialize};
use sqlx::{
    migrate::Migrator,
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    SqlitePool,
};
use std::path::Path;
use tauri::Manager;
use uuid::Uuid;

static MIGRATOR: Migrator = sqlx::migrate!("../migrations");

#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AppError {
    InvalidInput,
    ProjectNotFound,
    TaskNotFound,
    Database,
}

impl From<sqlx::Error> for AppError {
    fn from(_: sqlx::Error) -> Self {
        Self::Database
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Project {
    pub id: Uuid,
    pub name: String,
    pub summary: Option<String>,
    pub icon_key: Option<String>,
    pub is_archived: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Member {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub avatar_key: String,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct Task {
    pub id: Uuid,
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: String,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateProjectRequest {
    pub name: String,
    pub summary: Option<String>,
    pub icon_key: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProjectRequest {
    pub id: Uuid,
    pub name: String,
    pub summary: Option<String>,
    pub icon_key: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateMemberRequest {
    pub project_id: Uuid,
    pub name: String,
    pub avatar_key: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMemberRequest {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub avatar_key: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTaskStateRequest {
    pub id: Uuid,
    pub project_id: Uuid,
    pub status: String,
    pub priority: String,
}

const AVATAR_KEYS: [&str; 4] = ["scout", "builder", "mage", "rogue"];
const TASK_STATUSES: [&str; 5] = ["todo", "in_progress", "review", "blocked", "done"];
const TASK_PRIORITIES: [&str; 4] = ["low", "normal", "high", "critical"];

fn validate_icon(icon: Option<&str>) -> Result<(), AppError> {
    if icon.is_some_and(|key| !["flag", "forest", "castle", "gem"].contains(&key)) {
        return Err(AppError::InvalidInput);
    }
    Ok(())
}
fn valid_length(value: &str, min: usize, max: usize) -> bool {
    let length = value.trim().chars().count();
    length >= min && length <= max
}

fn validate_member_fields(name: String, avatar_key: String) -> Result<(String, String), AppError> {
    let name = name.trim().to_owned();
    if !valid_length(&name, 1, 80) || !AVATAR_KEYS.contains(&avatar_key.as_str()) {
        return Err(AppError::InvalidInput);
    }
    Ok((name, avatar_key))
}

#[tauri::command]
async fn list_projects(
    state: tauri::State<'_, AppState>,
    include_archived: bool,
) -> Result<Vec<Project>, AppError> {
    services::list_projects(&state.pool, include_archived).await
}

fn validate_project_fields(
    name: String,
    summary: Option<String>,
) -> Result<(String, Option<String>), AppError> {
    let name = name.trim().to_owned();
    if !valid_length(&name, 1, 120) {
        return Err(AppError::InvalidInput);
    }
    let summary = summary.map(|value| value.trim().to_owned());
    if summary
        .as_ref()
        .is_some_and(|value| value.chars().count() > 500)
    {
        return Err(AppError::InvalidInput);
    }
    Ok((name, summary))
}

fn validate_task_fields(
    title: String,
    description: Option<String>,
) -> Result<(String, Option<String>), AppError> {
    let title = title.trim().to_owned();
    if !valid_length(&title, 1, 200) {
        return Err(AppError::InvalidInput);
    }
    let description = description.map(|value| value.trim().to_owned());
    if description
        .as_ref()
        .is_some_and(|value| value.chars().count() > 2000)
    {
        return Err(AppError::InvalidInput);
    }
    Ok((title, description))
}

fn validate_task_state(status: String, priority: String) -> Result<(String, String), AppError> {
    if !TASK_STATUSES.contains(&status.as_str()) || !TASK_PRIORITIES.contains(&priority.as_str()) {
        return Err(AppError::InvalidInput);
    }
    Ok((status, priority))
}

#[tauri::command]
async fn create_project(
    state: tauri::State<'_, AppState>,
    request: CreateProjectRequest,
) -> Result<Project, AppError> {
    services::create_project(&state.pool, request).await
}

#[tauri::command]
async fn update_project(
    state: tauri::State<'_, AppState>,
    request: UpdateProjectRequest,
) -> Result<Project, AppError> {
    services::update_project(&state.pool, request).await
}

#[tauri::command]
async fn archive_project(
    state: tauri::State<'_, AppState>,
    id: Uuid,
    archived: bool,
) -> Result<Project, AppError> {
    services::archive_project(&state.pool, id, archived).await
}

#[tauri::command]
async fn delete_project(state: tauri::State<'_, AppState>, id: Uuid) -> Result<(), AppError> {
    services::delete_project(&state.pool, id).await
}

#[tauri::command]
async fn update_task_state(
    state: tauri::State<'_, AppState>,
    request: UpdateTaskStateRequest,
) -> Result<Task, AppError> {
    services::update_task_state(&state.pool, request).await
}

#[tauri::command]
async fn list_members(
    state: tauri::State<'_, AppState>,
    project_id: Uuid,
) -> Result<Vec<Member>, AppError> {
    services::list_members(&state.pool, project_id).await
}

#[tauri::command]
async fn create_member(
    state: tauri::State<'_, AppState>,
    request: CreateMemberRequest,
) -> Result<Member, AppError> {
    services::create_member(&state.pool, request).await
}

#[tauri::command]
async fn update_member(
    state: tauri::State<'_, AppState>,
    request: UpdateMemberRequest,
) -> Result<Member, AppError> {
    services::update_member(&state.pool, request).await
}

#[tauri::command]
async fn set_member_active(
    state: tauri::State<'_, AppState>,
    id: Uuid,
    project_id: Uuid,
    active: bool,
) -> Result<Member, AppError> {
    services::set_member_active(&state.pool, id, project_id, active).await
}

async fn initialize_database(app_data_dir: &Path) -> Result<AppState, Box<dyn std::error::Error>> {
    tokio::fs::create_dir_all(app_data_dir).await?;
    let database_options = SqliteConnectOptions::new()
        .filename(app_data_dir.join("devquest.sqlite"))
        .create_if_missing(true)
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(database_options)
        .await?;
    MIGRATOR.run(&pool).await?;
    Ok(AppState { pool })
}

pub fn run() -> tauri::Result<()> {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| error.to_string())?;
            let state = tauri::async_runtime::block_on(initialize_database(&data_dir))
                .map_err(|error| error.to_string())?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_projects,
            preferences::get_effects,
            preferences::set_effects,
            create_project,
            update_project,
            archive_project,
            delete_project,
            list_members,
            create_member,
            update_member,
            set_member_active,
            workflow::save_work_task,
            workflow::task_page,
            workflow::move_task,
            workflow::archive_task,
            workflow::delete_task,
            workflow::list_milestones,
            workflow::create_milestone,
            workflow::close_milestone,
            workflow::list_activity,
            backup::export_project,
            backup::import_project,
            update_task_state
        ])
        .run(tauri::generate_context!())
}

#[cfg(test)]
mod tests {
    use super::{valid_length, validate_task_state, AppError};

    #[test]
    fn accepts_trimmed_project_name_within_limit() {
        assert!(valid_length("A game", 1, 120));
        assert!(valid_length("x".repeat(120).as_str(), 1, 120));
    }

    #[test]
    fn rejects_empty_or_oversized_values() {
        assert!(!valid_length("", 1, 120));
        assert!(!valid_length("   ", 1, 120));
        assert!(!valid_length("x".repeat(121).as_str(), 1, 120));
    }

    #[test]
    fn accepts_supported_task_state_values() {
        assert_eq!(
            validate_task_state("in_progress".to_owned(), "high".to_owned()).unwrap(),
            ("in_progress".to_owned(), "high".to_owned())
        );
    }

    #[test]
    fn rejects_unknown_task_state_values() {
        assert!(matches!(
            validate_task_state("working".to_owned(), "normal".to_owned()),
            Err(AppError::InvalidInput)
        ));
    }
}
