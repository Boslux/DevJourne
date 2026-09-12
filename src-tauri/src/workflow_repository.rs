use super::*;

pub async fn task(pool: &SqlitePool, id: Uuid, project: Uuid) -> Result<WorkTask, AppError> {
    sqlx::query_as("SELECT id,project_id,title,description,status,priority,position,created_at,updated_at,assigned_member_id,milestone_id,due_at,tags_json,is_archived,completed_at FROM tasks WHERE id=? AND project_id=?")
            .bind(id.to_string()).bind(project.to_string()).fetch_optional(pool).await?.ok_or(AppError::TaskNotFound)
}
pub async fn page(pool: &SqlitePool, filter: TaskFilter) -> Result<TaskPage, AppError> {
    if filter.search.chars().count() > 200
        || filter.offset < 0
        || filter
            .status
            .as_ref()
            .is_some_and(|s| !crate::TASK_STATUSES.contains(&s.as_str()))
    {
        return Err(AppError::InvalidInput);
    }
    let project = filter.project_id.to_string();
    let member = filter.member_id.map(|id| id.to_string());
    let search = filter.search.trim();
    let tasks = sqlx::query_as("SELECT id,project_id,title,description,status,priority,position,created_at,updated_at,assigned_member_id,milestone_id,due_at,tags_json,is_archived,completed_at FROM tasks WHERE project_id=? AND is_archived=? AND (? IS NULL OR status=?) AND (? IS NULL OR assigned_member_id=?) AND (instr(lower(title),lower(?))>0 OR instr(lower(COALESCE(description,'')),lower(?))>0 OR instr(lower(tags_json),lower(?))>0) ORDER BY position,id LIMIT 100 OFFSET ?")
            .bind(&project).bind(filter.archived).bind(&filter.status).bind(&filter.status).bind(&member).bind(&member).bind(search).bind(search).bind(search).bind(filter.offset).fetch_all(pool).await?;
    let total = sqlx::query_scalar("SELECT COUNT(*) FROM tasks WHERE project_id=? AND is_archived=? AND (? IS NULL OR status=?) AND (? IS NULL OR assigned_member_id=?) AND (instr(lower(title),lower(?))>0 OR instr(lower(COALESCE(description,'')),lower(?))>0 OR instr(lower(tags_json),lower(?))>0)")
            .bind(&project).bind(filter.archived).bind(&filter.status).bind(&filter.status).bind(&member).bind(&member).bind(search).bind(search).bind(search).fetch_one(pool).await?;
    let (project_total,completed) = sqlx::query_as::<_,(i64,i64)>("SELECT COUNT(*), COALESCE(SUM(status='done'),0) FROM tasks WHERE project_id=? AND is_archived=0").bind(&project).fetch_one(pool).await?;
    Ok(TaskPage {
        tasks,
        total,
        completed,
        project_total,
    })
}
pub async fn milestones(
    pool: &SqlitePool,
    project: Uuid,
) -> Result<Vec<MilestoneProgress>, AppError> {
    Ok(sqlx::query_as("SELECT m.id,m.project_id,m.name,m.is_closed,m.created_at,COUNT(t.id) AS total,COALESCE(SUM(t.status='done'),0) AS completed FROM milestones m LEFT JOIN tasks t ON t.milestone_id=m.id AND t.is_archived=0 WHERE m.project_id=? GROUP BY m.id ORDER BY m.created_at,m.id").bind(project.to_string()).fetch_all(pool).await?)
}
pub async fn activity(
    pool: &SqlitePool,
    project: Uuid,
    offset: i64,
) -> Result<Vec<Activity>, AppError> {
    if offset < 0 {
        return Err(AppError::InvalidInput);
    }
    Ok(sqlx::query_as("SELECT id,project_id,entity_id,activity_type,created_at FROM activity_log WHERE project_id=? ORDER BY id DESC LIMIT 100 OFFSET ?").bind(project.to_string()).bind(offset).fetch_all(pool).await?)
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
    let mut tx = pool.begin().await?;
    // Acquire the write lock before reading ranks so concurrent moves serialize.
    sqlx::query("UPDATE tasks SET position=position WHERE id=? AND project_id=?")
        .bind(id.to_string())
        .bind(project.to_string())
        .execute(&mut *tx)
        .await?;
    let task = sqlx::query_as::<_, (String, i64)>(
        "SELECT id,position FROM tasks WHERE id=? AND project_id=? AND is_archived=0",
    )
    .bind(id.to_string())
    .bind(project.to_string())
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(AppError::TaskNotFound)?;
    let neighbor = if direction < 0 {
        sqlx::query_as::<_, (String, i64)>(
            "SELECT id,position FROM tasks WHERE project_id=? AND is_archived=0 AND (position<? OR (position=? AND id<?)) ORDER BY position DESC,id DESC LIMIT 1",
        )
        .bind(project.to_string())
        .bind(task.1)
        .bind(task.1)
        .bind(&task.0)
        .fetch_optional(&mut *tx)
        .await?
    } else {
        sqlx::query_as::<_, (String, i64)>(
            "SELECT id,position FROM tasks WHERE project_id=? AND is_archived=0 AND (position>? OR (position=? AND id>?)) ORDER BY position,id LIMIT 1",
        )
        .bind(project.to_string())
        .bind(task.1)
        .bind(task.1)
        .bind(&task.0)
        .fetch_optional(&mut *tx)
        .await?
    };
    if let Some(neighbor) = neighbor {
        sqlx::query("UPDATE tasks SET position=CASE WHEN id=? THEN ? WHEN id=? THEN ? END WHERE project_id=? AND id IN (?,?)")
            .bind(&task.0)
            .bind(neighbor.1)
            .bind(&neighbor.0)
            .bind(task.1)
            .bind(project.to_string())
            .bind(&task.0)
            .bind(&neighbor.0)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}
pub async fn archive(
    pool: &SqlitePool,
    project: Uuid,
    id: Uuid,
    archived: bool,
) -> Result<(), AppError> {
    let result =
        sqlx::query("UPDATE tasks SET is_archived=?,updated_at=? WHERE id=? AND project_id=?")
            .bind(archived)
            .bind(Utc::now().to_rfc3339())
            .bind(id.to_string())
            .bind(project.to_string())
            .execute(pool)
            .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::TaskNotFound);
    }
    Ok(())
}
pub async fn delete(pool: &SqlitePool, project: Uuid, id: Uuid) -> Result<(), AppError> {
    let result = sqlx::query("DELETE FROM tasks WHERE id=? AND project_id=?")
        .bind(id.to_string())
        .bind(project.to_string())
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::TaskNotFound);
    }
    Ok(())
}
pub async fn milestone(pool: &SqlitePool, project: Uuid, name: String) -> Result<(), AppError> {
    if !crate::valid_length(&name, 1, 120) {
        return Err(AppError::InvalidInput);
    }
    sqlx::query("INSERT INTO milestones(id,project_id,name,created_at) VALUES(?,?,?,?)")
        .bind(Uuid::new_v4().to_string())
        .bind(project.to_string())
        .bind(name.trim())
        .bind(Utc::now().to_rfc3339())
        .execute(pool)
        .await?;
    Ok(())
}
pub async fn close_milestone(
    pool: &SqlitePool,
    project: Uuid,
    id: Uuid,
    closed: bool,
) -> Result<(), AppError> {
    let result=sqlx::query("UPDATE milestones SET is_closed=? WHERE id=? AND project_id=? AND (?=0 OR NOT EXISTS(SELECT 1 FROM tasks WHERE milestone_id=? AND is_archived=0 AND status<>'done'))").bind(closed).bind(id.to_string()).bind(project.to_string()).bind(closed).bind(id.to_string()).execute(pool).await?;
    if result.rows_affected() == 0 {
        return Err(AppError::InvalidInput);
    }
    Ok(())
}

