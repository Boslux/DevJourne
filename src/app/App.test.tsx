import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const tauriMocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  archiveProject: vi.fn(),
  deleteProject: vi.fn(),
  listMembers: vi.fn(),
  createMember: vi.fn(),
  updateMember: vi.fn(),
  setMemberActive: vi.fn(),
  listTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  updateTaskState: vi.fn(),
}));

vi.mock('../lib/tauri', () => tauriMocks);

describe('Workspace shell', () => {
  const project = {
    id: 'project-1',
    name: 'Starfall',
    summary: 'A small adventure',
    is_archived: false,
    created_at: '2026-09-10T10:00:00Z',
    updated_at: '2026-09-10T10:00:00Z',
  };

  beforeEach(() => {
    tauriMocks.listProjects.mockResolvedValue([]);
    tauriMocks.updateProject.mockResolvedValue({
      ...project,
      name: 'Starfall 2',
    });
    tauriMocks.archiveProject.mockResolvedValue({
      ...project,
      is_archived: true,
    });
    tauriMocks.deleteProject.mockResolvedValue(undefined);
    tauriMocks.listMembers.mockResolvedValue([]);
    tauriMocks.createMember.mockResolvedValue({
      id: 'member-1',
      project_id: project.id,
      name: 'Ada',
      avatar_key: 'builder',
      is_active: true,
      created_at: project.created_at,
      updated_at: project.updated_at,
    });
    tauriMocks.listTasks.mockResolvedValue([]);
    tauriMocks.createTask.mockResolvedValue({
      id: 'task-1',
      project_id: project.id,
      title: 'Build the first room',
      description: 'Create the playable starting area.',
      status: 'todo',
      priority: 'normal',
      position: 0,
      created_at: project.created_at,
      updated_at: project.updated_at,
    });
    tauriMocks.updateTaskState.mockImplementation(async (request) => ({
      id: 'task-1',
      project_id: project.id,
      title: 'Build the first room',
      description: 'Create the playable starting area.',
      status: request.status,
      priority: request.priority,
      position: 0,
      created_at: project.created_at,
      updated_at: project.updated_at,
    }));
  });

  it('provides a main landmark and the first-project action', async () => {
    const { container } = render(<App />);
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(
      screen.getByRole('heading', { name: 'Projeler', level: 1 }),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: '＋ Yeni proje' }),
      ).toBeVisible(),
    );
    expect(container.querySelector('.skip-link')).toHaveAttribute(
      'href',
      '#main-content',
    );
  });

  it('lets a keyboard user reduce effects for the current session', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await user.tab();
    expect(container.querySelector('.skip-link')).toHaveFocus();
    const checkbox = screen.getByRole('checkbox', { name: 'Efektleri azalt' });
    for (let step = 0; step < 20 && document.activeElement !== checkbox; step++)
      await user.tab();
    expect(checkbox).toHaveFocus();
    await user.keyboard(' ');
    expect(checkbox).toBeChecked();
    expect(container.querySelector('.app-shell')).toHaveAttribute(
      'data-reduced-effects',
      'true',
    );
    await user.keyboard(' ');
    expect(checkbox).not.toBeChecked();
  });

  it('edits and archives a project from its card', async () => {
    tauriMocks.listProjects.mockResolvedValue([project]);
    const user = userEvent.setup();
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Starfall' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Düzenle' }));
    const nameInput = screen.getByLabelText('Proje adı');
    await user.clear(nameInput);
    await user.type(nameInput, 'Starfall 2');
    await user.click(
      screen.getByRole('button', { name: 'Değişiklikleri kaydet' }),
    );

    await waitFor(() => expect(tauriMocks.updateProject).toHaveBeenCalled());
    expect(
      await screen.findByRole('heading', { name: 'Starfall 2' }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Arşivle' }));
    await waitFor(() =>
      expect(tauriMocks.archiveProject).toHaveBeenCalledWith('project-1', true),
    );
    expect(
      screen.queryByRole('heading', { name: 'Starfall 2' }),
    ).not.toBeInTheDocument();
  });

  it('requires explicit confirmation before deleting a project', async () => {
    tauriMocks.listProjects.mockResolvedValue([project]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Sil' }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Projeyi sil?');
    expect(screen.getByText(/kalıcı olarak silinecek/i)).toBeVisible();
    expect(tauriMocks.deleteProject).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Projeyi sil' }));
    await waitFor(() =>
      expect(tauriMocks.deleteProject).toHaveBeenCalledWith('project-1'),
    );
    expect(
      screen.queryByRole('heading', { name: 'Starfall' }),
    ).not.toBeInTheDocument();
  });

  it('adds a local member with a selected avatar', async () => {
    tauriMocks.listProjects.mockResolvedValue([project]);
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      (await screen.findAllByRole('button', { name: 'Ekip' }))[0]!,
    );
    await user.type(screen.getByLabelText('Görünen ad'), 'Ada');
    await user.selectOptions(screen.getByLabelText('Avatar'), 'builder');
    tauriMocks.listMembers.mockResolvedValue([
      {
        id: 'member-1',
        project_id: project.id,
        name: 'Ada',
        avatar_key: 'builder',
        is_active: true,
        created_at: project.created_at,
        updated_at: project.updated_at,
      },
    ]);
    await user.click(screen.getByRole('button', { name: 'Üyeyi ekle' }));
    await waitFor(() =>
      expect(tauriMocks.createMember).toHaveBeenCalledWith({
        project_id: 'project-1',
        name: 'Ada',
        avatar_key: 'builder',
      }),
    );
    expect(screen.getByText('Ada')).toBeVisible();
  });
});
