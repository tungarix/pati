# Oyun esintili karakter paketleri: plan ve çizim rehberi

Durum: PLAN. Henüz kod yazılmadı. Çizimleri Arda yapacak, kodu ve paket iskeletini ben yapacağım.

## 1. Kararlar

| Konu | Karar |
| --- | --- |
| Karakterler | Gordon Freeman, Steve, Geralt, Kratos, Lara Croft (5) |
| Çizimler | Arda çizer; ben ölçü, dosya adı ve sahne listesini veririm |
| Düşmanlar | Her karakterin kendi düşmanları ekranda belirir, karakterle dövüşür |
| Sahneler | Her karakterin kendi sahnesi (kazma, kılıç, mızrak, ateş, levye) |
| Dağıtım | Ana depoya girmez. Ayrı sürümden uygulama içinden indirilir; ilk açılışta model indirme gibi sorulur |
| Adlar ve görseller | Orijinal adlar (hayran yapımı); çizimler kendi çizimimiz, oyundan görsel yok |

Not: Hukuki tavsiye değil. Ayırt edici öğeleri değiştirmek riski azaltır, ortadan kaldırmaz.

## 2. Pati'de şu an olan (kodu okudum)

- Paket = `manifest.json` + `character.json` + PNG kareleri (`characters/tungarix` örneği).
- Mevcut animasyonlar: `idle, walk, talk, sleep, drag, fall, dust, guitar`. Eksik animasyon `idle`'a düşer.
- Tungarix kareleri 245×306 px, saydam PNG, ayaklar hep aynı çizgide, karakter sağa bakıyor (sola bakışı kod çevirir).
- `guitar` "ara sıra çalan sahne" mantığı hazır (`pet.ts`: zamanlayıcıyla rastgele tetiklenir). Yeni sahneler buna benzer çalışır.
- Pencere boyutu sabit tutulmalı (0.4.4.2 hatası). Düşman ayrı pencere olacak, pet penceresi büyütülmeyecek.
- Davranış durum makinesi saf TypeScript (`src/core/behavior.ts`), testi kolay.

## 3. Çizim rehberi (hepsi için ortak)

- Tuval: **256×320 px**, saydam arka plan, PNG. Karakter **sağa bakar**.
- Ayakların tabanı her karede **aynı y çizgisinde** (y = 300). Kareler arasında kayma olmasın.
- Karakter tuvalin içinde 200 px'i geçmesin; kod ölçeği ayarlar.
- Piksel sanat çizeceksen: 48×60 px çiz, `character.json` içinde `scale: 5` yazarım (kenarlar keskin kalır). Çizim gibi çizeceksen `scale: 1`.
- Düşman karesi: **192×192 px**, aynı kurallar, sola bakar (karaktere doğru yürür).
- Galeri simgesi: 128×128 px, karakterin yüzü/üst gövdesi.

### Kare listesi (her karakter)

| Dosya | Ne | Zorunlu |
| --- | --- | --- |
| `stand.png` | Dik duruş | Evet |
| `walk1.png`, `walk2.png` | Yürüme | Evet |
| `talk.png` | Ağız açık | Evet |
| `sleep.png` | Uyuyor | Evet |
| `held.png` | Tutulmuş (havada sallanır) | Evet |
| `fall1.png`, `fall2.png` | Havada düşüş | İsteğe bağlı |
| `dust1.png`..`dust3.png` | İnişten sonra toz silkeleme | İsteğe bağlı |
| `fight1.png`..`fight3.png` | Dövüş: hazırlık, vuruş 1, vuruş 2 | Sahne için |
| `win.png` | Zafer pozu | Sahne için |
| `scene1.png`, `scene2.png` | Karakterin kendi sahnesi (bölüm 4) | İsteğe bağlı |

### Düşman karesi (her düşman)

`walk1.png`, `walk2.png`, `hit.png` (darbe), `die1.png`, `die2.png` (yok oluş: duman bulutu, kan yok).

### Önerilen çizim sırası

1. **En az** (14 kare/karakter): 6 zorunlu + `fight1-3` + `win` + 1 düşman (4 kare). Bu yeter, sahne ve düşman çalışır.
2. Sonra `fall`, `dust`, kendi sahnesi ve ikinci düşman.

Toplam: en az ≈ 70 kare, tam ≈ 115 kare (5 karakter).

## 4. Karakterler

Her karakterin adı, görünüşü, kaçınılacaklar, sahnesi, düşmanları ve sohbet kişiliği.

### 4.1 Gordon Freeman (Half-Life)

- **Görünüş:** Kalın çerçeveli gözlük, kısa kahverengi sakal, **koyu kömür rengi zırhlı tulum, turuncu paneller ve göğüste turuncu daire amblem**, siyah saç, siyah eldiven ve bot, elinde **gri levye**. Hafif yorgun yüz.
- **Accent rengi:** `#f97316`
- **Sahne:** Levyeyle ara sıra bir şeyleri kırar (`scene1/2`: levye kaldırma, vurma).
- **Düşmanlar:** **Kafa Yengeci** (bej-pembe, dört bacaklı, iri dişli yengeç; yüze zıplar) ve **Patlayan Paket** (kutu gibi duran küçük robot).
- **Kişilik:** Az konuşan, kuru espri. "Levyem yanımda, korkma." / "Yarım ömrüm bitti, yarısını yaşıyorum."

