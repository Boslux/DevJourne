# DevQuest

**A local-first, offline-capable workflow tracker for game developers.**

[English](#english) · [Türkçe](#türkçe)

## English

DevQuest is a desktop productivity application for solo game developers and small teams. It turns everyday development work into a clear, visual workflow with a lightweight pixel-art personality—without turning project management into a game.

### Highlights

- Create, edit, archive, and delete projects and tasks
- Track status, priority, assignee, tags, and due dates
- Organize work in a visual task path
- Manage local team members and milestones
- Review an activity history of important changes
- Import and export versioned project backups as JSON
- Store data locally in SQLite with no account or cloud service required
- Work fully offline with a small permission surface

DevQuest does not include AI features, telemetry, advertising, or a required network connection.

### Getting started

1. Open DevQuest and create a project.
2. Add local project members.
3. Create tasks and set their status, priority, assignee, and optional due date.
4. Reorder tasks in the workflow and update their status as work progresses.
5. Export regular project backups and import a compatible JSON backup when needed.

Your data is stored in the application's private local data directory as a SQLite database. It remains available without an internet connection.

### Development

Requirements: Node.js, Rust, and the Tauri development prerequisites for your platform.

```bash
npm install
npm run dev
```

Run the desktop application in development mode:

```bash
npm run tauri dev
```

Useful checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

### Technology

React · TypeScript · Vite · Tauri 2 · Rust · SQLite · SQLx

### Security and privacy

DevQuest is designed to be local-first and offline by default. The repository does not require application secrets, remote scripts, cloud accounts, or unrestricted system permissions. User task content is stored locally and is not uploaded by the application.

### License

No license has been selected yet. Until a license is added, the redistribution terms for this source code are not formally defined.

## Türkçe

DevQuest, bağımsız oyun geliştiricileri ve küçük ekipler için hazırlanmış, yerel çalışan ve çevrimdışı kullanılabilen bir masaüstü görev takip uygulamasıdır. Proje yönetimini oyuna dönüştürmeden, oyun geliştirme sürecine uygun görsel bir iş akışı ve hafif piksel-art karakteri sunar.

### Öne çıkanlar

- Proje ve görev oluşturma, düzenleme, arşivleme ve silme
- Durum, öncelik, sorumlu, etiket ve son tarih yönetimi
- Dikey görsel görev iş akışı
- Yerel ekip üyesi ve milestone yönetimi
- Önemli değişiklikler için aktivite geçmişi
- Sürümlü JSON proje yedeği içe/dışa aktarma
- Hesap veya bulut servisi gerektirmeyen yerel SQLite saklama
- Küçük izin alanı ve tam çevrimdışı kullanım

DevQuest yapay zekâ özelliği, telemetri, reklam veya zorunlu ağ bağlantısı içermez.

### Başlangıç

1. DevQuest’i açıp bir proje oluşturun.
2. Projeye yerel ekip üyeleri ekleyin.
3. Görevler oluşturup durum, öncelik, sorumlu ve isteğe bağlı son tarih atayın.
4. Görevleri iş akışında sıralayın ve ilerledikçe durumlarını güncelleyin.
5. Düzenli proje yedekleri alın; gerektiğinde uyumlu JSON yedeğini içe aktarın.

Veriler uygulamanın özel yerel veri klasöründeki SQLite veritabanında tutulur ve internet bağlantısı olmadan kullanılabilir.

### Geliştirme

Gereksinimler: Node.js, Rust ve platformunuza uygun Tauri geliştirme araçları.

```bash
npm install
npm run dev
npm run tauri dev
```

Kontroller için İngilizce bölümdeki komutları kullanabilirsiniz.

### Teknoloji

React · TypeScript · Vite · Tauri 2 · Rust · SQLite · SQLx

### Lisans

Henüz bir lisans seçilmemiştir. Lisans eklenene kadar kaynak kodun yeniden dağıtım koşulları resmî olarak tanımlanmış değildir.
