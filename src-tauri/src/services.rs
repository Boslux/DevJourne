use crate::*;
pub async fn list_projects(
    pool: &SqlitePool,
    include_archived: bool,
) -> Result<Vec<Project>, AppError> {
    repositories::list_projects(pool, include_archived).await
}
pub async fn create_project(
    pool: &SqlitePool,
    mut request: CreateProjectRequest,
) -> Result<Project, AppError> {
    let (name, summary) = validate_project_fields(request.name.clone(), request.summary.clone())?;
    validate_icon(request.icon_key.as_deref())?;
    request.name = name;
    request.summary = summary;
    repositories::create_project(pool, request).await
}
pub async fn update_project(
    pool: &SqlitePool,
    mut request: UpdateProjectRequest,
) -> Result<Project, AppError> {
    let (name, summary) = validate_project_fields(request.name.clone(), request.summary.clone())?;
    validate_icon(request.icon_key.as_deref())?;
    request.name = name;
    request.summary = summary;
    repositories::update_project(pool, request).await
}
pub async fn archive_project(
    pool: &SqlitePool,
    id: Uuid,
    archived: bool,
) -> Result<Project, AppError> {
    repositories::archive_project(pool, id, archived).await
}
pub async fn delete_project(pool: &SqlitePool, id: Uuid) -> Result<(), AppError> {
    repositories::delete_project(pool, id).await
}
pub async fn update_task_state(
    pool: &SqlitePool,
    request: UpdateTaskStateRequest,
) -> Result<Task, AppError> {
    validate_task_state(request.status.clone(), request.priority.clone())?;
    repositories::update_task_state(pool, request).await
}
pub async fn list_members(pool: &SqlitePool, project_id: Uuid) -> Result<Vec<Member>, AppError> {
    repositories::list_members(pool, project_id).await
}
pub async fn create_member(
    pool: &SqlitePool,
    mut request: CreateMemberRequest,
) -> Result<Member, AppError> {
    let (name, avatar) = validate_member_fields(request.name.clone(), request.avatar_key.clone())?;
    request.name = name;
    request.avatar_key = avatar;
    repositories::create_member(pool, request).await
}
pub async fn update_member(
    pool: &SqlitePool,
    mut request: UpdateMemberRequest,
) -> Result<Member, AppError> {
    let (name, avatar) = validate_member_fields(request.name.clone(), request.avatar_key.clone())?;
    request.name = name;
    request.avatar_key = avatar;
    repositories::update_member(pool, request).await
}
pub async fn set_member_active(
    pool: &SqlitePool,
    id: Uuid,
    project_id: Uuid,
    active: bool,
) -> Result<Member, AppError> {
    repositories::set_member_active(pool, id, project_id, active).await
}
