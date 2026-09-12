use crate::{
    backup,
    workflow::{self, repository, service, SaveTask, TaskFilter},
    MIGRATOR,
};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    SqlitePool,
};
use uuid::Uuid;

async fn database() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::new()
                .in_memory(true)
                .foreign_keys(true),
        )
        .await
        .unwrap();
    MIGRATOR.run(&pool).await.unwrap();
    pool
}
async fn project(pool: &SqlitePool) -> Uuid {
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO projects(id,name,created_at,updated_at) VALUES(?,'Test','2026-09-10T10:00:00Z','2026-09-10T10:00:00Z')").bind(id.to_string()).execute(pool).await.unwrap();
    id
}
fn request(project: Uuid) -> SaveTask {
    SaveTask {
        id: None,
        project_id: project,
        title: "Test task".into(),
        description: None,
        status: "todo".into(),
        priority: "normal".into(),
        assigned_member_id: None,
        milestone_id: None,
        due_at: None,
        tags: vec![],
    }
}
fn filter(project: Uuid) -> TaskFilter {
    TaskFilter {
        project_id: project,
        search: String::new(),
        status: None,
        member_id: None,
        archived: false,
        offset: 0,
    }
}
async fn member(pool: &SqlitePool, project: Uuid) -> Uuid {
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO members(id,project_id,name,avatar_key,created_at,updated_at) VALUES(?,?,'Ada','scout','2026-09-10T10:00:00Z','2026-09-10T10:00:00Z')").bind(id.to_string()).bind(project.to_string()).execute(pool).await.unwrap();
    id
}

#[test]
fn assignment_rejects_other_projects_and_inactive_members_without_partial_writes() {
    tauri::async_runtime::block_on(async {
        let pool = database().await;
        let p = project(&pool).await;
        let other = project(&pool).await;
        let m = member(&pool, other).await;
        let mut r = request(p);
        r.assigned_member_id = Some(m);
        assert!(workflow::save(&pool, r).await.is_err());
        assert_eq!(repository::page(&pool, filter(p)).await.unwrap().total, 0);
        let m = member(&pool, p).await;
        sqlx::query("UPDATE members SET is_active=0 WHERE id=?")
            .bind(m.to_string())
            .execute(&pool)
            .await
            .unwrap();
        let mut r = request(p);
        r.assigned_member_id = Some(m);
        assert!(workflow::save(&pool, r).await.is_err());
        assert!(repository::activity(&pool, p, 0).await.unwrap().is_empty());
    });
}

#[test]
fn saves_all_fields_and_preserves_historical_inactive_assignment() {
    tauri::async_runtime::block_on(async {
        let pool = database().await;
        let p = project(&pool).await;
        let m = member(&pool, p).await;
        service::milestone(&pool, p, "Demo".into()).await.unwrap();
        let milestone = repository::milestones(&pool, p).await.unwrap().remove(0);
        let mut r = request(p);
        r.assigned_member_id = Some(m);
        r.milestone_id = Some(Uuid::parse_str(&milestone.id).unwrap());
        r.due_at = Some("2026-09-15".into());
        r.tags = vec!["art".into()];
        let task = workflow::save(&pool, r).await.unwrap();
        assert_eq!(task.assigned_member_id, Some(m.to_string()));
        assert_eq!(task.tags_json, "[\"art\"]");
        sqlx::query("UPDATE members SET is_active=0 WHERE id=?")
            .bind(m.to_string())
            .execute(&pool)
            .await
            .unwrap();
        let mut r = request(p);
        r.id = Some(Uuid::parse_str(&task.id).unwrap());
        r.assigned_member_id = Some(m);
        r.title = "Edited".into();
        assert_eq!(workflow::save(&pool, r).await.unwrap().title, "Edited");
    });
}

