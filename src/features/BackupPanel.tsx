import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Project } from '../lib/tauri';
import { exportProject, importProject } from '../lib/workflow';

export function BackupPanel({
  project,
  onImported,
}: {
  project?: Project;
  onImported?: (project: Project) => void;
}) {
  const cache = useQueryClient();
  const [json, setJson] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fileName, setFileName] = useState('');
  const mutation = useMutation({
    mutationFn: (action: () => Promise<void>) => action(),
  });
  async function readFile(file: File | undefined) {
    setError('');
    setNotice('');
    setJson('');
    setFileName('');
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('Yedek dosyası en fazla 10 MB olabilir.');
      return;
    }
    try {
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === 'string'
            ? resolve(reader.result)
            : reject(new Error('READ_FAILED'));
        reader.onerror = () => reject(new Error('READ_FAILED'));
        reader.readAsText(file);
      });
      setJson(content);
      setFileName(file.name);
    } catch {
      setError('Dosya okunamadı.');
    }
  }
  return (
    <section className="backup-panel">
      <p className="eyebrow">VERİLERİN SENİNLE</p>
      <h2>Yedekle ve geri yükle</h2>
      <p>
        Projen, görevlerin, ekibin, milestone’ların ve aktivite geçmişin tek bir
        dosyada.
      </p>
      {(error || mutation.isError) && (
        <p role="alert" className="error-message">
          {error ||
            'Yedekleme işlemi tamamlanamadı. Dosya biçimini, boyutunu ve verilerini kontrol edip tekrar deneyin.'}
        </p>
      )}
      {notice && (
        <p className="success-message" role="status">
          {notice}
        </p>
      )}
      {project && (
        <div className="backup-block">
          <h3>Bir kopyasını sakla</h3>
          <p>Bu projenin sürümlü JSON yedeğini indir.</p>
          <button
            className="primary-button"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate(async () => {
                setNotice('');
                const content = await exportProject(project.id);
                const url = URL.createObjectURL(
                  new Blob([content], { type: 'application/json' }),
                );
                const link = document.createElement('a');
                link.href = url;
                link.download = `devquest-${project.id}.json`;
                link.click();
                window.setTimeout(() => URL.revokeObjectURL(url), 30000);
                setNotice(
                  'Yedek dosyası hazırlandı. İndirme konumunu kontrol edin.',
                );
              })
            }
          >
            ⇩ Projeyi dışa aktar
          </button>
        </div>
      )}
      <div className="backup-block">
        <h3>Yedeğinden devam et</h3>
        <p>
          Geri yükleme yeni bir proje kopyası oluşturur. Mevcut projeler
          korunur. En fazla 10 MB.
        </p>
        <label className="file-input">
          JSON yedeği seç
          <input
            type="file"
            accept=".json,application/json"
            disabled={mutation.isPending}
            onChange={(e) => void readFile(e.target.files?.[0])}
          />
        </label>
        {fileName && <p>{fileName}</p>}
        <button
          className="secondary-button"
          disabled={!json || mutation.isPending}
          onClick={() =>
            mutation.mutate(async () => {
              setNotice('');
              const imported = await importProject(json);
              await cache.invalidateQueries({ queryKey: ['projects'] });
              setJson('');
              setNotice(`“${imported.name}” yeni proje olarak geri yüklendi.`);
              onImported?.(imported);
            })
          }
        >
          {mutation.isPending ? 'İşleniyor…' : 'Yeni proje olarak geri yükle'}
        </button>
      </div>
    </section>
  );
}
