import { invoke } from '@tauri-apps/api/core';

export type Project = {
  id: string;
  name: string;
  summary: string | null;
  icon_key?: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type Member = {
  id: string;
  project_id: string;
  name: string;
  avatar_key: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Task = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'review' | 'blocked' | 'done';
  priority: 'low' | 'normal' | 'high' | 'critical';
  position: number;
  created_at: string;
  updated_at: string;
};

export type CreateProjectRequest = {
  name: string;
  summary?: string;
  icon_key?: string;
};
export type UpdateProjectRequest = CreateProjectRequest & { id: string };
export type CreateMemberRequest = {
  project_id: string;
  name: string;
  avatar_key: string;
};
export type UpdateMemberRequest = CreateMemberRequest & { id: string };

export type UpdateTaskStateRequest = {
  id: string;
  project_id: string;
  status: Task['status'];
  priority: Task['priority'];
};

const isDesktop = () => '__TAURI_INTERNALS__' in window;

export async function listProjects(
  includeArchived = false,
): Promise<Project[]> {
  return isDesktop()
    ? invoke<Project[]>('list_projects', { includeArchived })
    : [];
}

export async function createProject(
  request: CreateProjectRequest,
): Promise<Project> {
  if (!isDesktop()) throw new Error('DESKTOP_RUNTIME_REQUIRED');
  return invoke<Project>('create_project', { request });
}

export async function updateProject(
  request: UpdateProjectRequest,
): Promise<Project> {
  if (!isDesktop()) throw new Error('DESKTOP_RUNTIME_REQUIRED');
  return invoke<Project>('update_project', { request });
}

export async function archiveProject(
  id: string,
  archived: boolean,
): Promise<Project> {
  if (!isDesktop()) throw new Error('DESKTOP_RUNTIME_REQUIRED');
  return invoke<Project>('archive_project', { id, archived });
}

export async function deleteProject(id: string): Promise<void> {
  if (!isDesktop()) throw new Error('DESKTOP_RUNTIME_REQUIRED');
  await invoke('delete_project', { id });
}

export async function listMembers(projectId: string): Promise<Member[]> {
  if (!isDesktop()) throw new Error('DESKTOP_RUNTIME_REQUIRED');
  return invoke<Member[]>('list_members', { projectId });
}

export async function createMember(
  request: CreateMemberRequest,
): Promise<Member> {
  if (!isDesktop()) throw new Error('DESKTOP_RUNTIME_REQUIRED');
  return invoke<Member>('create_member', { request });
}

export async function updateMember(
  request: UpdateMemberRequest,
): Promise<Member> {
  if (!isDesktop()) throw new Error('DESKTOP_RUNTIME_REQUIRED');
  return invoke<Member>('update_member', { request });
}

export async function setMemberActive(
  id: string,
  projectId: string,
  active: boolean,
): Promise<Member> {
  if (!isDesktop()) throw new Error('DESKTOP_RUNTIME_REQUIRED');
  return invoke<Member>('set_member_active', { id, projectId, active });
}

export async function updateTaskState(
  request: UpdateTaskStateRequest,
): Promise<Task> {
  if (!isDesktop()) throw new Error('DESKTOP_RUNTIME_REQUIRED');
  return invoke<Task>('update_task_state', { request });
}
