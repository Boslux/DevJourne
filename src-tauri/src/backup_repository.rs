use super::*;
pub async fn export(pool: &SqlitePool, project_id: Uuid) -> Result<String, AppError> {
    let mut tx = pool.begin().await?;
    let p = sqlx::query_as::<_, (String, Option<String>, bool, String, String, Option<String>)>(
        "SELECT name,summary,is_archived,created_at,updated_at,icon_key FROM projects WHERE id=?",
    )
    .bind(project_id.to_string())
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(AppError::ProjectNotFound)?;
    let project = Project {
        id: project_id,
        name: p.0,
        summary: p.1,
        icon_key: p.5,
        is_archived: p.2,
        created_at: p.3,
        updated_at: p.4,
    };
    let rows=sqlx::query_as::<_,(String,String,String,String,i64,String,String)>("SELECT id,project_id,name,avatar_key,is_active,created_at,updated_at FROM members WHERE project_id=? LIMIT 1001").bind(project_id.to_string()).fetch_all(&mut *tx).await?;
    let members = rows
        .into_iter()
        .map(crate::member_from_row)
        .collect::<Result<Vec<_>, _>>()?;
    let milestones=sqlx::query_as("SELECT id,project_id,name,is_closed,created_at FROM milestones WHERE project_id=? LIMIT 1001").bind(project_id.to_string()).fetch_all(&mut *tx).await?;
    let tasks=sqlx::query_as("SELECT id,project_id,title,description,status,priority,position,created_at,updated_at,assigned_member_id,milestone_id,due_at,tags_json,is_archived,completed_at FROM tasks WHERE project_id=? ORDER BY position,id LIMIT 20001").bind(project_id.to_string()).fetch_all(&mut *tx).await?;
    let activity=sqlx::query_as("SELECT id,project_id,entity_id,activity_type,created_at FROM activity_log WHERE project_id=? ORDER BY id LIMIT 50001").bind(project_id.to_string()).fetch_all(&mut *tx).await?;
    tx.commit().await?;
    let backup = Backup {
        format: "devquest-project".into(),
        schema_version: 1,
        exported_at: Utc::now().to_rfc3339(),
        project,
        members,
        milestones,
        tasks,
        activity,
    };
    let json = serde_json::to_string_pretty(&backup).map_err(|_| AppError::Database)?;
    validate(&json)?;
    Ok(json)
}
pub async fn import(pool: &SqlitePool, backup: Backup) -> Result<Project, AppError> {
    let project_id = Uuid::new_v4();
    let mut ids = HashMap::new();
    for id in backup
        .members
        .iter()
        .map(|m| m.id.to_string())
        .chain(backup.milestones.iter().map(|m| m.id.clone()))
        .chain(backup.tasks.iter().map(|t| t.id.clone()))
        .chain(backup.activity.iter().map(|a| a.entity_id.clone()))
    {
        ids.entry(id).or_insert_with(|| Uuid::new_v4().to_string());
    }
    let mapped = |id: &str| -> Result<String, AppError> {
        ids.get(id).cloned().ok_or(AppError::InvalidInput)
    };
    let mut tx = pool.begin().await?;
    sqlx::query("INSERT INTO projects(id,name,summary,is_archived,created_at,updated_at,icon_key) VALUES(?,?,?,?,?,?,?)").bind(project_id.to_string()).bind(&backup.project.name).bind(&backup.project.summary).bind(backup.project.is_archived).bind(&backup.project.created_at).bind(&backup.project.updated_at).bind(&backup.project.icon_key).execute(&mut *tx).await?;
    for member in &backup.members {
        sqlx::query("INSERT INTO members(id,project_id,name,avatar_key,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").bind(mapped(&member.id.to_string())?).bind(project_id.to_string()).bind(&member.name).bind(&member.avatar_key).bind(member.is_active).bind(&member.created_at).bind(&member.updated_at).execute(&mut *tx).await?;
    }
    for milestone in &backup.milestones {
        sqlx::query(
            "INSERT INTO milestones(id,project_id,name,is_closed,created_at) VALUES(?,?,?,?,?)",
        )
        .bind(mapped(&milestone.id)?)
        .bind(project_id.to_string())
        .bind(&milestone.name)
        .bind(milestone.is_closed)
        .bind(&milestone.created_at)
        .execute(&mut *tx)
        .await?;
    }
    for task in &backup.tasks {
        sqlx::query("INSERT INTO tasks(id,project_id,title,description,status,priority,position,created_at,updated_at,assigned_member_id,milestone_id,due_at,tags_json,is_archived,completed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(mapped(&task.id)?).bind(project_id.to_string()).bind(&task.title).bind(&task.description).bind(&task.status).bind(&task.priority).bind(task.position).bind(&task.created_at).bind(&task.updated_at).bind(task.assigned_member_id.as_deref().map(mapped).transpose()?).bind(task.milestone_id.as_deref().map(mapped).transpose()?).bind(&task.due_at).bind(&task.tags_json).bind(task.is_archived).bind(&task.completed_at).execute(&mut *tx).await?;
    }
    // Replace automatic create entries with the validated historical log.
    sqlx::query("DELETE FROM activity_log WHERE project_id=?")
        .bind(project_id.to_string())
        .execute(&mut *tx)
        .await?;
    for activity in &backup.activity {
        sqlx::query("INSERT INTO activity_log(project_id,entity_id,activity_type,created_at) VALUES(?,?,?,?)").bind(project_id.to_string()).bind(mapped(&activity.entity_id)?).bind(&activity.activity_type).bind(&activity.created_at).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    crate::fetch_project(pool, project_id).await
}
