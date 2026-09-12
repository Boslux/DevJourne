import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';
import type { Task, Project } from './tauri';

export type WorkTask = Task & {
  assigned_member_id: string | null;
  milestone_id: string | null;
  due_at: string | null;
  tags_json: string;
  is_archived: boolean;
  completed_at: string | null;
};
export type Milestone = {
  id: string;
  project_id: string;
  name: string;
  is_closed: boolean;
  created_at: string;
  total: number;
  completed: number;
};
export type Activity = {
  id: number;
  entity_id: string;
  activity_type: string;
  created_at: string;
};
export type TaskFilter = {
  project_id: string;
  search: string;
  status: string | null;
  member_id: string | null;
  archived: boolean;
};
export type TaskPage = {
  tasks: WorkTask[];
  total: number;
  completed: number;
  project_total: number;
};
export type TaskDetails = {
  id: string;
  project_id: string;
  assigned_member_id: string | null;
  milestone_id: string | null;
  due_at: string | null;
  tags: string[];
};
export const taskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000),
});
export const tagsSchema = z.array(z.string().trim().min(1).max(40)).max(10);
export const statusLabels: Record<Task['status'], string> = {
  todo: '○ Yapılacak',
  in_progress: '▶ Devam ediyor',
  review: '◇ İncelemede',
  blocked: '! Engelli',
  done: '✓ Tamamlandı',
};
export const priorityLabels: Record<Task['priority'], string> = {
  low: 'Düşük',
  normal: 'Normal',
  high: 'Yüksek',
  critical: 'Kritik',
};
export function isStatus(value: string): value is Task['status'] {
  return Object.hasOwn(statusLabels, value);
}
export function isPriority(value: string): value is Task['priority'] {
  return Object.hasOwn(priorityLabels, value);
}
export const taskPage = (filter: TaskFilter, offset: number) =>
  invoke<TaskPage>('task_page', { filter: { ...filter, offset } });
export const moveTask = (projectId: string, id: string, direction: number) =>
  invoke<void>('move_task', { projectId, id, direction });
export const archiveTask = (projectId: string, id: string, archived: boolean) =>
  invoke<void>('archive_task', { projectId, id, archived });
export const deleteTask = (projectId: string, id: string) =>
  invoke<void>('delete_task', { projectId, id });
export const listMilestones = (projectId: string) =>
  invoke<Milestone[]>('list_milestones', { projectId });
export const createMilestone = (projectId: string, name: string) =>
  invoke<void>('create_milestone', { projectId, name });
export const closeMilestone = (
  projectId: string,
  id: string,
  closed: boolean,
) => invoke<void>('close_milestone', { projectId, id, closed });
export const listActivity = (projectId: string, offset: number) =>
  invoke<Activity[]>('list_activity', { projectId, offset });
export const exportProject = (projectId: string) =>
  invoke<string>('export_project', { projectId });
export const importProject = (json: string) =>
  invoke<Project>('import_project', { json });
export type SaveTask = Omit<TaskDetails, 'id'> & {
  id: string | null;
  title: string;
  description: string;
  status: Task['status'];
  priority: Task['priority'];
};
export const saveWorkTask = (request: SaveTask) =>
  invoke<WorkTask>('save_work_task', { request });
