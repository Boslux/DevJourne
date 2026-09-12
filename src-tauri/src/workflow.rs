#[path = "workflow_repository.rs"]
pub mod repository;
#[path = "workflow_service.rs"]
pub mod service;
use crate::{AppError, AppState};
use chrono::{NaiveDate, Utc};
use serde::{Deserialize, Serialize};
pub use service::save;
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(deny_unknown_fields)]
pub struct WorkTask {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: String,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
    pub assigned_member_id: Option<String>,
    pub milestone_id: Option<String>,
    pub due_at: Option<String>,
    pub tags_json: String,
    pub is_archived: bool,
    pub completed_at: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(deny_unknown_fields)]
pub struct Milestone {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub is_closed: bool,
    pub created_at: String,
}
#[derive(Serialize, FromRow)]
pub struct MilestoneProgress {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub is_closed: bool,
    pub created_at: String,
    pub total: i64,
    pub completed: i64,
}
#[derive(Debug, Serialize, Deserialize, FromRow)]
#[serde(deny_unknown_fields)]
pub struct Activity {
    pub id: i64,
    pub project_id: String,
    pub entity_id: String,
    pub activity_type: String,
    pub created_at: String,
}
#[derive(Debug, Deserialize)]
pub struct TaskFilter {
    pub project_id: Uuid,
    pub search: String,
    pub status: Option<String>,
    pub member_id: Option<Uuid>,
    pub archived: bool,
    pub offset: i64,
}
#[derive(Serialize)]
pub struct TaskPage {
    pub tasks: Vec<WorkTask>,
    pub total: i64,
    pub completed: i64,
    pub project_total: i64,
}
#[derive(Debug, Deserialize)]
pub struct TaskDetails {
    pub assigned_member_id: Option<Uuid>,
    pub milestone_id: Option<Uuid>,
    pub due_at: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Deserialize)]
pub struct SaveTask {
    pub id: Option<Uuid>,
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: String,
    pub assigned_member_id: Option<Uuid>,
    pub milestone_id: Option<Uuid>,
    pub due_at: Option<String>,
    pub tags: Vec<String>,
}

#[tauri::command]
pub async fn save_work_task(
    state: tauri::State<'_, AppState>,
    request: SaveTask,
) -> Result<WorkTask, AppError> {
    save(&state.pool, request).await
}

#[tauri::command]
pub async fn task_page(
    state: tauri::State<'_, AppState>,
    filter: TaskFilter,
) -> Result<TaskPage, AppError> {
    repository::page(&state.pool, filter).await
}

#[tauri::command]
pub async fn move_task(
    state: tauri::State<'_, AppState>,
    project_id: Uuid,
    id: Uuid,
    direction: i64,
) -> Result<(), AppError> {
    service::move_task(&state.pool, project_id, id, direction).await
}
#[tauri::command]
pub async fn archive_task(
    state: tauri::State<'_, AppState>,
    project_id: Uuid,
    id: Uuid,
    archived: bool,
) -> Result<(), AppError> {
    service::archive(&state.pool, project_id, id, archived).await
}
#[tauri::command]
pub async fn delete_task(
    state: tauri::State<'_, AppState>,
    project_id: Uuid,
    id: Uuid,
) -> Result<(), AppError> {
    service::delete(&state.pool, project_id, id).await
}
#[tauri::command]
pub async fn list_milestones(
    state: tauri::State<'_, AppState>,
    project_id: Uuid,
) -> Result<Vec<MilestoneProgress>, AppError> {
    repository::milestones(&state.pool, project_id).await
}
#[tauri::command]
pub async fn create_milestone(
    state: tauri::State<'_, AppState>,
    project_id: Uuid,
    name: String,
) -> Result<(), AppError> {
    service::milestone(&state.pool, project_id, name).await
}
#[tauri::command]
pub async fn close_milestone(
    state: tauri::State<'_, AppState>,
    project_id: Uuid,
    id: Uuid,
    closed: bool,
) -> Result<(), AppError> {
    service::close_milestone(&state.pool, project_id, id, closed).await
}
#[tauri::command]
pub async fn list_activity(
    state: tauri::State<'_, AppState>,
    project_id: Uuid,
    offset: i64,
) -> Result<Vec<Activity>, AppError> {
    repository::activity(&state.pool, project_id, offset).await
}
