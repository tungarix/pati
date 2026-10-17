# Pati

**Ekranında yaşayan, yerel yapay zekâyla konuşan, seni hatırlayan ve iş gören bir masaüstü arkadaşı.**
Eski masaüstü asistanlarının bugüne göre yeniden yapılmış hali: reklam yok, takip yok, yapay zekâ kendi bilgisayarında çalışıyor.

[English](README.md)

- **Masaüstünde yaşar.** Her pencerenin üstünde duran küçük bir karakter. İstediğin yere sürükle, çift tıklayınca zıplasın; kendi kendine dolaşır, sen uzaklaşınca uyur.
- **Yerel yapay zekâyla sohbet eder.** Bilgisayarında çalışan [llama.cpp](https://github.com/ggml-org/llama.cpp), [Ollama](https://ollama.com) ya da [LM Studio](https://lmstudio.ai)'ya bağlanır. Her karakterin kendi kişiliği var.
- **Seni hatırlar.** Bir *beyni* var: günlük sohbetlerin, her günün özeti ve senin paylaştığın bilgiler, düz Markdown dosyaları olarak bir klasörde durur. [Obsidian](https://obsidian.md)'da açıp ne bildiğini düzenleyebilirsin.
- **İş görür.** "Spotify'ı aç", "sesi kıs", "not al: …", "pil kaç?". Bir şey yapmadan önce sorar; "her zaman" diyebilirsin.
- **Gerektiğinde kendisi konuşur.** Sabah bilgisayar başına oturunca kısa bir brifing, 90 dakika ara vermezsen mola hatırlatması, gece çok geç olunca bir uyarı.
- **Hatırlatıcılar.** "Her 60 dakikada su iç", "her gün 17:00'de ders" ya da sohbette söyle: "20 dakika sonra hatırlat".
- **Senin olsun.** Bir klasör PNG kare ve tek bir JSON dosyasıyla kendi karakterini ekle. Türkçe ve İngilizce, modern ya da klasik görünüm.

Yerleşik karakterler: güneş gözlüklü rock kurdu **Tungarix** ve sakin holografik asistan **Atlas**.

## Kurulum

Releases'tan `Pati Setup x.y.z.exe` dosyasını indir ya da kendin derle (aşağıda). Kurulum dosyası imzalı değil; Windows SmartScreen "Yine de çalıştır" diye sorar.

Pati sistem tepsisinde yaşar: tepsi simgesine sağ tıklayınca ayarlar, karakter seçimi ve çıkış gelir.

| Ne yaparsan | Ne olur |
| --- | --- |
| Karaktere tıkla | Menü: sohbet, şaka, saat, ipucu, ayarlar, 1 saat sus, gizle |
| Sürükle | Taşırsın, yerini hatırlar |
| Çift tıkla | Zıplar |
| Sağ tıkla | Ayarlar, karakter, gizle, çıkış |

## Yerel yapay zekâyı bağlama

Pati, bilgisayarındaki OpenAI uyumlu her sunucuyla konuşur. Yaygın portlara (`8080`, `8081`, `11434`, `1234`) kendisi bakar. İstersen **Ayarlar > Yapay zekâ**'dan sunucuları öncelik sırasıyla da listeleyebilirsin: akıllı ama büyük modeli üste, küçük ve hızlı olanı alta koy. Pati çalışan ilk sunucuyu kullanır.

- **llama.cpp:** `llama-server -m model.gguf --jinja`. Araçlar için `--jinja` gerekir. `--api-key` ile başlattıysan Pati ilk seferde anahtarı sohbet balonunda sorar.
- **Ollama:** Kur ve `ollama pull` ile bir model indir; Pati onu 11434 portunda bulur.
- **LM Studio:** Bir model yükle ve yerel sunucuyu başlat.

8 GB ekran kartında 8-9 milyar parametrelik bir model iyi bir başlangıç. Pati küçük modellerin alışkanlıklarına göre çalışır: açık komutları modelin araç çağırmasına bırakmadan kendisi yapar, pil ve saat gibi sayıları modelin tahminine bırakmaz, ölçer.

## Beyin

Varsayılan yeri `Belgeler\Pati Beyni`, ayarlardan değiştirilebilir:

- `Chats/2026-10-17.md`: Her sohbet günü için bir not. Pati en üste kısa bir özet yazar ve son günlerin özetini okuyarak kaldığınız yerden devam eder.
- `Memory.md`: Pati'nin senin hakkında bildikleri, her satırda bir bilgi. Bir satır eklersen öğrenir, silersen unutur.
- `Notes.md`: Ondan aldırdığın notlar.

Klasörü bir kez Obsidian'da kasa olarak aç. Sonra **Ayarlar > Hafıza > Obsidian'da aç** seni doğrudan oraya götürür.

## Gizlilik

- Yapay zekâ senin bilgisayarında çalışır; sohbetler, hafıza ve notlar yerel dosyalarda kalır.
- Uygulamanın dışına çıkan araçlar sen açana kadar **kapalıdır**: panoyu okumak ve internete bakmak (hava durumu için Open-Meteo, Wikipedia).
- Bilgisayardaki eylemler (uygulama, site ve klasör açmak, müzik ve ses) önce sorar. Yalnızca `http(s)` adresleri açılır.
- Telemetri yok, hesap yok, reklam yok.

## Kendi karakterini ekleme

**Ayarlar > Karakter > Klasörü aç** seni `%APPDATA%\pati\characters` klasörüne götürür. Karakterin için oraya bir klasör koy ve **Yenile**'ye bas. Klasörün adı karakterin kimliğidir.

```
characters/
  benim-kedim/
    manifest.json
    character.json
    dur.png  yuru1.png  yuru2.png  uyu.png
```

`manifest.json`:

```json
{ "schema": 2, "type": "character", "name": "Benim Kedim", "version": "1.0.0", "author": "Sen" }
```

`character.json`:

```json
{
  "language": "tr",
  "scale": 4,
  "accent": "#f59e0b",
  "animations": {
    "idle":  { "frames": ["dur.png"], "fps": 1 },
    "walk":  { "frames": ["yuru1.png", "yuru2.png"], "fps": 4 },
    "talk":  { "frames": ["konus.png", "dur.png"], "fps": 6 },
    "sleep": { "frames": ["uyu.png"], "fps": 1 },
    "drag":  { "frames": ["tutuldu.png"], "fps": 1 }
  },
  "voice": { "lang": "tr-TR", "rate": 1, "pitch": 1.2 },
  "persona": "Sen Benim Kedim'sin: kullanıcının masaüstünde yaşayan uykucu ama meraklı bir kedi.",
  "lines": {
    "greet": ["Miyav! Geldim."],
    "menu": "Ne yapalım?",
    "jokes": ["..."],
    "tips": ["..."],
    "wake": ["Uyandım!"],
    "sleep": "Biraz uyuyayım…",
    "thanks": "Sağ ol",
    "hush": "Tamam, susuyorum.",
    "lateNight": ["Geç oldu, yatsak mı?"],
    "breakTime": ["Kısa bir mola zamanı."]
  }
}
```

- Zorunlu olan yalnızca `animations.idle` (ve bir ad). Eksik animasyonun yerine `idle` oynar, eksik repliklerin yerine varsayılanlar gelir.
- `lines`, `language`'deki tek bir set ya da dil başına ayrı setler olabilir: `{ "tr": {...}, "en": {...} }`. `persona` da aynı şekilde çalışır; sohbette karaktere sesini veren sistem talimatıdır.
- `scale`, piksel sanatını keskin kenarlarla büyütür; çizim tarzı görseller için `1` bırak. Karakter ~150 pikseli geçmesin.
- `accent`, modern balonun rengidir.
- Yerleşik bir paketle aynı kimliğe sahip paket onun yerine geçer.

Yerleşik karakterler `scripts/make-tungarix.py` (elle çizilmiş piksel ızgarası) ve `scripts/make-atlas.py` (geometriyle çizim) ile üretilir; ikisini de şablon olarak kullanabilirsin.

## Geliştirme

```bash
npm install
npm start
```

| Komut | Ne yapar |
| --- | --- |
| `npm start` | Derler ve uygulamayı açar |
| `npm test` | Birim testleri (Node'un yerleşik test aracı) |
| `npm run typecheck` | TypeScript kontrolü |
| `npm run dist` | Windows kurulum dosyasını `release/` içine üretir |

Yapı: `src/main` (pencereler, tepsi, yapay zekâ, beyin, araçlar, hatırlatıcılar, ayarlar), `src/core` (davranış durum makinesi), `src/preload.ts` (pencereler ile ana süreç arasındaki tek kapı), `src/renderer` (maskot ve ayarlar pencereleri), `characters/` (yerleşik paketler), `locales/` (Türkçe ve İngilizce).

Planlar: [docs/ROADMAP.md](docs/ROADMAP.md). Değişiklikler: [CHANGELOG.md](CHANGELOG.md).

## Lisans

MIT. Ayrıntılar [LICENSE](LICENSE) dosyasında.
