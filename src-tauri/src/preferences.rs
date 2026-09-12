use crate::{AppError, AppState};
use sqlx::SqlitePool;

mod repository {
    use super::*;
    pub async fn read(pool: &SqlitePool) -> Result<bool, AppError> {
        let value: Option<String> =
            sqlx::query_scalar("SELECT value FROM settings WHERE key='reduced_effects'")
                .fetch_optional(pool)
                .await?;
        match value.as_deref() {
            Some("true") => Ok(true),
            Some("false") | None => Ok(false),
            _ => Err(AppError::Database),
        }
    }
    pub async fn write(pool: &SqlitePool, reduced: bool) -> Result<(), AppError> {
        sqlx::query("INSERT INTO settings(key,value) VALUES('reduced_effects',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(if reduced {"true"} else {"false"}).execute(pool).await?;
        Ok(())
    }
}
#[tauri::command]
pub async fn get_effects(state: tauri::State<'_, AppState>) -> Result<bool, AppError> {
    repository::read(&state.pool).await
}
#[tauri::command]
pub async fn set_effects(state: tauri::State<'_, AppState>, reduced: bool) -> Result<(), AppError> {
    repository::write(&state.pool, reduced).await
}
