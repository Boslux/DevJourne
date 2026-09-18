import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { listMembers, updateTaskState, type Project } from '../lib/tauri';
import {
  archiveTask,
  closeMilestone,
  createMilestone,
  deleteTask,
  listActivity,
  listMilestones,
  moveTask,
  priorityLabels,
  statusLabels,
  taskPage,
  type WorkTask,
} from '../lib/workflow';
import { PixelAvatar, WorldBackdrop } from '../components/PixelArt';
import { Dialog } from '../components/Dialog';
import { TaskEditor } from './TaskEditor';
import { BackupPanel } from './BackupPanel';

type View = 'tasks' | 'milestones' | 'activity' | 'backup';
type RefreshScope = 'tasks' | 'milestones' | 'activity';
type WorkspaceMutation = {
  action: () => Promise<unknown>;
  refresh: RefreshScope[];
};
const activityLabels: Record<string, string> = {
  task_created: 'Görev oluşturuldu',
  task_completed: 'Görev tamamlandı',
  task_reopened: 'Görev yeniden açıldı',
  status_changed: 'Görev durumu değişti',
  assignee_changed: 'Atanan üye değişti',
  task_archived: 'Görev arşivlendi',
  task_restored: 'Görev arşivden çıkarıldı',
  task_deleted: 'Görev silindi',
  milestone_completed: 'Milestone kapatıldı',
  milestone_reopened: 'Milestone yeniden açıldı',
};

function formatDueDate(value: string) {
  const date = new Date(value);
  const label = date.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const overdue = date.getTime() < Date.now();
  return { label, overdue };
}

