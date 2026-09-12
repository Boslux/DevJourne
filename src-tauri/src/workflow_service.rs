use super::*;

pub fn validate_details(details: &TaskDetails) -> Result<(), AppError> {
    if details.tags.len() > 10
        || details
            .tags
            .iter()
            .any(|tag| !crate::valid_length(tag, 1, 40))
        || details.due_at.as_ref().is_some_and(|date| {
            date.len() != 10 || NaiveDate::parse_from_str(date, "%Y-%m-%d").is_err()
        })
    {
        return Err(AppError::InvalidInput);
    }
    Ok(())
}

pub async fn save(pool: &SqlitePool, request: SaveTask) -> Result<WorkTask, AppError> {
    crate::validate_task_fields(request.title.clone(), request.description.clone())?;
    crate::validate_task_state(request.status.clone(), request.priority.clone())?;
    repository::save(pool, request).await
}
pub async fn move_task(
    pool: &SqlitePool,
    project: Uuid,
    id: Uuid,
    direction: i64,
) -> Result<(), AppError> {
    if direction != -1 && direction != 1 {
        return Err(AppError::InvalidInput);
    }
    repository::move_task(pool, project, id, direction).await
}
pub async fn archive(
    pool: &SqlitePool,
    project: Uuid,
    id: Uuid,
    archived: bool,
) -> Result<(), AppError> {
    repository::archive(pool, project, id, archived).await
}
pub async fn delete(pool: &SqlitePool, project: Uuid, id: Uuid) -> Result<(), AppError> {
    repository::delete(pool, project, id).await
}
pub async fn milestone(pool: &SqlitePool, project: Uuid, name: String) -> Result<(), AppError> {
    if !crate::valid_length(&name, 1, 120) {
        return Err(AppError::InvalidInput);
    }
    repository::milestone(pool, project, name).await
}
pub async fn close_milestone(
    pool: &SqlitePool,
    project: Uuid,
    id: Uuid,
    closed: bool,
) -> Result<(), AppError> {
    repository::close_milestone(pool, project, id, closed).await
}
