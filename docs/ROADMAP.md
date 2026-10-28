# Pati yol haritası

Hedef: GitHub'da yayınlanabilir, topluluğun karakter, ses ve eklenti üretebildiği, yerel yapay zekâyla
konuşan ve iş gören bir masaüstü arkadaşı. Hiçbir şey kullanıcının bilgisi dışında internete gitmez;
yapay zekâ kullanıcının kendi bilgisayarında çalışır.

İlk plandan sonra sıra değişti: yapay zekâ ve "JARVIS" özellikleri (eylemler, proaktiflik) öne alındı,
çünkü ürünü asıl farklı kılan onlar.

## Bitti

### v0.1: ilk maskot
Şeffaf, her zaman üstte pencere; sürükleme, dolaşma, uyuma; konuşma balonu ve sesli okuma;
hatırlatıcılar; karakter paketleri; ayarlar penceresi; Windows kurulum dosyası.

### v0.2: temel
- Davranış durum makinesi (`src/core/behavior.ts`), test edilebilir.
- Paket biçimi v2: `manifest.json`, dil başına replikler; v1 paketler okunmaya devam eder.
- Türkçe ve İngilizce arayüz; iki dil dosyasının eşit kaldığını bir test denetler.

### v0.3: yerel yapay zekâ ve JARVIS
- Sohbet: OpenAI uyumlu her yerel sunucu (llama.cpp, Ollama, LM Studio); öncelik sıralı sunucu
  listesi, otomatik sunucu bulma, gerekirse balonda API anahtarı sorma.
- Araçlar: hatırlatıcı kurma, hafıza; isteğe bağlı pano, hava durumu, Wikipedia.
- Beyin: Obsidian'da açılabilen Markdown klasörü: günlük sohbetler ve özetleri, `Memory.md`, `Notes.md`.
  Son günlerin özetiyle süreklilik.
- Eylemler: uygulama, site ve klasör açma, müzik ve ses, sistem durumu, not alma; izin baloncukları
  ("Evet / Her zaman / Hayır").
- Açık komutlar ve sayılar (pil, saat) modele bırakılmaz: küçük modeller burada araç çağırmayı
  atlayıp uyduruyor.
- Proaktif konuşma: sabah brifingi, gece uyarısı, 90 dakikada mola.
- Modern balon ve sohbet akışı (klasik XP balonu ayarlarda seçenek).
- İkinci yerleşik karakter: Atlas.

## Sırada

### v0.4: sesle konuşma
JARVIS hissini tamamlayan adım.
- ✅ Bas-konuş: genel kısayol (`Ctrl+Shift+Space`, ayarlardan değişir); susunca dinleme kendiliğinden biter.
  Mikrofon 16 kHz mono WAV olarak kaydedilir; balonda mikrofon ve dalga göstergesi (modern ve klasik).
