import { FormEvent, useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffects } from '../features/useEffects';
import { Workspace } from '../features/Workspace';
import { BackupPanel } from '../features/BackupPanel';
import { Dialog } from '../components/Dialog';
import { PixelAvatar, WorldBackdrop } from '../components/PixelArt';
import {
  archiveProject,
  createProject,
  createMember,
  deleteProject,
  listMembers,
  Member,
  listProjects,
  Project,
  updateProject,
  setMemberActive,
  updateMember,
} from '../lib/tauri';

export function App() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <WorkspaceShell />
    </QueryClientProvider>
  );
}
function WorkspaceShell() {
  const effects = useEffects();
  const reducedEffects = effects.reduced;
  const setReducedEffects = effects.setReduced;
  const cache = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [icon, setIcon] = useState('flag');
  const [error, setError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [memberProject, setMemberProject] = useState<Project | null>(null);

  const memberQuery = useQuery({
    queryKey: ['workspace', memberProject?.id, 'members'],
    queryFn: () =>
      memberProject ? listMembers(memberProject.id) : Promise.resolve([]),
    enabled: Boolean(memberProject),
  });
  const members = memberQuery.data ?? [];
  const setMembers = (update: (current: Member[]) => Member[]) =>
    cache.setQueryData<Member[]>(
      ['workspace', memberProject?.id, 'members'],
      (current) => update(current ?? []),
    );
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [memberName, setMemberName] = useState('');
  const [memberAvatar, setMemberAvatar] = useState('scout');
  const [taskProject, setTaskProject] = useState<Project | null>(null);
  const [workspaceView, setWorkspaceView] = useState<'tasks' | 'activity'>(
    'tasks',
  );
  const [backupOpen, setBackupOpen] = useState(false);
  const projectQuery = useQuery({
    queryKey: ['projects', showArchived],
    queryFn: () => listProjects(showArchived),
  });
  const projects = projectQuery.data ?? [];
  const isLoading = projectQuery.isPending;
  const setProjects = (update: (current: Project[]) => Project[]) =>
    cache.setQueryData<Project[]>(['projects', showArchived], (current) =>
      update(current ?? []),
    );

  function openCreate() {
    setError(null);
    setEditingProject(null);
    setName('');
    setSummary('');
    setIcon('flag');
    setIsCreateOpen(true);
  }

  function openEdit(project: Project) {
    setError(null);
    setEditingProject(project);
    setName(project.name);
    setSummary(project.summary ?? '');
    setIcon(project.icon_key ?? 'flag');
    setIsCreateOpen(true);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    setError(null);
    setIsSaving(true);
    try {
      const project = editingProject
        ? await updateProject({
            id: editingProject.id,
            name,
            icon_key: icon,
            summary: summary || undefined,
          })
        : await createProject({
            name,
            summary: summary || undefined,
            icon_key: icon,
          });
      setProjects((current) => {
        const withoutProject = current.filter((item) => item.id !== project.id);
        return project.is_archived && !showArchived
          ? withoutProject
          : [project, ...withoutProject];
      });
      setName('');
      setSummary('');
      setEditingProject(null);
      setIsCreateOpen(false);
    } catch {
      setError('Proje kaydedilemedi. Adı 1–120 karakter arasında olmalı.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleArchive(project: Project) {
    setError(null);
    try {
      const updated = await archiveProject(project.id, !project.is_archived);
      setProjects((current) =>
        updated.is_archived && !showArchived
          ? current.filter((item) => item.id !== updated.id)
          : current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch {
      setError('Proje arşivlenemedi. Lütfen tekrar deneyin.');
    }
  }

  async function handleDelete() {
    if (!deletingProject || isDeleting) return;
    setError(null);
    setIsDeleting(true);
    try {
      await deleteProject(deletingProject.id);
      setProjects((current) =>
        current.filter((item) => item.id !== deletingProject.id),
      );
      setDeletingProject(null);
    } catch {
      setError('Proje silinemedi. Lütfen tekrar deneyin.');
    } finally {
      setIsDeleting(false);
    }
  }

  async function openMembers(project: Project) {
    setError(null);
    setMemberProject(project);
    setEditingMember(null);
    setMemberName('');
    setMemberAvatar('scout');
  }

  async function handleMemberSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!memberProject || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const member = editingMember
        ? await updateMember({
            id: editingMember.id,
            project_id: memberProject.id,
            name: memberName,
            avatar_key: memberAvatar,
          })
        : await createMember({
            project_id: memberProject.id,
            name: memberName,
            avatar_key: memberAvatar,
          });
      setMembers((current) => [
        member,
        ...current.filter((item) => item.id !== member.id),
      ]);
      setEditingMember(null);
      setMemberName('');
      setMemberAvatar('scout');
    } catch {
      setError('Üye kaydedilemedi. Adı 1–80 karakter arasında olmalı.');
    } finally {
      setIsSaving(false);
      void cache.invalidateQueries({
        queryKey: ['workspace', memberProject.id, 'members'],
      });
    }
  }

  async function handleMemberActive(member: Member) {
    if (!memberProject) return;
    try {
      const updated = await setMemberActive(
        member.id,
        memberProject.id,
        !member.is_active,
      );
      setMembers((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch {
      setError('Üyenin durumu değiştirilemedi.');
    } finally {
      setIsSaving(false);
      void cache.invalidateQueries({
        queryKey: ['workspace', memberProject.id, 'members'],
      });
    }
  }

  function openTasks(project: Project) {
    setTaskProject(project);
    setWorkspaceView('tasks');
  }
  return (
    <div className="app-shell" data-reduced-effects={reducedEffects}>
      <a className="skip-link" href="#main-content">
        İçeriğe geç
      </a>
      <aside className="sidebar" aria-label="Çalışma alanı">
        <a
          className="brand"
          href="#main-content"
          tabIndex={-1}
          aria-label="DevQuest ana sayfa"
        >
          <span className="brand-mark" aria-hidden="true">
            D
          </span>
          <span>
            DevQuest
            <span className="brand-caption">OYUN GELİŞTİRME GÜNLÜĞÜ</span>
          </span>
        </a>
        <nav className="nav-list" aria-label="Ana gezinme">
          <button
            className="nav-link"
            aria-current={!taskProject ? 'page' : undefined}
            onClick={() => setTaskProject(null)}
          >
            <span className="nav-icon" aria-hidden="true">
              ⌂
            </span>
            Projeler
          </button>
          <button
            className="nav-link"
            disabled={!projects.length}
            aria-current={
              taskProject && workspaceView === 'tasks' ? 'page' : undefined
            }
            onClick={() => {
              const project = taskProject ?? projects[0];
              if (project) openTasks(project);
            }}
          >
            <span className="nav-icon" aria-hidden="true">
              ✓
            </span>
            Görevler
          </button>
          <button
            className="nav-link"
            disabled={!projects.length}
            onClick={() => {
              const project = taskProject ?? projects[0];
              if (project) void openMembers(project);
            }}
          >
            <span className="nav-icon" aria-hidden="true">
              ♟
            </span>
            Ekip
          </button>
          <button
            className="nav-link"
            disabled={!projects.length}
            aria-current={
              taskProject && workspaceView === 'activity' ? 'page' : undefined
            }
            onClick={() => {
              const project = taskProject ?? projects[0];
              if (project) {
                setTaskProject(project);
                setWorkspaceView('activity');
              }
            }}
          >
            <span className="nav-icon" aria-hidden="true">
              ▤
            </span>
            Aktivite günlüğü
          </button>
        </nav>
        <div className="sidebar-section" aria-label="Son projeler">
          <span className="sidebar-section-title">SON PROJELER</span>
          {projects.slice(0, 5).map((project) => (
            <button
              key={project.id}
              className="starred-project"
              onClick={() => openTasks(project)}
            >
              <span className="mini-project-icon" aria-hidden="true">
                ⚑
              </span>
              {project.name}
            </button>
          ))}
          {projects.length === 0 && (
            <p className="sidebar-empty">İlk projen burada görünecek.</p>
          )}
          <button
            className="starred-project"
            type="button"
            onClick={openCreate}
          >
            <span className="mini-project-icon" aria-hidden="true">
              ＋
            </span>
            Yeni çalışma alanı
          </button>
        </div>
        <button className="text-button" onClick={() => setBackupOpen(true)}>
          ⇧ Yedeği geri yükle
        </button>
        <div className="sidebar-footer">
          <span className="local-badge">Yerel çalışma alanı</span>
          <p>
            Oyununa odaklan.
            <br />
            Bir adım, bir görev.
          </p>
        </div>
      </aside>
      <main id="main-content" tabIndex={-1}>
        {taskProject ? (
          <Workspace
            key={taskProject.id + workspaceView}
            project={taskProject}
            initialView={workspaceView}
            onBack={() => setTaskProject(null)}
            onMembers={() => void openMembers(taskProject)}
          />
        ) : (
          <>
            <WorldBackdrop />
            <header className="page-header">
              <div className="page-header-copy">
                <p className="eyebrow">ÇALIŞMA ALANIN</p>
                <h1>Projeler</h1>
                <p>
                  Oyun fikirlerini küçük adımlarla görünür bir maceraya
                  dönüştür.
                </p>
              </div>
              <div className="header-metrics" aria-label="Çalışma alanı özeti">
                <div className="metric-chip">
                  <strong>{projects.length}</strong>
                  <span>Proje</span>
                </div>
                <div className="metric-chip">
                  <strong>Yerel</strong>
                  <span>Veri alanı</span>
                </div>
                <button
                  className="primary-button"
                  type="button"
                  onClick={openCreate}
                >
                  ＋ Yeni proje
                </button>
              </div>
            </header>
            {(error || projectQuery.isError) && (
              <p className="error-message" role="alert">
                {error || 'Projeler yüklenemedi. Lütfen tekrar deneyin.'}
                {projectQuery.isError && (
                  <button
                    className="text-button"
                    onClick={() => void projectQuery.refetch()}
                  >
                    Tekrar dene
                  </button>
                )}
              </p>
            )}
            {!isLoading && (
              <label className="archive-toggle">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(event) => setShowArchived(event.target.checked)}
                />
                Arşivlenmişleri göster
              </label>
            )}
            {isLoading ? (
              <p className="status-message">Projeler yükleniyor…</p>
            ) : projects.length > 0 ? (
              <section className="project-grid" aria-label="Projeler">
                {projects.map((project) => (
                  <article className="project-card" key={project.id}>
                    <div className="project-card-top">
                      <div className="project-card-heading">
                        <span className="project-thumbnail" aria-hidden="true">
                          {{ flag: '⚑', forest: '♣', castle: '♜', gem: '◆' }[
                            project.icon_key ?? 'flag'
                          ] ?? '⚑'}
                        </span>
                        <div>
                          <p className="eyebrow">PROJE ADIMI</p>
                          <h2>{project.name}</h2>
                          {project.summary && (
                            <p className="project-summary">{project.summary}</p>
                          )}
                        </div>
                      </div>
                      {project.is_archived && (
                        <span className="archive-badge">Arşivlendi</span>
                      )}
                    </div>
                    <div className="project-card-bottom">
                      <div
                        className="project-progress"
                        aria-label="Proje ilerlemesi"
                      >
                        <div className="progress-label">
                          <span>Görev yolunu aç</span>
                        </div>
                      </div>
                      <div className="card-actions">
                        <button
                          className="primary-button"
                          type="button"
                          onClick={() => void openTasks(project)}
                        >
                          Görevler
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => openEdit(project)}
                        >
                          Düzenle
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => void handleArchive(project)}
                        >
                          {project.is_archived ? 'Arşivden çıkar' : 'Arşivle'}
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => void openMembers(project)}
                        >
                          Ekip
                        </button>
                        <button
                          className="danger-button"
                          type="button"
                          onClick={() => setDeletingProject(project)}
                        >
                          Sil
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </section>
            ) : (
              <section
                className="welcome-panel empty-world"
                aria-labelledby="welcome-title"
              >
                <div className="pixel-landscape" aria-hidden="true">
                  <span className="pixel-star star-one" />
                  <span className="pixel-star star-two" />
                  <span className="pixel-flag" />
                  <span className="pixel-ground" />
                </div>
                <p className="eyebrow">HER OYUN BİR FİKİRLE BAŞLAR</p>
                <h2 id="welcome-title">Bir sonraki macerana yer aç.</h2>
                <p className="welcome-copy">
                  Oyun projelerini ve görevlerini tek bir çalışma alanında takip
                  et.
                </p>
                <button
                  className="primary-button"
                  type="button"
                  onClick={openCreate}
                >
                  İlk macerayı başlat
                </button>
              </section>
            )}
          </>
        )}
        <section className="preferences" aria-labelledby="preferences-title">
          <div>
            <h2 id="preferences-title">Görünüm</h2>
            <p>
              {effects.desktop
                ? 'Görünüm tercihin bu cihazda saklanır.'
                : 'Bu oturumdaki dekoratif efektleri azalt.'}
            </p>
            {effects.error && (
              <p role="alert">Görünüm tercihi okunamadı veya kaydedilemedi.</p>
            )}
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              disabled={effects.pending}
              checked={reducedEffects}
              onChange={(event) => setReducedEffects(event.target.checked)}
            />
            Efektleri azalt
          </label>
        </section>
      </main>
      {isCreateOpen && (
        <Dialog
          title={editingProject ? 'Projeyi düzenle' : 'Yeni proje'}
          onClose={() => setIsCreateOpen(false)}
          busy={isSaving}
        >
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          <form onSubmit={handleCreate}>
            <label htmlFor="project-name">
              Proje adı
              <input
                id="project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                required
                autoFocus
              />
            </label>
            <label>
              Proje simgesi
              <select value={icon} onChange={(e) => setIcon(e.target.value)}>
                <option value="flag">⚑ Bayrak</option>
                <option value="forest">♣ Orman</option>
                <option value="castle">♜ Kale</option>
                <option value="gem">◆ Kristal</option>
              </select>
            </label>
            <label htmlFor="project-summary">
              Kısa açıklama <span>(isteğe bağlı)</span>
              <textarea
                id="project-summary"
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                maxLength={500}
                rows={3}
              />
            </label>
            <div className="modal-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setIsCreateOpen(false)}
              >
                Vazgeç
              </button>
              <button
                className="primary-button"
                type="submit"
                disabled={isSaving}
              >
                {isSaving
                  ? 'Kaydediliyor…'
                  : editingProject
                    ? 'Değişiklikleri kaydet'
                    : 'Projeyi kaydet'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {deletingProject && (
        <Dialog
          title={'Projeyi sil?'}
          onClose={() => setDeletingProject(null)}
          busy={isDeleting}
        >
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          <p id="delete-description" className="confirmation-copy">
            “{deletingProject.name}” kalıcı olarak silinecek. Bu işlem geri
            alınamaz.
          </p>
          <div className="modal-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setDeletingProject(null)}
              disabled={isDeleting}
            >
              Vazgeç
            </button>
            <button
              className="danger-button"
              type="button"
              onClick={() => void handleDelete()}
              disabled={isDeleting}
            >
              {isDeleting ? 'Siliniyor…' : 'Projeyi sil'}
            </button>
          </div>
        </Dialog>
      )}
      {memberProject && (
        <Dialog
          title={memberProject.name}
          onClose={() => setMemberProject(null)}
          busy={isSaving}
        >
          <div className="member-list" aria-label="Ekip üyeleri">
            {memberQuery.isPending ? (
              <p role="status">Ekip yükleniyor…</p>
            ) : memberQuery.isError ? (
              <p role="alert" className="error-message">
                Ekip yüklenemedi.{' '}
                <button
                  className="text-button"
                  onClick={() => void memberQuery.refetch()}
                >
                  Tekrar dene
                </button>
              </p>
            ) : members.length === 0 ? (
              <p className="status-message">Henüz ekip üyesi yok.</p>
            ) : (
              members.map((member) => (
                <div className="member-row" key={member.id}>
                  <span
                    className={`avatar avatar-${member.avatar_key}`}
                    aria-hidden="true"
                  >
                    <PixelAvatar kind={member.avatar_key} />
                  </span>
                  <span className="member-name">
                    {member.name}
                    {!member.is_active && <small>Devre dışı</small>}
                  </span>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setEditingMember(member);
                      setMemberName(member.name);
                      setMemberAvatar(member.avatar_key);
                    }}
                  >
                    Düzenle
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={isSaving}
                    onClick={() => void handleMemberActive(member)}
                  >
                    {member.is_active ? 'Devre dışı bırak' : 'Etkinleştir'}
                  </button>
                </div>
              ))
            )}
          </div>
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          <form className="member-form" onSubmit={handleMemberSave}>
            <h3>{editingMember ? 'Üyeyi düzenle' : 'Yeni üye'}</h3>
            <label htmlFor="member-name">
              Görünen ad
              <input
                id="member-name"
                value={memberName}
                onChange={(event) => setMemberName(event.target.value)}
                maxLength={80}
                required
              />
            </label>
            <label htmlFor="member-avatar">
              Avatar
              <select
                id="member-avatar"
                value={memberAvatar}
                onChange={(event) => setMemberAvatar(event.target.value)}
              >
                <option value="scout">Kaşif</option>
                <option value="builder">Kurucu</option>
                <option value="mage">Büyücü</option>
                <option value="rogue">Gözcü</option>
              </select>
            </label>
            <div className="modal-actions">
              {editingMember && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setEditingMember(null);
                    setMemberName('');
                    setMemberAvatar('scout');
                  }}
                >
                  Yeni üye
                </button>
              )}
              <button
                className="primary-button"
                type="submit"
                disabled={isSaving}
              >
                {editingMember ? 'Değişiklikleri kaydet' : 'Üyeyi ekle'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {backupOpen && (
        <Dialog title="Yedeği geri yükle" onClose={() => setBackupOpen(false)}>
          <BackupPanel
            onImported={() => {
              setShowArchived(true);
              setBackupOpen(false);
            }}
          />
        </Dialog>
      )}
    </div>
  );
}
