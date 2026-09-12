import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Workspace } from './Workspace';
import { BackupPanel } from './BackupPanel';
import type { WorkTask } from '../lib/workflow';

const api = vi.hoisted(() => ({
  taskPage: vi.fn(),
  listMembers: vi.fn(),
  listMilestones: vi.fn(),
  listActivity: vi.fn(),
  saveWorkTask: vi.fn(),
  updateTaskState: vi.fn(),
  moveTask: vi.fn(),
  archiveTask: vi.fn(),
  deleteTask: vi.fn(),
  createMilestone: vi.fn(),
  closeMilestone: vi.fn(),
  importProject: vi.fn(),
}));
vi.mock('../lib/tauri', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/tauri')>()),
  listMembers: api.listMembers,
  updateTaskState: api.updateTaskState,
}));
vi.mock('../lib/workflow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/workflow')>()),
  ...api,
}));
const project = {
  id: 'p1',
  name: 'Starfall',
  summary: 'Bir piksel macerası',
  is_archived: false,
  created_at: '2026-09-10T10:00:00Z',
  updated_at: '2026-09-10T10:00:00Z',
};
const task: WorkTask = {
  id: 't1',
  project_id: 'p1',
  title: 'İlk odayı oluştur',
  description: 'Oynanabilir başlangıç alanı',
  status: 'todo',
  priority: 'normal',
  position: 0,
  created_at: project.created_at,
  updated_at: project.updated_at,
  assigned_member_id: null,
  milestone_id: null,
  due_at: null,
  tags_json: '[]',
  is_archived: false,
  completed_at: null,
};
function renderWorkspace() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Workspace project={project} onBack={vi.fn()} onMembers={vi.fn()} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  api.taskPage.mockResolvedValue({
    tasks: [task],
    total: 1,
    project_total: 1,
    completed: 0,
  });
  api.listMembers.mockResolvedValue([
    { id: 'm1', name: 'Ada', avatar_key: 'builder', is_active: true },
  ]);
  api.listMilestones.mockResolvedValue([
    { id: 'ms1', name: 'Demo', is_closed: false, total: 1, completed: 0 },
  ]);
  api.listActivity.mockResolvedValue([]);
  api.saveWorkTask.mockResolvedValue(task);
  api.updateTaskState.mockResolvedValue({ ...task, status: 'done' });
  api.moveTask.mockResolvedValue(undefined);
  api.archiveTask.mockResolvedValue(undefined);
  api.deleteTask.mockResolvedValue(undefined);
});
describe('Project workflow', () => {
  it('creates an assigned task with priority, due date, tags and milestone in one request', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(
      await screen.findByRole('button', { name: '＋ Yeni görev' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Yeni görev' });
    await user.type(
      within(dialog).getByLabelText('Görev başlığı'),
      'Haritayı çiz',
    );
    await user.selectOptions(within(dialog).getByLabelText('Atanan üye'), 'm1');
    await user.selectOptions(within(dialog).getByLabelText('Milestone'), 'ms1');
    await user.selectOptions(
      within(dialog).getByLabelText('Öncelik'),
      'critical',
    );
    await user.type(within(dialog).getByLabelText(/Etiketler/), 'art, demo');
    await user.click(
      within(dialog).getByRole('button', { name: 'Görevi ekle' }),
    );
    await waitFor(() =>
      expect(api.saveWorkTask).toHaveBeenCalledWith(
        expect.objectContaining({
          id: null,
          project_id: 'p1',
          title: 'Haritayı çiz',
          assigned_member_id: 'm1',
          milestone_id: 'ms1',
          priority: 'critical',
          tags: ['art', 'demo'],
        }),
        expect.anything(),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });
  it('keeps form content visible and reports persistence failure', async () => {
    api.saveWorkTask.mockRejectedValue('DATABASE');
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(
      await screen.findByRole('button', { name: 'İlk odayı oluştur' }),
    );
    await user.selectOptions(screen.getByLabelText('Durum'), 'review');
    await user.click(
      screen.getByRole('button', { name: 'Değişiklikleri kaydet' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Görev kaydedilemedi',
    );
    expect(screen.getByLabelText('Görev başlığı')).toHaveValue(task.title);
  });
  it('only celebrates after a successful completion and allows reopening', async () => {
    let finish: (() => void) | undefined;
    api.updateTaskState.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    const { container } = renderWorkspace();
    await user.click(await screen.findByRole('button', { name: '✓ Tamamla' }));
    expect(container.querySelector('.quest-celebrate')).toBeNull();
    api.taskPage.mockResolvedValue({
      tasks: [{ ...task, status: 'done' }],
      total: 1,
      project_total: 1,
      completed: 1,
    });
    finish?.();
    await waitFor(() =>
      expect(container.querySelector('.quest-celebrate')).not.toBeNull(),
    );
    await user.click(await screen.findByRole('button', { name: 'Yeniden aç' }));
    await waitFor(() =>
      expect(api.updateTaskState).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'todo' }),
      ),
    );
  });
  it('refreshes only task and milestone data after completion when activity is closed', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByRole('button', { name: '✓ Tamamla' });
    await user.click(screen.getByRole('button', { name: '✓ Tamamla' }));
    await waitFor(() => expect(api.taskPage).toHaveBeenCalledTimes(2));
    expect(api.listMembers).toHaveBeenCalledTimes(1);
    expect(api.listMilestones).toHaveBeenCalledTimes(2);
    expect(api.listActivity).not.toHaveBeenCalled();
  });
  it('does not show success feedback when completion fails', async () => {
    api.updateTaskState.mockRejectedValueOnce('DATABASE');
    const user = userEvent.setup();
    const { container } = renderWorkspace();
    await user.click(await screen.findByRole('button', { name: '✓ Tamamla' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(container.querySelector('.quest-celebrate')).toBeNull();
    expect(screen.getByRole('button', { name: '✓ Tamamla' })).toBeVisible();
  });
  it('filters at the data boundary and resets pagination', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByRole('button', { name: task.title });
    await user.type(screen.getByRole('searchbox'), 'harita');
    await user.selectOptions(
      screen.getByLabelText('Duruma göre filtrele'),
      'blocked',
    );
    await waitFor(() =>
      expect(api.taskPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'harita', status: 'blocked' }),
        0,
      ),
    );
  });
  it('requires named confirmation for task deletion and offers reorder actions', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByLabelText(`${task.title} işlemleri`));
    await user.click(screen.getByRole('button', { name: '↑ Yukarı taşı' }));
    await waitFor(() =>
      expect(api.moveTask).toHaveBeenCalledWith('p1', 't1', -1),
    );
    await user.click(screen.getByRole('button', { name: 'Görevi sil…' }));
    expect(api.deleteTask).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(task.title);
    await user.click(
      within(dialog).getByRole('button', { name: 'Görevi sil' }),
    );
    await waitFor(() =>
      expect(api.deleteTask).toHaveBeenCalledWith('p1', 't1'),
    );
  });
  it('shows milestone progress and prevents closing unfinished work', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(screen.getByRole('button', { name: '⚑ Milestone' }));
    expect(
      await screen.findByRole('button', { name: 'Milestone’u kapat' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('progressbar', { name: 'Demo ilerlemesi' }),
    ).toHaveAttribute('value', '0');
  });
  it('restores a backup only after the user selects a file and confirms', async () => {
    api.importProject.mockResolvedValue(project);
    const client = new QueryClient();
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <BackupPanel />
      </QueryClientProvider>,
    );
    const button = screen.getByRole('button', {
      name: 'Yeni proje olarak geri yükle',
    });
    expect(button).toBeDisabled();
    await user.upload(
      screen.getByLabelText('JSON yedeği seç'),
      new File(['{"format":"devquest-project"}'], 'project.json', {
        type: 'application/json',
      }),
    );
    await waitFor(() => expect(button).toBeEnabled());
    expect(api.importProject).not.toHaveBeenCalled();
    await user.click(button);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'yeni proje olarak geri yüklendi',
    );
  });
});
