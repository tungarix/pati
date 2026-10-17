# Pati v1.0 yol haritası

Hedef: GitHub'da yayınlanabilir, topluluğun karakter, ses ve eklenti üretebildiği, yerel yapay zekâyla
konuşabilen bir masaüstü maskotu. Hiçbir şey kullanıcının bilgisi dışında internete gitmez; yapay zekâ
varsayılan olarak bilgisayarın kendisinde çalışır.

Her faz kendi başına çalışan bir sürümle biter (v0.2, v0.3...). Sıra, sonraki fazların üstüne
kurulacağı temeli önce atacak şekilde seçildi.

## Faz 0: Temel (v0.2)

Büyümeden önce iskeleti sağlamlaştır.

- Git deposu, MIT lisansı, `.editorconfig`, ESLint + Prettier.
- Mimari: maskot davranışı bir **durum makinesine** taşınır (idle, walk, fall, climb, sit, drag, talk,
  sleep...). Pencere kodu sadece çizer; fizik ve davranış test edilebilir saf modüller olur.
- **Paket biçimi v2**: her paketin `manifest.json`'u olur (`type: character | voice | plugin`,
  `version`, `minAppVersion`). v1 karakter paketleri otomatik okunmaya devam eder.
- **Çoklu dil**: tüm arayüz metinleri `locales/tr.json` ve `locales/en.json`'a taşınır, ayarlardan dil
  seçilir. Karakter replikleri de dil başına yazılabilir (`lines.tr`, `lines.en`).
- GitHub Actions: her push'ta tip kontrolü, lint, testler.

## Faz 1: Shimeji fiziği (v0.3)

Masaüstü hayvanlarını ünlü yapan davranış.

- Yerçekimi ve zemin: görev çubuğunun üstünde yürür, havada bırakılırsa düşer.
- **Pencereler zemin olur**: açık pencerelerin üst kenarında yürür, oturur; pencere kapanınca ya da
  taşınınca düşer. Windows'ta pencere konumları `user32` (EnumWindows, GetWindowRect,
  DwmGetWindowAttribute) üzerinden okunur, yerel modül derlemeye gerek kalmadan `koffi` ile.
- Ekran kenarına ve pencere yanlarına tırmanma, tavanda asılı durma.
- Fırlatma: sürükleyip bırakınca hızıyla uçar, sekip düşer.
- Çoklu maskot: aynı anda birden fazla karakter, birbirine çarpar, selamlaşır.
- Yeni animasyonlar paket biçimine eklenir: `fall`, `land`, `climb`, `hang`, `sit`, `thrown`.
  Eksik olan `idle`'a düşer, yani eski paketler bozulmaz.

## Faz 2: Ses paketleri (v0.4)

- **Ses paketi** = kayıtlı ses dosyaları (ogg/mp3/wav) + hangi olayda hangisinin çalacağını söyleyen
  `manifest.json`: selam, şaka, hatırlatıcı, uyanma, tıklanma, düşme, efektler.
  Kendi sesini kaydedip yükleyebilirsin; karakter paketi kendi ses paketini önerebilir.
- Kayıt yoksa sırayla: **Piper** (yerel nöral TTS, Türkçe sesi var, internet gerekmez) → Windows'un
  kendi sesi.
- Ayarlarda ses seviyesi, sessiz saatler, olay başına aç/kapat.

## Faz 3: Yerel yapay zekâ ile sohbet (v0.5)

- Maskota tıkla → "Sohbet et" → balonun altında yazı kutusu; cevap kelime kelime akar, karakter
  konuşma animasyonuyla okur (Faz 2'deki sesle).
- Arka uç seçenekleri: **Ollama** (varsayılan, `localhost:11434`) ve OpenAI uyumlu her yerel sunucu
  (LM Studio, llama.cpp server). Önerilen modeller ~8-9B sınıfı (ör. Qwen 8B, Gemma 9B); ayarlardan
  seçilir, kurulu modeller listelenir. Uzak API (Claude vb.) isteğe bağlı, anahtar kullanıcıdan.
- **Kişilik**: karakter paketindeki `persona` (sistem istemi) karakteri konuşturur; Tungarix kendi
  ağzıyla konuşur.
- Kısa hafıza: son konuşmalar yerelde tutulur, istenirse silinir.
- Araçlar: "17:00'de hatırlat" dersen hatırlatıcı kurar, "saat kaç" gibi şeyleri yerel yapar.
- Model yoksa ya da Ollama kapalıysa maskot bunu nazikçe söyler ve kurulum rehberine götürür.

## Faz 4: Eklenti sistemi (v0.6)

- Eklenti = `manifest.json` + tek bir JS dosyası. Ayrı bir süreçte, yalnızca izin verilen API ile çalışır:
  `say()`, `ask()`, `remind()`, zamanlayıcılar, olaylar (tıklandı, uyandı, saat başı), kendi ayar
  şeması. Ağ ve dosya erişimi manifestte izin olarak istenir, kurulumda kullanıcıya gösterilir.
- Yerleşik eklentiler (aynı API ile, örnek olsun diye): Pomodoro, pil uyarısı, hava durumu
  (Open-Meteo, anahtarsız), CPU/RAM izleme, yapay zekâ sohbeti.

## Faz 5: Karakter stüdyosu (v0.7)

Kod bilmeden kendi maskotunu yapmak için.

- Piksel editörü: ızgara, palet, kalem/silgi/doldur, animasyon başına kareler, soğan kabuğu,
  canlı önizleme (maskotu masaüstünde dener gibi).
- İçe aktarma: sprite sheet (ızgaraya göre böl), GIF (kareleri ayır), tek tek PNG'ler.
- Replikler, kişilik (persona) ve ses paketi seçimi aynı ekrandan.
- `.pati` olarak dışa aktar (zip: manifest + kareler).

## Faz 6: Paket galerisi (v0.8)

- Ayrı bir GitHub deposu (`pati-gallery`): `index.json` + paketler. Herkes PR ile paket ekler; CI paketi
  doğrular (manifest, boyut, kare sayısı).
- Uygulamada "Galeri" sekmesi: önizlemeli liste, tek tıkla kur/kaldır, güncellemeler.
- Çift tıkla `.pati` dosyası kurulur. Eklenti içeren paketler izinleri göstermeden kurulmaz.

## Faz 7: Yayın (v1.0)

- GitHub Actions: `v*` etiketinde Windows kurulum dosyasını derleyip Releases'a koyar.
- `electron-updater` ile otomatik güncelleme (GitHub Releases'tan).
- Tanıtım sitesi (GitHub Pages): GIF'ler, indirme butonu, karakter yapma rehberi.
- README İngilizce + Türkçe, ekran kaydı GIF'leri; CONTRIBUTING, issue/PR şablonları, davranış kuralları,
  paket yapma rehberi (karakter, ses, eklenti).
- Kod imzalama yok (ücretli); SmartScreen uyarısı README'de anlatılır.

## Bilinçli olarak dışarıda

- Mac ve Linux: mimari engellemiyor (pencere konumları platform modülünün arkasında), ama v1.0'da
  yalnızca Windows test edilir.
- Telemetri, hesap, reklam: hiç.