export function Workspace({
  project,
  onBack,
  onMembers,
  initialView = 'tasks',
}: {
  project: Project;
  onBack: () => void;
  onMembers: () => void;
  initialView?: View;
}) {
  const cache = useQueryClient();
  const [view, setView] = useState<View>(initialView);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState('');
  const [member, setMember] = useState('');
  const [archived, setArchived] = useState(false);
  const [editor, setEditor] = useState<{ task: WorkTask | null } | null>(null);
  const [deleting, setDeleting] = useState<WorkTask | null>(null);
  const [milestoneName, setMilestoneName] = useState('');
  const [celebrating, setCelebrating] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.key.toLowerCase() === 'n' &&
        !target?.matches('input, textarea, select, [contenteditable="true"]')
      ) {
        event.preventDefault();
        setEditor({ task: null });
        return;
      }
      if (
        event.key !== '/' ||
        target?.matches('input, textarea, select, [contenteditable="true"]')
      ) {
        return;
      }
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);
  const filter = {
    project_id: project.id,
    search: deferredSearch,
    status: status || null,
    member_id: member || null,
    archived,
  };
  const key = ['workspace', project.id];
  const tasksQuery = useInfiniteQuery({
    queryKey: [...key, 'tasks', filter],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => taskPage(filter, pageParam),
    getNextPageParam: (last, _pages, offset) =>
      offset + last.tasks.length < last.total
        ? offset + last.tasks.length
        : undefined,
  });
  const membersQuery = useQuery({
    queryKey: [...key, 'members'],
    queryFn: () => listMembers(project.id),
  });
  const milestonesQuery = useQuery({
    queryKey: [...key, 'milestones'],
    queryFn: () => listMilestones(project.id),
  });
  const activityQuery = useInfiniteQuery({
    queryKey: [...key, 'activity'],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => listActivity(project.id, pageParam),
    getNextPageParam: (last, _pages, offset) =>
      last.length === 100 ? offset + 100 : undefined,
    enabled: view === 'activity',
  });
  const mutation = useMutation({
    mutationFn: ({ action }: WorkspaceMutation) => action(),
    onSuccess: async (_result, { refresh }: WorkspaceMutation) => {
      await Promise.all(
        refresh
          .filter((scope) => scope !== 'activity' || view === 'activity')
          .map((scope) =>
            cache.invalidateQueries({ queryKey: [...key, scope] }),
          ),
      );
    },
  });
  const tasks = useMemo(
    () => tasksQuery.data?.pages.flatMap((page) => page.tasks) ?? [],
    [tasksQuery.data],
  );
  const stats = tasksQuery.data?.pages[0];
  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const milestones = useMemo(
    () => milestonesQuery.data ?? [],
    [milestonesQuery.data],
  );
  const membersById = useMemo(
    () => new Map(members.map((item) => [item.id, item])),
    [members],
  );
  const milestonesById = useMemo(
    () => new Map(milestones.map((item) => [item.id, item])),
    [milestones],
  );
  const taskTitlesById = useMemo(
    () => new Map(tasks.map((item) => [item.id, item.title])),
    [tasks],
  );
  const currentMilestone = milestones.find((m) => !m.is_closed);
  const percent = stats?.project_total
    ? Math.round((stats.completed / stats.project_total) * 100)
    : 0;
  const scroll = useRef<HTMLDivElement>(null);
  // React Compiler is not enabled; keep this mutable virtualizer local to this component.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtual = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 220,
    overscan: 4,
    getItemKey: (index) => tasks[index]?.id ?? index,
    enabled: tasks.length > 30,
  });
  const busy = mutation.isPending;
  const error =
    mutation.isError ||
    tasksQuery.isError ||
    membersQuery.isError ||
    milestonesQuery.isError ||
    (view === 'activity' && activityQuery.isError);
  function run(action: () => Promise<unknown>, refresh: RefreshScope[]) {
    if (!busy) mutation.mutate({ action, refresh });
  }
  async function complete(task: WorkTask) {
    await updateTaskState({
      id: task.id,
      project_id: project.id,
      status: task.status === 'done' ? 'todo' : 'done',
      priority: task.priority,
    });
    if (task.status !== 'done') setCelebrating(task.id);
  }
  function card(task: WorkTask, index: number) {
    const assignee = membersById.get(task.assigned_member_id ?? '');
    const dueDate = task.due_at ? formatDueDate(task.due_at) : null;
    return (
      <article
        className={`quest-card quest-${task.status} ${celebrating === task.id ? 'quest-celebrate' : ''}`}
        onAnimationEnd={() => setCelebrating(null)}
        aria-label={task.title}
      >
        <span className="quest-number" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="quest-top">
          <span className={`status-pill status-${task.status}`}>
            {statusLabels[task.status]}
          </span>
          <span className={`priority priority-${task.priority}`}>
            {priorityLabels[task.priority]}
          </span>
        </div>
        <button
          className="task-title-button"
          onClick={() => setEditor({ task })}
        >
          {task.title}
        </button>
        {task.description && (
          <p className="quest-description">{task.description}</p>
        )}
        <div className="quest-meta">
          <span className="assignee">
            <PixelAvatar kind={assignee?.avatar_key} />
            {assignee
              ? `${assignee.name}${!assignee.is_active ? ' · Devre dışı' : ''}`
              : 'Atanmamış'}
          </span>
          {task.due_at && dueDate && (
            <time
              className={
                dueDate.overdue ? 'due-date due-date-overdue' : 'due-date'
              }
              dateTime={task.due_at}
            >
              ◷ {dueDate.overdue ? 'Süresi geçti · ' : ''}
              {dueDate.label}
            </time>
          )}
          {task.milestone_id && (
            <span>
              ⚑ {milestonesById.get(task.milestone_id)?.name ?? 'Milestone'}
            </span>
          )}
        </div>
        <div className="quest-actions">
          <button
            className={
              task.status === 'done' ? 'secondary-button' : 'complete-button'
            }
            disabled={busy || archived}
            onClick={() =>
              run(() => complete(task), ['tasks', 'milestones', 'activity'])
            }
          >
            {task.status === 'done' ? 'Yeniden aç' : '✓ Tamamla'}
          </button>
          <button
            className="secondary-button"
            onClick={() => setEditor({ task })}
          >
            Düzenle
          </button>
          <details className="task-menu">
            <summary aria-label={`${task.title} işlemleri`}>•••</summary>
            <div>
              <button
                disabled={
                  busy || archived || Boolean(search || status || member)
                }
                onClick={() =>
                  run(() => moveTask(project.id, task.id, -1), ['tasks'])
                }
              >
                ↑ Yukarı taşı
              </button>
              <button
                disabled={
                  busy || archived || Boolean(search || status || member)
                }
                onClick={() =>
                  run(() => moveTask(project.id, task.id, 1), ['tasks'])
                }
              >
                ↓ Aşağı taşı
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  run(
                    () => archiveTask(project.id, task.id, !task.is_archived),
                    ['tasks', 'milestones', 'activity'],
                  )
                }
              >
                {task.is_archived ? 'Arşivden çıkar' : 'Arşivle'}
              </button>
              <button onClick={() => setDeleting(task)}>Görevi sil…</button>
            </div>
          </details>
        </div>
      </article>
    );
  }
  return (
    <section className="workspace" aria-label={`${project.name} çalışma alanı`}>
      <div className="workspace-breadcrumb">
        <button className="text-button" onClick={onBack}>
          ← Projeler
        </button>
        <span>/</span>
        <span>{project.name}</span>
        <span className="local-badge">Çevrimdışı hazır</span>
      </div>
      <header className="project-hero">
        <div className="project-identity">
          <span className="project-thumbnail hero-thumbnail" aria-hidden="true">
            ⚑
          </span>
          <div>
            <p className="eyebrow">BİR SONRAKİ ADIMIN</p>
            <h1>{project.name}</h1>
            <p>{project.summary || 'Küçük adımlar. Oynanabilir bir dünya.'}</p>
          </div>
        </div>
        <div className="hero-progress">
          <span>
            Proje ilerlemesi <strong>%{percent}</strong>
          </span>
          <progress max={100} value={percent} aria-label="Proje ilerlemesi" />
          <small>
            {stats?.completed ?? 0} / {stats?.project_total ?? 0} görev
            tamamlandı
          </small>
        </div>
        <div className="hero-milestone">
          <span className="eyebrow">SIRADAKİ HEDEF</span>
          <strong>{currentMilestone?.name ?? 'Rotanı belirle'}</strong>
          <small>
            {currentMilestone
              ? `${currentMilestone.completed} / ${currentMilestone.total} tamamlandı`
              : 'Bir milestone ekleyerek başla'}
          </small>
        </div>
      </header>
      <nav className="workspace-tabs" aria-label="Proje görünümleri">
        {(['tasks', 'milestones', 'activity', 'backup'] as const).map(
          (value) => (
            <button
              key={value}
              aria-current={view === value ? 'page' : undefined}
              onClick={() => setView(value)}
            >
              {
                {
                  tasks: '⌁ Görev yolu',
                  milestones: '⚑ Milestone',
                  activity: '◷ Aktivite',
                  backup: '⇩ Yedekleme',
                }[value]
              }
            </button>
          ),
        )}
        <button onClick={onMembers}>♟ Ekip</button>
      </nav>
      {error && (
        <div className="error-message" role="alert">
          İşlem tamamlanamadı. Verilerinizin kaydedildiği varsayılmadı. Lütfen
          tekrar deneyin.
          <button
            className="text-button"
            onClick={() => {
              mutation.reset();
              void cache.invalidateQueries({ queryKey: key });
            }}
          >
            Yeniden dene
          </button>
        </div>
      )}
      {view === 'tasks' && (
        <>
          <div
            className="task-toolbar"
            role="search"
            aria-label="Görev filtreleri"
          >
            <label className="search-field">
              <span aria-hidden="true">⌕</span>
              <input
                ref={searchInputRef}
                type="search"
                aria-label="Görevlerde ara"
                placeholder="Görev veya etiket ara…"
                maxLength={200}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd aria-hidden="true">/</kbd>
            </label>
            <select
              aria-label="Duruma göre filtrele"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Tüm durumlar</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="Üyeye göre filtrele"
              value={member}
              onChange={(e) => setMember(e.target.value)}
            >
              <option value="">Tüm ekip</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            {(search || status || member || archived) && (
              <button
                className="secondary-button clear-filters-button"
                type="button"
                onClick={() => {
                  setSearch('');
                  setStatus('');
                  setMember('');
                  setArchived(false);
                }}
              >
                Filtreleri temizle
              </button>
            )}
            <button
              className="primary-button"
              aria-keyshortcuts="n"
              disabled={
                membersQuery.isPending ||
                milestonesQuery.isPending ||
                membersQuery.isError ||
                milestonesQuery.isError
              }
              onClick={() => setEditor({ task: null })}
            >
              ＋ Yeni görev <kbd className="button-shortcut">N</kbd>
            </button>
          </div>
          <div className="route-caption">
            <span>
              MACERA ROTASI{' '}
              <strong aria-live="polite">
                {stats?.total ?? 0} görev gösteriliyor
                {(search || status || member || archived) &&
                  ` / ${stats?.project_total ?? 0} toplam`}
              </strong>
            </span>
            <label>
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => setArchived(e.target.checked)}
              />{' '}
              Görev arşivi
            </label>
          </div>
          <div className="quest-world">
            <WorldBackdrop />
            <div
              ref={scroll}
              className="quest-scroll"
              aria-label="Proje görevleri"
              tabIndex={0}
            >
              {tasksQuery.isPending ? (
                <p className="route-empty" role="status">
                  Görev yolu yükleniyor…
                </p>
              ) : tasks.length === 0 ? (
                <div className="route-empty">
                  <PixelAvatar />
                  <h2>
                    {search || status || member
                      ? 'Eşleşen görev yok'
                      : archived
                        ? 'Arşiv henüz boş'
                        : 'Her macera bir adımla başlar.'}
                  </h2>
                  <p>
                    {search || status || member
                      ? 'Aramanı veya filtrelerini değiştir.'
                      : archived
                        ? 'Arşiv görevlerini görmek için arşiv filtresini kapat.'
                        : 'İlk görevini ekle, rotan burada şekillensin.'}
                  </p>
                  {!search && !status && !member && !archived && (
                    <button
                      className="primary-button route-empty-action"
                      onClick={() => setEditor({ task: null })}
                    >
                      ＋ İlk görevi ekle
                    </button>
                  )}
                </div>
              ) : tasks.length <= 30 ? (
                <div className="quest-list">
                  {tasks.map((task, index) => (
                    <div key={task.id}>{card(task, index)}</div>
                  ))}
                </div>
              ) : (
                <div
                  className="quest-list virtual-list"
                  style={{ height: virtual.getTotalSize() }}
                >
                  {virtual.getVirtualItems().map((item) => {
                    const task = tasks[item.index];
                    return task ? (
                      <div
                        key={task.id}
                        data-index={item.index}
                        ref={virtual.measureElement}
                        className="virtual-row"
                        style={{ transform: `translateY(${item.start}px)` }}
                      >
                        {card(task, item.index)}
                      </div>
                    ) : null;
                  })}
                </div>
              )}
              {tasksQuery.hasNextPage && (
                <button
                  className="secondary-button load-more"
                  disabled={tasksQuery.isFetchingNextPage}
                  onClick={() => void tasksQuery.fetchNextPage()}
                >
                  {tasksQuery.isFetchingNextPage
                    ? 'Yükleniyor…'
                    : 'Sonraki 100 görevi yükle'}
                </button>
              )}
            </div>
          </div>
        </>
      )}
      {view === 'milestones' && (
        <section className="milestone-panel">
          <div>
            <p className="eyebrow">BÜYÜK HEDEF, KÜÇÜK ADIMLAR</p>
            <h2>Oyununun dönüm noktaları</h2>
            <p className="muted">
              Görev düzenleyicisinden görevleri bir milestone’a bağla.
            </p>
          </div>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!milestoneName.trim()) return;
              run(async () => {
                await createMilestone(project.id, milestoneName);
                setMilestoneName('');
              }, ['milestones']);
            }}
          >
            <label>
              Milestone adı
              <input
                required
                maxLength={120}
                value={milestoneName}
                onChange={(e) => setMilestoneName(e.target.value)}
              />
            </label>
            <button className="primary-button" disabled={busy}>
              Milestone ekle
            </button>
          </form>
          {milestones.length === 0 && (
            <p className="route-empty">
              İlk oynanabilir sürüm, demo veya yayın için bir hedef oluştur.
            </p>
          )}
          {milestones.map((m) => (
            <article key={m.id} className="milestone-card">
              <span className="milestone-flag" aria-hidden="true">
                ⚑
              </span>
              <div>
                <h3>{m.name}</h3>
                <p>
                  {m.completed} / {m.total} görev ·{' '}
                  {m.is_closed ? 'Kapalı' : 'Açık'}
                </p>
                <progress
                  aria-label={`${m.name} ilerlemesi`}
                  max={m.total || 1}
                  value={m.completed}
                />
              </div>
              <button
                className="secondary-button"
                disabled={busy || (!m.is_closed && m.total !== m.completed)}
                onClick={() =>
                  run(
                    () => closeMilestone(project.id, m.id, !m.is_closed),
                    ['milestones', 'activity'],
                  )
                }
              >
                {m.is_closed ? 'Yeniden aç' : 'Milestone’u kapat'}
              </button>
            </article>
          ))}
        </section>
      )}
      {view === 'activity' && (
        <section className="activity-panel">
          <p className="eyebrow">İLERLEMENİN İZLERİ</p>
          <h2>Aktivite günlüğü</h2>
          {activityQuery.isPending ? (
            <p role="status">Yükleniyor…</p>
          ) : !activityQuery.data?.pages[0]?.length ? (
            <p className="route-empty">
              Görevlerde yaptığın değişiklikler burada görünecek.
            </p>
          ) : (
            <ol className="activity-list">
              {activityQuery.data.pages.flat().map((a) => (
                <li key={a.id}>
                  <span aria-hidden="true">
                    {a.activity_type === 'task_completed' ? '✓' : '◷'}
                  </span>
                  <div>
                    <strong>
                      {activityLabels[a.activity_type] ?? 'Proje güncellendi'}
                    </strong>
                    <small>
                      {taskTitlesById.get(a.entity_id) ??
                        `Kayıt ${a.entity_id.slice(0, 8)}`}
                    </small>
                  </div>
                  <time dateTime={a.created_at}>
                    {new Date(a.created_at).toLocaleString('tr-TR')}
                  </time>
                </li>
              ))}
            </ol>
          )}
          {activityQuery.hasNextPage && (
            <button
              className="secondary-button"
              disabled={activityQuery.isFetchingNextPage}
              onClick={() => void activityQuery.fetchNextPage()}
            >
              Daha eski kayıtlar
            </button>
          )}
        </section>
      )}
      {view === 'backup' && <BackupPanel project={project} />}
      {editor && (
        <TaskEditor
          projectId={project.id}
          task={editor.task}
          members={members}
          milestones={milestones}
          onClose={() => setEditor(null)}
        />
      )}
      {deleting && (
        <Dialog
          title="Görevi sil?"
          busy={busy}
          onClose={() => setDeleting(null)}
        >
          <p>
            “{deleting.title}” kalıcı olarak silinecek. Bu işlem geri alınamaz.
          </p>
          {mutation.isError && (
            <p role="alert" className="error-message">
              Görev silinemedi. Tekrar deneyin.
            </p>
          )}
          <div className="modal-actions">
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Vazgeç
            </button>
            <button
              className="danger-button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await deleteTask(project.id, deleting.id);
                  setDeleting(null);
                }, ['tasks', 'milestones', 'activity'])
              }
            >
              Görevi sil
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
