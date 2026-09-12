CREATE TABLE milestones (
 id TEXT PRIMARY KEY NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 is_closed INTEGER NOT NULL DEFAULT 0 CHECK(is_closed IN (0,1)),
 created_at TEXT NOT NULL
);
ALTER TABLE tasks ADD COLUMN assigned_member_id TEXT REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN milestone_id TEXT REFERENCES milestones(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN due_at TEXT;
ALTER TABLE tasks ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0 CHECK(is_archived IN (0,1));
ALTER TABLE tasks ADD COLUMN completed_at TEXT;
UPDATE tasks SET completed_at = updated_at WHERE status = 'done';
CREATE INDEX idx_tasks_filter ON tasks(project_id, is_archived, status, position);
CREATE INDEX idx_milestones_project ON milestones(project_id);
CREATE TABLE activity_log (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 entity_id TEXT NOT NULL,
 activity_type TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX idx_activity_project ON activity_log(project_id,id DESC);
CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
CREATE TRIGGER task_created AFTER INSERT ON tasks BEGIN
 INSERT INTO activity_log(project_id,entity_id,activity_type,created_at) VALUES(NEW.project_id,NEW.id,'task_created',NEW.created_at);
END;
CREATE TRIGGER task_state AFTER UPDATE OF status ON tasks WHEN OLD.status <> NEW.status BEGIN
 UPDATE tasks SET completed_at = CASE WHEN NEW.status = 'done' THEN NEW.updated_at ELSE NULL END WHERE id = NEW.id;
 INSERT INTO activity_log(project_id,entity_id,activity_type,created_at) VALUES(NEW.project_id,NEW.id,CASE WHEN NEW.status='done' THEN 'task_completed' WHEN OLD.status='done' THEN 'task_reopened' ELSE 'status_changed' END,NEW.updated_at);
END;
CREATE TRIGGER task_assignment AFTER UPDATE OF assigned_member_id ON tasks WHEN OLD.assigned_member_id IS NOT NEW.assigned_member_id BEGIN
 INSERT INTO activity_log(project_id,entity_id,activity_type,created_at) VALUES(NEW.project_id,NEW.id,'assignee_changed',NEW.updated_at);
END;
CREATE TRIGGER task_archive AFTER UPDATE OF is_archived ON tasks WHEN OLD.is_archived <> NEW.is_archived BEGIN
 INSERT INTO activity_log(project_id,entity_id,activity_type,created_at) VALUES(NEW.project_id,NEW.id,CASE WHEN NEW.is_archived=1 THEN 'task_archived' ELSE 'task_restored' END,NEW.updated_at);
END;
CREATE TRIGGER task_deleted AFTER DELETE ON tasks WHEN EXISTS(SELECT 1 FROM projects WHERE id=OLD.project_id) BEGIN
 INSERT INTO activity_log(project_id,entity_id,activity_type,created_at) VALUES(OLD.project_id,OLD.id,'task_deleted',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER milestone_closed AFTER UPDATE OF is_closed ON milestones WHEN OLD.is_closed <> NEW.is_closed BEGIN
 INSERT INTO activity_log(project_id,entity_id,activity_type,created_at) VALUES(NEW.project_id,NEW.id,CASE WHEN NEW.is_closed=1 THEN 'milestone_completed' ELSE 'milestone_reopened' END,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