pub async fn save(pool: &SqlitePool, request: SaveTask) -> Result<WorkTask, AppError> {
    let (title, description) = crate::validate_task_fields(request.title, request.description)?;
    let (status, priority) = crate::validate_task_state(request.status, request.priority)?;
    let id = request.id.unwrap_or_else(Uuid::new_v4);
    let details = TaskDetails {
        assigned_member_id: request.assigned_member_id,
        milestone_id: request.milestone_id,
        due_at: request.due_at,
        tags: request.tags,
    };
    service::validate_details(&details)?;
    let mut tx = pool.begin().await?;
    let project = request.project_id.to_string();
    let now = Utc::now().to_rfc3339();
    // Serialize with member/milestone edits before checking cross-project ownership.
    sqlx::query("UPDATE projects SET updated_at=updated_at WHERE id=?")
        .bind(&project)
        .execute(&mut *tx)
        .await?;
    if let Some(member) = details.assigned_member_id {
        let valid:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM members WHERE id=? AND project_id=? AND (is_active=1 OR id=(SELECT assigned_member_id FROM tasks WHERE id=? AND project_id=?)))").bind(member.to_string()).bind(&project).bind(id.to_string()).bind(&project).fetch_one(&mut *tx).await?;
        if !valid {
            return Err(AppError::InvalidInput);
        }
    }
    if let Some(milestone) = details.milestone_id {
        let valid:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM milestones WHERE id=? AND project_id=? AND (is_closed=0 OR id=(SELECT milestone_id FROM tasks WHERE id=? AND project_id=?)))").bind(milestone.to_string()).bind(&project).bind(id.to_string()).bind(&project).fetch_one(&mut *tx).await?;
        if !valid {
            return Err(AppError::InvalidInput);
        }
    }
    if request.id.is_some() {
        let result=sqlx::query("UPDATE tasks SET title=?,description=?,status=?,priority=?,updated_at=? WHERE id=? AND project_id=?").bind(title).bind(description).bind(&status).bind(priority).bind(&now).bind(id.to_string()).bind(&project).execute(&mut *tx).await?;
        if result.rows_affected() == 0 {
            return Err(AppError::TaskNotFound);
        }
    } else {
        sqlx::query("INSERT INTO tasks(id,project_id,title,description,status,priority,position,created_at,updated_at,completed_at) VALUES(?,?,?,?,?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM tasks WHERE project_id=?),?,?,?)").bind(id.to_string()).bind(&project).bind(title).bind(description).bind(&status).bind(priority).bind(&project).bind(&now).bind(&now).bind(if status=="done" {Some(&now)} else {None}).execute(&mut *tx).await?;
    }
    let tags = serde_json::to_string(&details.tags.iter().map(|t| t.trim()).collect::<Vec<_>>())
        .map_err(|_| AppError::InvalidInput)?;
    sqlx::query("UPDATE tasks SET assigned_member_id=?,milestone_id=?,due_at=?,tags_json=? WHERE id=? AND project_id=?").bind(details.assigned_member_id.map(|id|id.to_string())).bind(details.milestone_id.map(|id|id.to_string())).bind(details.due_at).bind(tags).bind(id.to_string()).bind(&project).execute(&mut *tx).await?;
    tx.commit().await?;
    task(pool, id, request.project_id).await
}
