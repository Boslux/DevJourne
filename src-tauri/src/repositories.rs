use crate::*;
use chrono::Utc;
pub async fn list_projects(
    pool: &SqlitePool,
    include_archived: bool,
) -> Result<Vec<Project>, AppError> {
    let query = if include_archived {
        "SELECT id, name, summary, is_archived, created_at, updated_at, icon_key FROM projects ORDER BY is_archived ASC, updated_at DESC"
    } else {
        "SELECT id, name, summary, is_archived, created_at, updated_at, icon_key FROM projects WHERE is_archived = 0 ORDER BY updated_at DESC"
    };
    let rows = sqlx::query_as::<
        _,
        (
            String,
            String,
            Option<String>,
            i64,
            String,
            String,
            Option<String>,
        ),
    >(query)
    .fetch_all(pool)
    .await?;

    rows.into_iter()
        .map(
            |(id, name, summary, is_archived, created_at, updated_at, icon_key)| {
                Ok(Project {
                    id: Uuid::parse_str(&id).map_err(|_| AppError::Database)?,
                    name,
                    summary,
                    icon_key,
                    is_archived: is_archived != 0,
                    created_at,
                    updated_at,
                })
            },
        )
        .collect()
}
pub async fn create_project(
    pool: &SqlitePool,
    request: CreateProjectRequest,
) -> Result<Project, AppError> {
    let (name, summary) = (request.name, request.summary);

    let id = Uuid::new_v4();
    let timestamp = Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO projects (id, name, summary, created_at, updated_at, icon_key) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(id.to_string())
    .bind(&name)
    .bind(summary.as_deref())
    .bind(&timestamp)
    .bind(&timestamp)
    .bind(&request.icon_key)
    .execute(pool)
    .await?;

    Ok(Project {
        id,
        name,
        summary,
        icon_key: request.icon_key,
        is_archived: false,
        created_at: timestamp.clone(),
        updated_at: timestamp,
    })
}
pub async fn update_project(
    pool: &SqlitePool,
    request: UpdateProjectRequest,
) -> Result<Project, AppError> {
    let (name, summary) = (request.name, request.summary);

    let timestamp = Utc::now().to_rfc3339();
    let result = sqlx::query(
        "UPDATE projects SET name = ?, summary = ?, updated_at = ?, icon_key = ? WHERE id = ?",
    )
    .bind(&name)
    .bind(summary.as_deref())
    .bind(&timestamp)
    .bind(&request.icon_key)
    .bind(request.id.to_string())
    .execute(pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::ProjectNotFound);
    }
    fetch_project(pool, request.id).await
}
pub async fn archive_project(
    pool: &SqlitePool,
    id: Uuid,
    archived: bool,
) -> Result<Project, AppError> {
    let timestamp = Utc::now().to_rfc3339();
    let result = sqlx::query("UPDATE projects SET is_archived = ?, updated_at = ? WHERE id = ?")
        .bind(i64::from(archived))
        .bind(&timestamp)
        .bind(id.to_string())
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::ProjectNotFound);
    }
    fetch_project(pool, id).await
}
pub async fn delete_project(pool: &SqlitePool, id: Uuid) -> Result<(), AppError> {
    let result = sqlx::query("DELETE FROM projects WHERE id = ?")
        .bind(id.to_string())
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::ProjectNotFound);
    }
    Ok(())
}
pub async fn update_task_state(
    pool: &SqlitePool,
    request: UpdateTaskStateRequest,
) -> Result<Task, AppError> {
    fetch_project(pool, request.project_id).await?;
    let (status, priority) = (request.status, request.priority);
    let timestamp = Utc::now().to_rfc3339();
    let result = sqlx::query(
        "UPDATE tasks SET status = ?, priority = ?, updated_at = ? WHERE id = ? AND project_id = ?",
    )
    .bind(&status)
    .bind(&priority)
    .bind(&timestamp)
    .bind(request.id.to_string())
    .bind(request.project_id.to_string())
    .execute(pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::TaskNotFound);
    }
    fetch_task(pool, request.id, request.project_id).await
}
pub async fn list_members(pool: &SqlitePool, project_id: Uuid) -> Result<Vec<Member>, AppError> {
    let rows = sqlx::query_as::<_, (String, String, String, String, i64, String, String)>(
        "SELECT id, project_id, name, avatar_key, is_active, created_at, updated_at FROM members WHERE project_id = ? ORDER BY is_active DESC, name COLLATE NOCASE ASC",
    )
    .bind(project_id.to_string())
    .fetch_all(pool)
    .await?;
    rows.into_iter().map(member_from_row).collect()
}
pub async fn create_member(
    pool: &SqlitePool,
    request: CreateMemberRequest,
) -> Result<Member, AppError> {
    let (name, avatar_key) = (request.name, request.avatar_key);
    let id = Uuid::new_v4();
    let timestamp = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO members (id, project_id, name, avatar_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id.to_string()).bind(request.project_id.to_string()).bind(&name)
        .bind(&avatar_key).bind(&timestamp).bind(&timestamp).execute(pool).await?;
    Ok(Member {
        id,
        project_id: request.project_id,
        name,
        avatar_key,
        is_active: true,
        created_at: timestamp.clone(),
        updated_at: timestamp,
    })
}
pub async fn update_member(
    pool: &SqlitePool,
    request: UpdateMemberRequest,
) -> Result<Member, AppError> {
    let (name, avatar_key) = (request.name, request.avatar_key);
    let timestamp = Utc::now().to_rfc3339();
    let result = sqlx::query("UPDATE members SET name = ?, avatar_key = ?, updated_at = ? WHERE id = ? AND project_id = ?")
        .bind(&name).bind(&avatar_key).bind(&timestamp).bind(request.id.to_string())
        .bind(request.project_id.to_string()).execute(pool).await?;
    if result.rows_affected() == 0 {
        return Err(AppError::ProjectNotFound);
    }
    fetch_member(pool, request.id, request.project_id).await
}
pub async fn set_member_active(
    pool: &SqlitePool,
    id: Uuid,
    project_id: Uuid,
    active: bool,
) -> Result<Member, AppError> {
    let timestamp = Utc::now().to_rfc3339();
    let result = sqlx::query(
        "UPDATE members SET is_active = ?, updated_at = ? WHERE id = ? AND project_id = ?",
    )
    .bind(i64::from(active))
    .bind(&timestamp)
    .bind(id.to_string())
    .bind(project_id.to_string())
    .execute(pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::ProjectNotFound);
    }
    fetch_member(pool, id, project_id).await
}
pub(crate) async fn fetch_project(pool: &SqlitePool, id: Uuid) -> Result<Project, AppError> {
    let row = sqlx::query_as::<_, (String, String, Option<String>, i64, String, String, Option<String>)>(
        "SELECT id, name, summary, is_archived, created_at, updated_at, icon_key FROM projects WHERE id = ?",
    )
    .bind(id.to_string())
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::ProjectNotFound)?;
    Ok(Project {
        id,
        name: row.1,
        summary: row.2,
        icon_key: row.6,
        is_archived: row.3 != 0,
        created_at: row.4,
        updated_at: row.5,
    })
}
pub(crate) async fn fetch_task(
    pool: &SqlitePool,
    id: Uuid,
    project_id: Uuid,
) -> Result<Task, AppError> {
    let row = sqlx::query_as::<_, (String, String, String, Option<String>, String, String, i64, String, String)>(
        "SELECT id, project_id, title, description, status, priority, position, created_at, updated_at FROM tasks WHERE id = ? AND project_id = ?",
    )
    .bind(id.to_string())
    .bind(project_id.to_string())
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::TaskNotFound)?;
    task_from_row(row)
}
pub(crate) async fn fetch_member(
    pool: &SqlitePool,
    id: Uuid,
    project_id: Uuid,
) -> Result<Member, AppError> {
    let row = sqlx::query_as::<_, (String, String, String, String, i64, String, String)>(
        "SELECT id, project_id, name, avatar_key, is_active, created_at, updated_at FROM members WHERE id = ? AND project_id = ?",
    ).bind(id.to_string()).bind(project_id.to_string()).fetch_optional(pool).await?
        .ok_or(AppError::ProjectNotFound)?;
    member_from_row(row)
}
pub(crate) fn task_from_row(
    row: (
        String,
        String,
        String,
        Option<String>,
        String,
        String,
        i64,
        String,
        String,
    ),
) -> Result<Task, AppError> {
    Ok(Task {
        id: Uuid::parse_str(&row.0).map_err(|_| AppError::Database)?,
        project_id: Uuid::parse_str(&row.1).map_err(|_| AppError::Database)?,
        title: row.2,
        description: row.3,
        status: row.4,
        priority: row.5,
        position: row.6,
        created_at: row.7,
        updated_at: row.8,
    })
}
pub(crate) fn member_from_row(
    row: (String, String, String, String, i64, String, String),
) -> Result<Member, AppError> {
    Ok(Member {
        id: Uuid::parse_str(&row.0).map_err(|_| AppError::Database)?,
        project_id: Uuid::parse_str(&row.1).map_err(|_| AppError::Database)?,
        name: row.2,
        avatar_key: row.3,
        is_active: row.4 != 0,
        created_at: row.5,
        updated_at: row.6,
    })
}