#[test]
fn completion_reopen_and_activity_are_atomic() {
    tauri::async_runtime::block_on(async {
        let pool = database().await;
        let p = project(&pool).await;
        let task = workflow::save(&pool, request(p)).await.unwrap();
        let id = Uuid::parse_str(&task.id).unwrap();
        let mut r = request(p);
        r.id = Some(id);
        r.status = "done".into();
        let task = workflow::save(&pool, r).await.unwrap();
        assert!(task.completed_at.is_some());
        let mut r = request(p);
        r.id = Some(id);
        r.status = "todo".into();
        let task = workflow::save(&pool, r).await.unwrap();
        assert!(task.completed_at.is_none());
        let activity = repository::activity(&pool, p, 0).await.unwrap();
        assert_eq!(
            activity
                .iter()
                .map(|a| a.activity_type.as_str())
                .collect::<Vec<_>>(),
            vec!["task_reopened", "task_completed", "task_created"]
        );
        sqlx::raw_sql("CREATE TRIGGER reject_log BEFORE INSERT ON activity_log BEGIN SELECT RAISE(ABORT,'test'); END;").execute(&pool).await.unwrap();
        let mut r = request(p);
        r.id = Some(id);
        r.status = "done".into();
        assert!(workflow::save(&pool, r).await.is_err());
        assert_eq!(repository::task(&pool, id, p).await.unwrap().status, "todo");
    });
}

#[test]
fn reorder_archive_and_cross_project_deletion_preserve_data() {
    tauri::async_runtime::block_on(async {
        let pool = database().await;
        let p = project(&pool).await;
        let other = project(&pool).await;
        let a = workflow::save(&pool, request(p)).await.unwrap();
        let b = workflow::save(&pool, request(p)).await.unwrap();
        let bid = Uuid::parse_str(&b.id).unwrap();
        service::move_task(&pool, p, bid, -1).await.unwrap();
        let page = repository::page(&pool, filter(p)).await.unwrap();
        assert_eq!(page.tasks[0].id, b.id);
        assert_eq!(page.tasks[1].id, a.id);
        assert!(service::delete(&pool, other, bid).await.is_err());
        service::archive(&pool, p, bid, true).await.unwrap();
        assert_eq!(repository::page(&pool, filter(p)).await.unwrap().total, 1);
        let mut f = filter(p);
        f.archived = true;
        assert_eq!(repository::page(&pool, f).await.unwrap().tasks[0].id, b.id);
        service::archive(&pool, p, bid, false).await.unwrap();
        service::delete(&pool, p, bid).await.unwrap();
        assert_eq!(repository::page(&pool, filter(p)).await.unwrap().total, 1);
    });
}

#[test]
fn reorder_swaps_only_the_moved_task_and_its_neighbor() {
    tauri::async_runtime::block_on(async {
        let pool = database().await;
        let p = project(&pool).await;
        let a = workflow::save(&pool, request(p)).await.unwrap();
        let b = workflow::save(&pool, request(p)).await.unwrap();
        let c = workflow::save(&pool, request(p)).await.unwrap();
        let before: Vec<(String, i64)> =
            sqlx::query_as("SELECT id,position FROM tasks WHERE project_id=? ORDER BY position,id")
                .bind(p.to_string())
                .fetch_all(&pool)
                .await
                .unwrap();
        service::move_task(&pool, p, Uuid::parse_str(&b.id).unwrap(), -1)
            .await
            .unwrap();
        let after: Vec<(String, i64)> =
            sqlx::query_as("SELECT id,position FROM tasks WHERE project_id=? ORDER BY position,id")
                .bind(p.to_string())
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(
            after.iter().map(|(id, _)| id).collect::<Vec<_>>(),
            vec![&b.id, &a.id, &c.id]
        );
        assert_eq!(before[2], after[2]);
        assert_eq!(after[0].1, before[0].1);
        assert_eq!(after[1].1, before[1].1);
    });
}

#[test]
fn milestones_validate_project_and_only_close_when_complete() {
    tauri::async_runtime::block_on(async {
        let pool = database().await;
        let p = project(&pool).await;
        let other = project(&pool).await;
        service::milestone(&pool, p, "Demo".into()).await.unwrap();
        let ms = repository::milestones(&pool, p).await.unwrap().remove(0);
        let mid = Uuid::parse_str(&ms.id).unwrap();
        let mut r = request(other);
        r.milestone_id = Some(mid);
        assert!(workflow::save(&pool, r).await.is_err());
        let mut r = request(p);
        r.milestone_id = Some(mid);
        let t = workflow::save(&pool, r).await.unwrap();
        assert!(service::close_milestone(&pool, p, mid, true).await.is_err());
        let mut r = request(p);
        r.id = Some(Uuid::parse_str(&t.id).unwrap());
        r.milestone_id = Some(mid);
        r.status = "done".into();
        workflow::save(&pool, r).await.unwrap();
        service::close_milestone(&pool, p, mid, true).await.unwrap();
        let ms = repository::milestones(&pool, p).await.unwrap().remove(0);
        assert_eq!((ms.total, ms.completed, ms.is_closed), (1, 1, true));
    });
}

