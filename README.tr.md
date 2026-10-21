# Pati

**Ekranında yaşayan, yerel yapay zekâyla konuşan, seni hatırlayan ve iş gören bir masaüstü arkadaşı.**
Eski masaüstü asistanlarının bugüne göre yeniden yapılmış hali: reklam yok, takip yok, yapay zekâ kendi bilgisayarında çalışıyor.

[English](README.md)

- **Masaüstünde yaşar.** Her pencerenin üstünde duran küçük bir karakter. Görev çubuğunda ve pencerelerin üst kenarında durur, kenardan yürüyüp düşer; istediğin yere sürükle ya da ekranın öbür ucuna fırlat. Kendi kendine dolaşır, sen uzaklaşınca uyur.
- **Yerel yapay zekâyla sohbet eder.** Bilgisayarında çalışan [llama.cpp](https://github.com/ggml-org/llama.cpp), [Ollama](https://ollama.com) ya da [LM Studio](https://lmstudio.ai)'ya bağlanır. Her karakterin kendi kişiliği var.
- **Seni hatırlar.** Bir *beyni* var: günlük sohbetlerin, her günün özeti ve senin paylaştığın bilgiler, düz Markdown dosyaları olarak bir klasörde durur. [Obsidian](https://obsidian.md)'da açıp ne bildiğini düzenleyebilirsin.
- **İş görür.** "Spotify'ı aç", "sesi kıs", "not al: …", "pil kaç?". Bir şey yapmadan önce sorar; "her zaman" diyebilirsin.
- **Sesle konuşur.** Kısayola bas (varsayılan `Ctrl+Shift+Space`), konuş; [whisper.cpp](https://github.com/ggml-org/whisper.cpp) sesini bilgisayarında yazıya çevirir, cevabı balonda görür ve sesli dinlersin.
- **Gerektiğinde kendisi konuşur.** Sabah bilgisayar başına oturunca kısa bir brifing, 90 dakika ara vermezsen mola hatırlatması, gece çok geç olunca bir uyarı.
- **İstersen ekranına bakar.** "Ekrana bak", "bu hatayı açıkla" ya da menüde **Ekrana bak**: izin sorar, tek bir ekran görüntüsü alıp görsel bir modele gösterir (llama.cpp'de `--mmproj` ile, Ollama'da `qwen2.5vl`). Görüntü hiçbir yere kaydedilmez.
- **Odak modu.** "Odaklan" (ya da "50 dakika odaklanacağım") bir pomodoro başlatır: susar, süre bitince 5 dakika mola, her dördüncü turda uzun mola söyler.
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

### Önerilen model: Pati-4B

Pati-4B, Pati için ince ayar yapılmış küçük bir model: hatırlatıcı kurmak, anlattıklarını hatırlamak, uygulama ve site
açmak, müziği yönetmek, not almak ve kısa, sıcak sohbet; ağırlıklı olarak Türkçe. Qwen3.5-4B (Apache-2.0) üzerine
yaklaşık 1.000 örnek konuşmayla eğitilmiş bir LoRA. Ekran kartında yaklaşık 5 GB yer ister (işlemcide de çalışır ama
yavaştır). Pati'nin kendi ölçüm setinde %87 alıyor, düz Qwen3.5-4B %54; ayrıntılar [docs/PATI-4B.md](docs/PATI-4B.md)
dosyasında. Sohbet ve küçük işler için yapıldı; uzun cevap, kod ya da güvenmen gereken bilgiler için değil.

1. Windows için [llama.cpp](https://github.com/ggml-org/llama.cpp/releases) indir (NVIDIA kart için CUDA, diğerleri için
   Vulkan sürümü) ve zip'i aç.
2. [Pati sürümünden](https://github.com/tungarix/pati/releases/latest) üç model dosyasını aynı klasöre indir:
   `Pati-4B-Q4_K_M-00001-of-00002.gguf`, `Pati-4B-Q4_K_M-00002-of-00002.gguf` (model; GitHub'ın dosya boyutu sınırı
   yüzünden ikiye bölündü, ikisini de tut, birleştirmen gerekmez) ve `mmproj-4B-F16.gguf` (ekrana bakabilmesi için).
3. O klasörde şunu çalıştır:
   `llama-server -m Pati-4B-Q4_K_M-00001-of-00002.gguf --mmproj mmproj-4B-F16.gguf --jinja -ngl 99 --port 8080`
   (`llama-server.exe` `PATH`'te değilse önüne yolunu yaz).
4. Pati'yi aç; modeli 8080 portunda kendisi bulur.

## Sesle konuşma

Ses bilgisayarından çıkmaz: [whisper.cpp](https://github.com/ggml-org/whisper.cpp) ile yerelde yazıya çevrilir.
Sürümlerden `whisper-cli.exe`'yi indir, yanına `models` klasöründe çok dilli bir model koy (`ggml-small.bin` iyi bir
başlangıç; `.en` ile bitenler Türkçe bilmez). Pati `whisper-cli.exe`'yi `PATH`'te, modeli de onun yanındaki ya da bir
üstündeki `models` klasöründe kendisi bulur; bulamazsa **Ayarlar > Sesle konuşma**'dan ikisini de seç. Kısayolu da oradan
değiştirebilirsin. Bas, konuş; susunca Pati dinlemeyi kendisi bitirir (ya da kısayola bir daha bas).

8 GB ekran kartında 8-9 milyar parametrelik bir model iyi bir başlangıç. Pati küçük modellerin alışkanlıklarına göre çalışır: açık komutları modelin araç çağırmasına bırakmadan kendisi yapar, pil ve saat gibi sayıları modelin tahminine bırakmaz, ölçer.

## Beyin

Varsayılan yeri `Belgeler\Pati Beyni`, ayarlardan değiştirilebilir:

- `Chats/2026-10-17.md`: Her sohbet günü için bir not. Pati en üste kısa bir özet yazar ve son günlerin özetini okuyarak kaldığınız yerden devam eder.
- `Memory.md`: Pati'nin senin hakkında bildikleri, her satırda bir bilgi. Bir satır eklersen öğrenir, silersen unutur.
- `Notes.md`: Ondan aldırdığın notlar.
- `Feedback.jsonl`: Sohbette 👍 ya da 👎 verdiğin cevaplar, arkasındaki konuşmanın tamamıyla. Birkaç yüz tane biriktiğinde küçük bir modeli karakterinin tarzıyla ince ayarlamaya yeter.

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
    "drag":  { "frames": ["tutuldu.png"], "fps": 1 },
    "fall":  { "frames": ["dusus.png"], "fps": 1 },
    "dust":  { "frames": ["silkin1.png", "silkin2.png"], "fps": 6 }
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

- Zorunlu olan yalnızca `animations.idle` (ve bir ad). `fall` havadayken (yoksa `drag`), `dust` yere indikten sonra bir kez, `guitar` boşta dururken arada bir oynar. `walk`'a `stride` (bir adımın kare pikseli cinsinden uzunluğu) verirsen kareler yürünen mesafeyle ilerler, ayaklar kaymaz. Eksik animasyonun yerine `idle` oynar, eksik repliklerin yerine varsayılanlar gelir.
- `lines`, `language`'deki tek bir set ya da dil başına ayrı setler olabilir: `{ "tr": {...}, "en": {...} }`. `persona` da aynı şekilde çalışır; sohbette karaktere sesini veren sistem talimatıdır.
- `scale`, piksel sanatını keskin kenarlarla büyütür; çizim tarzı görseller için `1` bırak. Karakter ~150 pikseli geçmesin.
- `accent`, modern balonun rengidir.
- Yerleşik bir paketle aynı kimliğe sahip paket onun yerine geçer.

Tungarix'in kareleri tek bir çizilmiş sprite sheet'ten (`art/tungarix-sheet.webp`) `scripts/slice-tungarix.py` ile kesilir: arka planı siler, pozları bulur ve her kareyi ayaklar aynı çizgide olacak şekilde aynı tuvale koyar; aynı düzende her sheet için çalışır. Atlas `scripts/make-atlas.py` ile geometriden çizilir.

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