### 4.2 Steve (Minecraft)

- **Görünüş:** Bloklu insan, **turuncu-kahverengi tişört, gri pantolon, koyu saç** (cyan tişört ve mor pantolon değil), elinde taş kazma.
- **Kaçın:** Birebir kafa deseni, Steve'in renk paleti.
- **Accent rengi:** `#d97706`
- **Sahne:** Blok kazar ve yan yana blok koyar (`scene1/2`: kazma vuruşu, blok).
- **Düşmanlar:** **Zombi** (yeşilimsi, bloklu, kollar öne uzanık) ve **Patlak** (yeşil benekli, hüzünlü yüzlü bloklu varlık; "patlar" ama duman bulutuyla yok olur, ekranı bozmaz).
- **Kişilik:** Telaşsız, yapıcı. "Bir blok daha, sonra mola." / "Gece olmadan sığınak lazım."

### 4.3 Geralt (The Witcher)

- **Görünüş:** Uzun beyaz saç, **sarı kedi gözü**, koyu deri ceket, sırtta iki kılıç (biri gümüş, biri çelik), boynunda **kurt yerine pençe** madalyonu.
- **Kaçın:** Birebir kurt madalyonu, birebir yüz yarası.
- **Accent rengi:** `#94a3b8`
- **Sahne:** Kılıç çeker ve döndürür; arada elinden mavi bir **işaret** (parlama) saçar (`scene1/2`).
- **Düşmanlar:** **Bataklık Çürüğü** (sudan çıkan yeşil el-ağız yaratık) ve **Yaban Kurdu**.
- **Kişilik:** Kısa cümleli, iç çeken. "Hmm." / "Bu iş için para alıyorum."

### 4.4 Kratos (God of War)

