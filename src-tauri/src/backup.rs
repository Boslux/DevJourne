#[path = "backup_repository.rs"]
mod repository;
use crate::{
    workflow::{Activity, Milestone, WorkTask},
    AppError, AppState, Member, Project,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

pub const MAX_BACKUP_BYTES: usize = 10 * 1024 * 1024;
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Backup {
    format: String,
    schema_version: u32,
    exported_at: String,
    project: Project,
    members: Vec<Member>,
    milestones: Vec<Milestone>,
    tasks: Vec<WorkTask>,
    activity: Vec<Activity>,
}
fn timestamp(value: &str) -> bool {
    DateTime::parse_from_rfc3339(value).is_ok()
}
fn ids<'a>(values: impl Iterator<Item = &'a str>) -> Result<HashSet<String>, AppError> {
    let mut result = HashSet::new();
    for value in values {
        if Uuid::parse_str(value).is_err() || !result.insert(value.to_owned()) {
            return Err(AppError::InvalidInput);
        }
    }
    Ok(result)
}
pub fn validate(json: &str) -> Result<Backup, AppError> {
    if json.len() > MAX_BACKUP_BYTES {
        return Err(AppError::InvalidInput);
    }
    let backup: Backup = serde_json::from_str(json).map_err(|_| AppError::InvalidInput)?;
    if backup.format != "devquest-project"
        || backup.schema_version != 1
        || !timestamp(&backup.exported_at)
        || backup.members.len() > 1000
        || backup.milestones.len() > 1000
        || backup.tasks.len() > 20000
        || backup.activity.len() > 50000
    {
        return Err(AppError::InvalidInput);
    }
    crate::validate_project_fields(backup.project.name.clone(), backup.project.summary.clone())?;
    if !timestamp(&backup.project.created_at) || !timestamp(&backup.project.updated_at) {
        return Err(AppError::InvalidInput);
    }
    crate::validate_icon(backup.project.icon_key.as_deref())?;
    let project = backup.project.id.to_string();
    let member_strings: Vec<String> = backup.members.iter().map(|m| m.id.to_string()).collect();
    let members = ids(member_strings.iter().map(String::as_str))?;
    let milestones = ids(backup.milestones.iter().map(|m| m.id.as_str()))?;
    ids(backup.tasks.iter().map(|t| t.id.as_str()))?;
    for member in &backup.members {
        crate::validate_member_fields(member.name.clone(), member.avatar_key.clone())?;
        if member.project_id != backup.project.id
            || !timestamp(&member.created_at)
            || !timestamp(&member.updated_at)
        {
            return Err(AppError::InvalidInput);
        }
    }
    for milestone in &backup.milestones {
        if milestone.project_id != project
            || !crate::valid_length(&milestone.name, 1, 120)
            || !timestamp(&milestone.created_at)
        {
            return Err(AppError::InvalidInput);
        }
    }
    for task in &backup.tasks {
        crate::validate_task_fields(task.title.clone(), task.description.clone())?;
        crate::validate_task_state(task.status.clone(), task.priority.clone())?;
        let tags: Vec<String> =
            serde_json::from_str(&task.tags_json).map_err(|_| AppError::InvalidInput)?;
        crate::workflow::service::validate_details(&crate::workflow::TaskDetails {
            assigned_member_id: None,
            milestone_id: None,
            due_at: task.due_at.clone(),
            tags,
        })?;
        if task.project_id != project
            || task.position < 0
            || !timestamp(&task.created_at)
            || !timestamp(&task.updated_at)
            || task.completed_at.as_ref().is_some_and(|s| !timestamp(s))
            || (task.status == "done") != task.completed_at.is_some()
            || task
                .assigned_member_id
                .as_ref()
                .is_some_and(|id| !members.contains(id))
            || task
                .milestone_id
                .as_ref()
                .is_some_and(|id| !milestones.contains(id))
        {
            return Err(AppError::InvalidInput);
        }
    }
    let mut activity_ids = HashSet::new();
    for activity in &backup.activity {
        if !activity_ids.insert(activity.id)
            || activity.project_id != project
            || Uuid::parse_str(&activity.entity_id).is_err()
            || !timestamp(&activity.created_at)
            || ![
                "task_created",
                "task_completed",
                "task_reopened",
                "status_changed",
                "assignee_changed",
                "task_archived",
                "task_restored",
                "task_deleted",
                "milestone_completed",
                "milestone_reopened",
            ]
            .contains(&activity.activity_type.as_str())
        {
            return Err(AppError::InvalidInput);
        }
    }
    Ok(backup)
}

pub async fn export(pool: &SqlitePool, project_id: Uuid) -> Result<String, AppError> {
    repository::export(pool, project_id).await
}
pub async fn import(pool: &SqlitePool, json: String) -> Result<Project, AppError> {
    let backup = validate(&json)?;
    repository::import(pool, backup).await
}
#[tauri::command]
pub async fn export_project(
    state: tauri::State<'_, AppState>,
    project_id: Uuid,
) -> Result<String, AppError> {
    export(&state.pool, project_id).await
}
#[tauri::command]
pub async fn import_project(
    state: tauri::State<'_, AppState>,
    json: String,
) -> Result<Project, AppError> {
    import(&state.pool, json).await
}
