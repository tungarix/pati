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
- Uyandırma: kısayol tuşu (bas-konuş) ile başla; isteğe bağlı uyandırma kelimesi ("Hey Atlas").
- Konuşmayı yazıya çevirme yerelde: whisper.cpp. Bilgisayarda yoksa indirme rehberi.
- Sesli cevap: kayıt yoksa yerel nöral TTS (Piper, Türkçe sesi var), o da yoksa Windows sesi.
- Ses paketleri: karakterin kayıtlı sesleri (selam, onay, uyarı) + `manifest.json`.
- Konuşurken ağız animasyonu sesle eşleşir.

### v0.5: depo ve kalite
- GitHub Actions: her push'ta tip kontrolü, testler; `v*` etiketinde kurulum dosyasını Releases'a koyma.
- ESLint + Prettier.
- `electron-updater` ile otomatik güncelleme.
- Eğitim verisi: balonda 👍/👎; beğenilen cevaplar yerel bir veri setinde birikir. Birkaç yüz örnek
  olunca küçük bir modeli karakter tarzıyla ince ayarlamak (QLoRA, bulut GPU) mümkün olur.

### v0.6: Shimeji fiziği
- Yerçekimi; açık pencerelerin üst kenarında yürüme ve oturma; kenarlara tırmanma; fırlatınca düşme.
  Pencere konumları `user32` üzerinden (`koffi` ile, yerel modül derlemeden).
- Yeni animasyonlar: `fall`, `land`, `climb`, `sit`, `thrown`; eksik olan `idle`'a düşer.
- Aynı anda birden fazla karakter.

### v0.7: eklenti sistemi
- Eklenti = `manifest.json` + tek JS dosyası; ayrı süreçte, yalnızca izin verilen API ile
  (`say`, `ask`, `remind`, zamanlayıcılar, olaylar, kendi ayarları). Ağ ve dosya erişimi izinle.
- Yerleşik eklentiler bu API ile yeniden yazılır (pomodoro, hava durumu, sistem durumu).

### v0.8: karakter stüdyosu ve paket galerisi
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
