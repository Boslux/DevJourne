# DevQuest

DevQuest, oyun geliştiricileri için tasarlanmış, yerel çalışan ve çevrimdışı kullanılabilen bir görev takip masaüstü uygulamasıdır. Görevleri dikey bir iş akışında görmeyi, durumlarını ve sorumlularını hızlıca güncellemeyi kolaylaştırır.

## Öne çıkanlar

- Proje ve görev oluşturma, düzenleme, arşivleme ve silme
- Görev durumu, öncelik, etiket, sorumlu ve son tarih yönetimi
- Milestone ilerlemesi ve aktivite geçmişi
- SQLite ile yerel veri saklama; hesap veya bulut bağlantısı gerekmez
- Oyun geliştirme temasını destekleyen hafif piksel görselleri
- Proje verilerini sürümlü JSON yedeği olarak içe/dışa aktarma

DevQuest ürün içinde yapay zekâ, telemetri veya zorunlu ağ bağlantısı içermez.

## Kullanım

1. Uygulamayı açın ve bir proje oluşturun.
2. Projenize ekip üyeleri ekleyin.
3. Görevlerinizi oluşturup sorumlu, öncelik, durum ve isteğe bağlı son tarih atayın.
4. Görevleri iş akışında sıralayın ve ilerledikçe durumlarını güncelleyin.
5. Düzenli olarak proje yedeği dışa aktarın; gerektiğinde uyumlu JSON yedeğini içe aktarın.

Veriler uygulamanın yerel özel veri klasöründeki SQLite veritabanında tutulur. Uygulama tamamen çevrimdışı çalışabilir.

## Geliştirme

Gereksinimler: Node.js, Rust ve Tauri geliştirme araçları.

```bash
npm install
npm run dev
```

Kontroller:

```bash
npm run typecheck
npm run lint
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

Masaüstü geliştirme için:

```bash
npm run tauri dev
```

## Teknoloji

React, TypeScript, Vite, Tauri 2, Rust, SQLite ve SQLx.

## Lisans

Bu proje için henüz lisans seçilmemiştir. Lisans eklenene kadar kaynak kodun yeniden dağıtım koşulları belirlenmiş değildir.
