# Pati

Masaüstünde yaşayan, konuşan, hatırlatan ve tamamen özelleştirilebilen bir maskot. Clippy ve
BonziBuddy'nin eğlenceli tarafı; reklam ve casusluk tarafı yok, hiçbir şey internete gitmez.

- Masaüstünde her pencerenin üstünde durur, sürükleyip istediğin yere koyarsın.
- Tıklayınca menü açar: şaka, saat, ipucu, ayarlar, sus, gizle.
- Konuşma balonuyla konuşur, istersen Windows'un sesiyle sesli okur.
- Hatırlatıcılar: "her 60 dakikada su iç" ya da "her gün 17:00'de ders".
- Sen bilgisayar başında değilken uyur, dönünce uyanır.
- Kendi karakterini PNG kareleriyle ekleyebilirsin.

## Çalıştırma

```bash
npm install
npm start
```

Sağ alttaki tepsi simgesinden ayarlara, karakter seçimine ve çıkışa ulaşırsın.

| Hareket | Ne olur |
| --- | --- |
| Tıkla | Menü balonu açılır (açıksa kapanır) |
| Sürükle | Taşırsın, yeri hatırlanır |
| Çift tıkla | Zıplar |
| Sağ tıkla | Ayarlar, karakter, gizle, çıkış |

## Kendi karakterini ekleme

Ayarlar > Karakter > **Klasörü aç**. Açılan klasöre (`%APPDATA%\pati\characters`) karakterin için bir
klasör koy, sonra **Yenile**'ye bas. Klasörün adı karakterin kimliğidir.

```
characters/
  benim-kedim/
    character.json
    dur.png
    yuru1.png
    yuru2.png
    uyu.png
```

`character.json`:

```json
{
  "name": "Benim Kedim",
  "author": "Arda",
  "scale": 4,
  "animations": {
    "idle":  { "frames": ["dur.png"], "fps": 1 },
    "walk":  { "frames": ["yuru1.png", "yuru2.png"], "fps": 4 },
    "talk":  { "frames": ["konus.png", "dur.png"], "fps": 6 },
    "sleep": { "frames": ["uyu.png"], "fps": 1 },
    "drag":  { "frames": ["tutuldu.png"], "fps": 1 }
  },
  "voice": { "lang": "tr-TR", "rate": 1, "pitch": 1.2 },
  "lines": {
    "greet": ["Miyav! Geldim."],
    "menu": "Ne yapalım?",
    "jokes": ["..."],
    "tips": ["..."],
    "wake": ["Uyandım!"],
    "sleep": "Biraz uyuyayım…",
    "thanks": "Sağ ol",
    "hush": "Tamam, susuyorum."
  }
}
```

- Zorunlu olanlar yalnızca `name` ve `animations.idle`. Eksik animasyonun yerine `idle` oynar, eksik
  repliklerin yerine varsayılanlar gelir.
- `scale`: kareleri kaç kat büyüteceği. Piksel sanatı keskin kenarlarla büyütülür; büyük, çizim
  tarzı görseller için `1` bırak.
- Kareler PNG, GIF ya da WebP olabilir, saydam arka plan önerilir. Karakter pencerenin altına
  ortalanır, en iyi sonuç için ~150 piksel genişliği geçmesin.
- Aynı kimlikte bir paket, yerleşik paketin yerine geçer: `tungarix` klasörü koyarsan Tungarix'i
  kendi çizimlerinle değiştirirsin.

Yerleşik Tungarix paketi `scripts/make-tungarix.py` ile piksel ızgaralarından üretilir; kendi
piksel karakterin için bu script'i şablon olarak kullanabilirsin.

## Geliştirme

| Komut | Ne yapar |
| --- | --- |
| `npm start` | Derler ve uygulamayı açar |
| `npm run typecheck` | TypeScript kontrolü |
| `npm test` | Hatırlatıcı zamanlama testleri |

Yapı: `src/main` (pencere, tepsi, hatırlatıcılar, ayarlar), `src/preload.ts` (pencereler ile ana süreç
arasındaki tek kapı), `src/renderer` (maskot ve ayarlar pencereleri), `characters/` (yerleşik paketler).

## Kurulum dosyası üretme

```
npm run dist
```

`release/Pati Setup <sürüm>.exe` oluşur. Kurulumda klasör seçilebilir; masaüstü ve Başlat menüsü
kısayolu eklenir. Ayarlar ve kullanıcı karakterleri `%APPDATA%\Pati` altında durur, kaldırınca silinmez.

- Uygulama simgesi `build/icon.ico`: `characters/tungarix/stand.png` büyütülerek üretildi.
- Yerleşik karakterler `app.asar` içinde paketlenir; Electron asar içinden okuyabildiği için ayrıca
  açılmaları gerekmez.
- "Bilgisayar açılınca başlasın" yalnız kurulu sürümde çalışır (`npm start` ile değil).
- İlk çalıştırmada electron-builder NSIS ve winCodeSign araçlarını GitHub'dan indirir; yavaş ağda
  birkaç dakika sürebilir, sonraki derlemeler önbellekten gelir. Kurulum dosyası imzasızdır;
  Windows SmartScreen "Yine de çalıştır" diye sorar.