Mitolojik karakter olarak tasarlanır (Prometheus'u zincirleyen Kratos, "Kuvvet"). Bu, oyundaki karakterden uzak durmayı da kolaylaştırır.

- **Görünüş:** Kel ya da kısa kıvırcık saç, **defne yaprağı taç**, bronz göğüslük, **mızrak ve yuvarlak kalkan**, geniş omuzlar.
- **Kaçın:** Kırmızı yüz çizgisi/dövme, zincirli çift bıçak, külden beyaz boya, tıpatıp balta.
- **Accent rengi:** `#b45309`
- **Sahne:** Mızrak fırlatır, kalkanını yere vurur (`scene1/2`); "öfke" kısa kareyle yüz kızarır.
- **Düşmanlar:** **Harpi** (kanatlı kadın-kuş) ve **İskelet Asker**.
- **Kişilik:** Gür sesli, ağırbaşlı. "Güç sabır ister." / "Kalkan önde, yürü."

### 4.5 Lara Croft (Tomb Raider)

- **Görünüş:** Tek örgü yerine **at kuyruğu**, haki-yeşil atlet, kısa şort, bacaklarda tabanca kılıfı, küçük sırt çantası, **iki küçük tabanca**.
- **Kaçın:** Birebir mavi-turkuaz kıyafet, tam örgü, birebir yüz.
- **Accent rengi:** `#65a30d`
- **Sahne:** Çifte ateş eder (`scene1/2`: namlu parlaması), ipten tırmanır.
- **Düşmanlar:** **Mağara Yarasası** ve **Mezar Bekçisi** (bandajlı, çömelmiş yaratık).
- **Kişilik:** Maceracı, kendinden emin. "Haritada bir X var, gidelim." / "Hazine bulunmak için vardır."

## 5. Düşman sistemi (ben yapacağım)

### Oynanış

1. Pet boşta ve konuşma balonu kapalıyken, ayarlanan sıklıkta (varsayılan: ortalama 10 dakikada bir) bir düşman **ayrı küçük pencerede** ekranın bir kenarından belirir.
2. Düşman petin bulunduğu zeminde ona doğru yürür (`walk1/2`).
3. Yeterince yaklaşınca pet `fight1-3` kareleriyle vurur, düşman `hit` olur, sonra `die1/2` ile duman bulutuna dönüşüp kaybolur.
4. Pet `win` pozu verir, kısa bir söz söyler (`lines.win`), sonra normale döner.

### Kurallar (kullanıcıyı rahatsız etmesin)

- Düşman penceresi **tıklamayı geçirir** (`setIgnoreMouseEvents`): arkasındaki pencerelere tıklanabilir.
- Odak modunda, balon açıkken, uyurken, sürüklenirken, ses konuşurken ve ekran paylaşımı sırasında çıkmaz.
- Ayarlarda **Düşmanlar: Kapalı / Seyrek / Ara sıra / Sık**. Varsayılan: **Seyrek**.
- Kan, ölüm ya da korku yok: yok oluş hep duman bulutu.
- Düşman en fazla 25 sn yaşar; pet ulaşamazsa kendiliğinden kaybolur.

### Paket biçimi (yeni alanlar)

```json
{
  "scenes": {
    "fight":  { "frames": ["fight1.png","fight2.png","fight3.png"], "fps": 5 },
    "win":    { "frames": ["win.png"], "fps": 1 },
    "scene1": { "frames": ["scene1.png","scene2.png"], "fps": 4 }
  },
  "enemies": [
    {
      "id": "kafa-yengeci",
      "name": "Kafa Yengeci",
      "frames": {
        "walk": ["enemy/yengec-walk1.png","enemy/yengec-walk2.png"],
        "hit":  ["enemy/yengec-hit.png"],
        "die":  ["enemy/yengec-die1.png","enemy/yengec-die2.png"]
      },
      "speed": 4,
      "weight": 1
    }
  ],
  "lines": { "win": ["Bitti."], "fightStart": ["Geliyor."] }
}
```

### Dokunulacak dosyalar

| Dosya | Değişiklik |
| --- | --- |
| `src/shared/types.ts` | `CharacterDef` içine `scenes`, `enemies` |
| `src/main/characters.ts` | Yeni alanları doğrula ve yükle (eksik alan = özellik kapalı) |
| `src/main/enemies.ts` (yeni) | Çıkış zamanlayıcısı, konum, çarpışma, temizlik |
| `src/main/windows.ts` | `createEnemyWindow` (saydam, tıklama geçirir, sabit boyut) |
| `src/renderer/enemy.html/.ts` (yeni) | Düşman karesini çizer |
| `src/core/behavior.ts` | `fight` kipi (`enemy-arrived`, `enemy-dead` olayları) + testler |
| `src/renderer/pet.ts` | `fight` ve kendi sahnesinin oynatılması (`guitar` desenine benzer) |
| `src/renderer/settings.*`, `locales/` | Düşman sıklığı ayarı, Türkçe/İngilizce metin |
| `test/` | Davranış, paket doğrulama, düşman zamanlayıcı testleri |

## 6. Dağıtım (ben yapacağım)

- Karakter paketleri **ayrı bir GitHub sürümüne** zip olarak konur (`pati-karakterler`), ana sürümde ve depoda olmaz. Bir şikâyet gelirse yalnız o sürüm kaldırılır.
- Sürümde bir `characters.json` (id, ad, boyut, SHA-256, simge) bulunur.
- Uygulama içinde **Ayarlar > Karakterler > Mağaza**: liste, tek tek indir/kaldır, ilerleme ve devam ettirme. `localModel.ts`'deki indirme, doğrulama ve `Range` ile devam mantığı yeniden kullanılır.
- **İlk açılışta** (kurulum sonrası) Pati-4B teklifi gibi bir kutu: "Oyun esintili karakter paketlerini indirmek ister misin? (yaklaşık X MB)". Not: Windows kurulum sihirbazı değil, uygulamanın ilk açılışı; model indirme de zaten böyle çalışıyor.
- İndirme sayfasında kısa bir "bu karakterler bilinen oyunlardan esinlenmiş hayran işleridir, resmî değildir" uyarısı.

## 7. Yapılacaklar sırası

| Aşama | İş | Kim |
| --- | --- | --- |
| 1 | Çizimler: önce 1 karakter (Gordon Freeman) en az 14 kare + 1 düşman | Arda |
| 2 | Paket biçimi (`scenes`, `enemies`), yükleyici, durum makinesi `fight`, testler | Ben |
| 3 | Düşman penceresi ve çıkış kuralları, ayarlar | Ben |
| 4 | Gordon Freeman'ı uçtan uca dene, ince ayar | İkimiz |
| 5 | Diğer 4 karakterin kareleri (Arda) ve paketlenmesi (ben) | İkimiz |
| 6 | Mağaza ekranı, ayrı sürüm, ilk açılış teklifi | Ben |
| 7 | 0.5.0 sürümü (yayını yalnız sen "yayınla" deyince) | Sen karar verirsin |

## 8. Açık sorular

- Çizim tarzı: **çizim** (scale 1) mi, **piksel sanat** mı? Karakterlerin hepsi aynı tarzda olsun mu?
- Düşman sıklığı varsayılanı "Seyrek" iyi mi?
- Steve'in "Patlak"ı duman bulutuyla yok olsun (önerim), yoksa ekranda küçük bir "patlama" animasyonu mu?
- ✅ Adlar (2026-10-29): orijinal adlar kullanılır (Gordon Freeman, Steve, Geralt, Kratos, Lara Croft). Hayran yapımı; çizimler kendi (yapay zekâ) çizimimiz, oyundan görsel, logo, ses yok; paket açıklamasında "resmî değildir" notu; ayrı depoda, ücretsiz.