#[test]
fn backup_roundtrip_remaps_ids_and_rejects_corruption_before_writes() {
    tauri::async_runtime::block_on(async {
        let pool = database().await;
        let p = project(&pool).await;
        let m = member(&pool, p).await;
        let mut r = request(p);
        r.assigned_member_id = Some(m);
        r.status = "done".into();
        r.tags = vec!["<script>".into()];
        workflow::save(&pool, r).await.unwrap();
        let json = backup::export(&pool, p).await.unwrap();
        let imported = backup::import(&pool, json.clone()).await.unwrap();
        assert_ne!(imported.id, p);
        let copied = repository::page(&pool, filter(imported.id)).await.unwrap();
        assert_eq!(copied.total, 1);
        assert_eq!(copied.completed, 1);
        assert_ne!(copied.tasks[0].assigned_member_id, Some(m.to_string()));
        let corrupt = json.replace("\"schemaVersion\": 1", "\"schemaVersion\": 999");
        assert!(backup::import(&pool, corrupt).await.is_err());
        let mut broken: serde_json::Value = serde_json::from_str(&json).unwrap();
        broken["tasks"][0]["assigned_member_id"] = serde_json::json!(Uuid::new_v4().to_string());
        assert!(backup::import(&pool, broken.to_string()).await.is_err());
        assert!(backup::validate(&"x".repeat(backup::MAX_BACKUP_BYTES + 1)).is_err());
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM projects")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 2);
    });
}

#[test]
fn backup_rolls_back_entire_project_on_storage_failure() {
    tauri::async_runtime::block_on(async {
        let pool = database().await;
        let p = project(&pool).await;
        workflow::save(&pool, request(p)).await.unwrap();
        let json = backup::export(&pool, p).await.unwrap();
        sqlx::raw_sql(
        "CREATE TRIGGER fail_restore BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT,'test'); END;",
    )
    .execute(&pool)
    .await
    .unwrap();
        assert!(backup::import(&pool, json).await.is_err());
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM projects")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 1);
    });
}

#[test]
fn paginates_large_paths_and_validates_dates_and_filters() {
    tauri::async_runtime::block_on(async {
        let pool = database().await;
        let p = project(&pool).await;
        for _ in 0..2005 {
            workflow::save(&pool, request(p)).await.unwrap();
        }
        let page = repository::page(&pool, filter(p)).await.unwrap();
        assert_eq!((page.tasks.len(), page.total), (100, 2005));
        let mut f = filter(p);
        f.offset = 2000;
        assert_eq!(repository::page(&pool, f).await.unwrap().tasks.len(), 5);
        let mut f = filter(p);
        f.search = "Test".into();
        assert_eq!(repository::page(&pool, f).await.unwrap().total, 2005);
        let mut f = filter(p);
        f.search = "' OR 1=1 --".into();
        assert_eq!(repository::page(&pool, f).await.unwrap().total, 0);
        let mut r = request(p);
        r.due_at = Some("2026-02-30".into());
        assert!(workflow::save(&pool, r).await.is_err());
        let mut f = filter(p);
        f.status = Some("unknown".into());
        assert!(repository::page(&pool, f).await.is_err());
    });
}

#[test]
fn reopen_database_preserves_committed_tasks() {
    tauri::async_runtime::block_on(async {
        let path = std::env::temp_dir().join(format!("devquest-test-{}.sqlite", Uuid::new_v4()));
        let options = SqliteConnectOptions::new()
            .filename(&path)
            .create_if_missing(true)
            .foreign_keys(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options.clone())
            .await
            .unwrap();
        MIGRATOR.run(&pool).await.unwrap();
        let p = project(&pool).await;
        workflow::save(&pool, request(p)).await.unwrap();
        pool.close().await;
        drop(pool);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .unwrap();
        MIGRATOR.run(&pool).await.unwrap();
        assert_eq!(repository::page(&pool, filter(p)).await.unwrap().total, 1);
        pool.close().await;
        drop(pool);
        // SQLite's worker can release the Windows file handle shortly after pool close.
        for attempt in 0..20 {
            match std::fs::remove_file(&path) {
                Ok(()) => break,
                Err(error) if attempt < 19 && error.raw_os_error() == Some(32) => {
                    std::thread::sleep(std::time::Duration::from_millis(25));
                }
                Err(error) => panic!("test database cleanup failed: {error}"),
            }
        }
    });
}