- ✅ Konuşmayı yazıya çevirme yerelde: whisper.cpp (`whisper-cli.exe` `PATH`'te ve model yanındaki `models`'ta
  kendiliğinden bulunur, yoksa ayarlardan seçilir; README'de indirme rehberi). Türkçe ve İngilizce.
  Çıkan metin yazılmış gibi sohbete (açık komutlar dahil) gider, cevap sesli okunur.
- Sıradaki adım: uyandırma kelimesi ("Hey Atlas").
- ✅ Sesli cevap: kayıt yoksa yerel nöral TTS (Piper, Türkçe sesi var), o da yoksa Windows sesi.
  `piper.exe` `PATH`'te ya da ayarlardan, ses yanındaki `voices`'ta bulunur; bulunamazsa Windows sesi.
- Ses paketleri: karakterin kayıtlı sesleri (selam, onay, uyarı) + `manifest.json`.
- Konuşurken ağız animasyonu sesle eşleşir.
- ✅ Karakter boyutu: ayarlarda kaydırıcı, sağ tık ve tepsi menüsünde %50–%200.

### v0.5: geri bildirim ve odak modu
İkisi de küçük, mevcut parçaların üstüne kurulur; aynı sürümde çıkar. ✅ Temel hali bitti; kalanlar aşağıda "sonra" diye işaretli.

**👍/👎 eğitim verisi**
- Modern balonda her yapay zekâ cevabının altında iki küçük düğme; klasik balonda yok.
- Basınca beyin klasöründe `Feedback.jsonl`'a bir satır: `{ time, character, model, messages, answer, rating }`.
  `messages` o cevabı üreten konuşmanın tamamı (sistem talimatı dahil), yani doğrudan ince ayar örneği.
  ✅ 👎'ye isteğe bağlı "nasıl olmalıydı?" kutusu; yazılan düzeltme `better` alanına (kayıt kutu kapanınca tek seferde yazılır).
- ✅ Ayarlar > Hafıza'da biriken örnek sayısı (👍/👎) ve klasörü aç düğmesi; `docs/fine-tune.md` rehberi
  (Unsloth ile QLoRA, Qwen3.5-4B; ~300 örnek iyi bir başlangıç, 8 GB kart yeter).
- Test: kayıt biçimi ve dosyaya ekleme, `brain.ts` testlerinde.

**Pomodoro / odak modu**
- Menüde "Odaklan (25 dk)"; sohbette "25 dakika odaklanacağım" (`intents.ts`).
- Odaktayken proaktif konuşma, ipuçları ve dolaşma susar; karakter oturur ya da uyur; balon başlığında
  kalan süre. Hatırlatıcılar susmaz, onlar kullanıcının kendi isteği.
- Bitince kısa mola, 4 turdan sonra uzun mola. Odak bitince 90 dakikalık mola sayacı sıfırlanır,
  iki uyarı çakışmaz. Sonra: süreler ayarlardan (şimdilik 25/5/15 sabit; odak süresi sohbette söylenebilir).
- Zamanlama `proactive.ts` gibi saf bir modülde (`focus.ts`), testli.

### v0.6: ekran farkındalığı
✅ Temel hali bitti: intent, menü düğmesi, izin, tek görüntü, sırayla görebilen sunucuyu bulma. Kalanlar: "görebilir" işareti ve rehber, bölge seçme, panodaki görsel.
- "Ekrana bak", "bu hatayı açıkla" ya da kısayol: Electron `desktopCapturer` ile Pati'nin bulunduğu ekranın
  görüntüsü. Yalnızca istenince, o an; arka planda asla çekilmez.
- Görüntü OpenAI uyumlu `image_url` (base64) olarak gider: llama.cpp'de görsel model + `--mmproj`
  (Qwen2.5-VL 7B, Gemma 3), Ollama'da `qwen2.5vl` / `llava`. Hız ve bağlam için 1280 px'e küçültülür.
- Sunucu listesinde her sunucuya "görebilir" işareti. Görebilen sunucu yoksa Pati bunu söyler ve
  rehbere götürür; metin sunucusu sohbet için kalmaya devam eder.
- Gizlilik: yeni izin türü (`screen`, "Evet / Her zaman / Hayır"); görüntü diske yazılmaz, beyne
  yalnızca soru ve cevap girer.
- Sonra: sürükleyerek bölge seçme, panodaki görsele bakma.

### v0.7: Shimeji fiziği
✅ 1-3 ve 6'nın ayarı bitti (`feat/shimeji`): pencere bilgisi `koffi` yerine küçük bir PowerShell yardımcısıyla (derleme ya da yeni bağımlılık yok), `physics.ts` testli, fırlatma. Kalanlar: tırmanma/oturma, yeni animasyonlar, tam ekranda gizlenme.

En büyük iş; ayrı dalda, sırayla:
1. Pencere bilgisi: `koffi` ile `user32` (`EnumWindows`, `GetWindowRect`, `IsWindowVisible`, gölgesiz kenar
   için `DwmGetWindowAttribute`). Yerel modül derlemesi yok. Saniyede ~10 kez, yalnızca görünür pencereler.
2. Fizik: yerçekimi; zemin görev çubuğu ya da altındaki pencerenin üst kenarı; pencere kapanınca ya da
   kayınca düşer. Saf modül (`physics.ts`), testli.
3. Fırlatma: sürükleme hızından başlangıç hızı, ekran kenarlarından seker.
4. Tırmanma ve oturma: ekran kenarına tırmanır, pencere üstünde oturur.
5. Yeni animasyonlar: `fall`, `land`, `climb`, `sit`, `thrown`; eksik olan `idle`'a düşer. Tungarix ve Atlas
   kareleri `scripts/` üreticilerine eklenir.
6. Ayarlarda aç/kapa; tam ekran oyun ve videoda karakter gizlenir.
- Sonra: aynı anda birden fazla karakter.

### v0.8: depo ve kalite
- GitHub Actions: her push'ta tip kontrolü, testler; `v*` etiketinde kurulum dosyasını Releases'a koyma.
- ESLint + Prettier.
- `electron-updater` ile otomatik güncelleme.

### v0.9: eklenti sistemi
- Eklenti = `manifest.json` + tek JS dosyası; ayrı süreçte, yalnızca izin verilen API ile
  (`say`, `ask`, `remind`, zamanlayıcılar, olaylar, kendi ayarları). Ağ ve dosya erişimi izinle.
- Yerleşik eklentiler bu API ile yeniden yazılır (pomodoro, hava durumu, sistem durumu).

### v0.10: karakter stüdyosu ve paket galerisi
- Uygulama içinde piksel editörü; sprite sheet ve GIF içe aktarma; `.pati` paketi olarak dışa aktarma.
- `pati-gallery` deposu: topluluğun karakter, ses ve eklenti paketleri; uygulamada tek tıkla kurma.

### v1.0: yayın
- Tanıtım sitesi (GitHub Pages), ekran kaydı GIF'leri, paket yapma rehberleri.
- CONTRIBUTING, issue/PR şablonları, davranış kuralları.

## Bilinçli olarak dışarıda

- Mac ve Linux: mimari engellemiyor ama v1.0'da yalnızca Windows test edilir.
- Telemetri, hesap, reklam: hiç.
- Bulut yapay zekâ: varsayılan olarak yok. İleride kullanıcının kendi anahtarıyla isteğe bağlı bir seçenek
  olabilir; mesajların internete gideceği açıkça söylenir.
