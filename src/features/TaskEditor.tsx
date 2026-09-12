import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog } from '../components/Dialog';
import type { Member } from '../lib/tauri';
import {
  isPriority,
  isStatus,
  priorityLabels,
  saveWorkTask,
  statusLabels,
  tagsSchema,
  taskSchema,
  type WorkTask,
  type Milestone,
} from '../lib/workflow';

export function TaskEditor({
  projectId,
  task,
  members,
  milestones,
  onClose,
}: {
  projectId: string;
  task: WorkTask | null;
  members: Member[];
  milestones: Milestone[];
  onClose: () => void;
}) {
  const cache = useQueryClient();
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [member, setMember] = useState(task?.assigned_member_id ?? '');
  const [milestone, setMilestone] = useState(task?.milestone_id ?? '');
  const [due, setDue] = useState(task?.due_at ?? '');
  const [status, setStatus] = useState(task?.status ?? 'todo');
  const [priority, setPriority] = useState(task?.priority ?? 'normal');
  const parsedTags = tagsSchema.safeParse(
    task ? JSON.parse(task.tags_json) : [],
  );
  const [tags, setTags] = useState(
    parsedTags.success ? parsedTags.data.join(', ') : '',
  );
  const [validation, setValidation] = useState('');
  const mutation = useMutation({
    mutationFn: saveWorkTask,
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({
          queryKey: ['workspace', projectId, 'tasks'],
        }),
        cache.invalidateQueries({
          queryKey: ['workspace', projectId, 'milestones'],
        }),
        cache.invalidateQueries({
          queryKey: ['workspace', projectId, 'activity'],
        }),
      ]);
      onClose();
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (mutation.isPending) return;
    const fields = taskSchema.safeParse({ title, description });
    const tagList = tagsSchema.safeParse(
      tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    );
    if (!fields.success || !tagList.success) {
      setValidation(
        'Başlık 1–200 karakter; en fazla 10 etiket ve her etiket 1–40 karakter olmalı.',
      );
      return;
    }
    setValidation('');
    mutation.mutate({
      id: task?.id ?? null,
      project_id: projectId,
      ...fields.data,
      status,
      priority,
      assigned_member_id: member || null,
      milestone_id: milestone || null,
      due_at: due || null,
      tags: tagList.data,
    });
  }
  return (
    <Dialog
      title={task ? 'Görevi düzenle' : 'Yeni görev'}
      onClose={onClose}
      busy={mutation.isPending}
    >
      <form onSubmit={submit}>
        {(validation || mutation.isError) && (
          <p role="alert" className="error-message">
            {validation ||
              'Görev kaydedilemedi. Alanları ve bağlantıları kontrol edip tekrar deneyin.'}
          </p>
        )}
        <label>
          Görev başlığı
          <input
            autoFocus
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Açıklama
          <textarea
            maxLength={2000}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="form-pair">
          <label>
            Durum
            <select
              value={status}
              onChange={(e) => {
                if (isStatus(e.target.value)) setStatus(e.target.value);
              }}
            >
              {Object.entries(statusLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Öncelik
            <select
              value={priority}
              onChange={(e) => {
                if (isPriority(e.target.value)) setPriority(e.target.value);
              }}
            >
              {Object.entries(priorityLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-pair">
          <label>
            Atanan üye
            <select value={member} onChange={(e) => setMember(e.target.value)}>
              <option value="">Atanmamış</option>
              {members
                .filter((m) => m.is_active || m.id === task?.assigned_member_id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {!m.is_active ? ' (Devre dışı)' : ''}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Milestone
            <select
              value={milestone}
              onChange={(e) => setMilestone(e.target.value)}
            >
              <option value="">Milestone yok</option>
              {milestones
                .filter((m) => !m.is_closed || m.id === task?.milestone_id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.is_closed ? ' (Kapalı)' : ''}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <label>
          Bitiş tarihi
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </label>
        <label>
          Etiketler <span>Virgülle ayırın</span>
          <input
            value={tags}
            maxLength={410}
            onChange={(e) => setTags(e.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            Vazgeç
          </button>
          <button className="primary-button" disabled={mutation.isPending}>
            {mutation.isPending
              ? 'Kaydediliyor…'
              : task
                ? 'Değişiklikleri kaydet'
                : 'Görevi ekle'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
