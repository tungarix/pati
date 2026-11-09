# Çizim planları: oyun esintili 5 karakter

Yalnız çizim. Kod ve paketleme ayrı iş ([KARAKTER-PAKETLERI.md](KARAKTER-PAKETLERI.md)). Tarz kararı: **gerçek çizim (scale 1), hepsi aynı tarzda.**

## 1. Ortak tarz (Tungarix'e uysun)

Tungarix'in `stand.png` ve `guitar1.png` karelerine bakıldı. Aynı hissi yakalamak için:

- **Orantı:** Çibi (chibi), vücut yaklaşık 2,5 kafa boyu. Büyük kafa, kısa gövde, iri botlar/ayaklar.
- **Çizgi:** İnce koyu dış çizgi (kalın siyah değil), içte yumuşak gölge ve parlak vurgular.
- **Işık:** Her karede ışık sol üstten. Gölge rengi saf siyah değil, koyu mor-lacivert.
- **Renk:** Karakter başına 4-5 ana renk; bir de parlak bir vurgu rengi (accent).
- **Bakış:** Üçte dörtlük önden görünüş, **sağa doğru dönük**. Yürürken tam yan profile yaklaşır. Sola bakışı kod ayna çevirerek yapar; bu yüzden **yazı, logo ve asimetrik simge çizme** (aynalanınca ters okunur).
- **Arka plan:** Tam saydam. Gölge ya da zemin çizgisi çizme.
- **Tuval:** 256×320 px, ayaklar y=300 çizgisinde, karakter yatayda ortada. Düşman: 192×192 px, ayaklar y=176.
- **Dosya:** PNG, 32 bit, saydam. Adlandırma aşağıdaki gibi, küçük harf, Türkçe karakter yok.

### Karakter içinde tutarlılık

Aynı karakterin tüm karelerinde şunlar **sabit** kalsın: saç şekli ve rengi, kıyafet, aksesuar yerleri, boy. Önce `stand.png`'i bitir, diğerlerini onun üstüne çiz (katman olarak). Ayak çizgisi ve ölçek kaymasın; kaydırırsan yürürken karakter zıplar.

## 2. Her karakter için kare listesi ve poz tarifleri

Tüm karakterler aynı pozları kullanır. Poz tarifleri karaktere göre "kendi" sahne eylemiyle (bölüm 3) doldurulur.

| # | Dosya | Poz | Not |
|---|---|---|---|
| 1 | `stand.png` | Dik, ağırlık iki ayakta, eller serbest ya da aksesuarı tutuyor. Hafif gülümseme | Referans kare, önce bunu bitir |
| 2 | `walk1.png` | Sağ ayak önde, sol kol önde | Adım kareleri; adım uzunluğu ≈ 90 px |
| 3 | `walk2.png` | Sol ayak önde, sağ kol önde | walk1'in tersi |
| 4 | `talk.png` | Ağız açık, bir el hafif kalkık (anlatıyor gibi) | |
| 5 | `sleep.png` | Oturmuş ya da yan yatmış, gözler kapalı, "z" yok (yazı olmaz) | Yere yakın, daha alçak silüet |
| 6 | `held.png` | Tutulup havada sallanıyor: kollar yukarı, bacaklar sarkık, şaşkın yüz | Kodlar sallanmayı verir |
| 7 | `fall1.png` | Havada düşüyor: kollar yana açık, gözler iri | Opsiyonel |
| 8 | `fall2.png` | Düşüşün ikinci karesi, kıyafet ve saç yukarı uçuşuyor | Opsiyonel |
| 9 | `dust1.png` | İniş sonrası: dizler bükük, toz bulutu ayakta | Opsiyonel |
| 10 | `dust2.png` | Doğrulurken üstünü silkeliyor | Opsiyonel |
| 11 | `dust3.png` | Tam doğrulmuş, toz azalmış | Opsiyonel |
| 12 | `fight1.png` | Savaş duruşu: silah/aksesuar hazır, dizler bükük, kaşlar çatık | |
| 13 | `fight2.png` | Vuruş anı: silah öne uzanmış, gövde öne eğik | Vuruş çizgisi (hız çizgisi) çizebilirsin |
| 14 | `fight3.png` | Vuruş sonrası, silah yan tarafta, gövde dönmüş | |
| 15 | `win.png` | Zafer: silah havada ya da omuzda, kendinden emin gülümseme | |
| 16-17 | `scene1.png`, `scene2.png` | Karakterin kendi sahnesi (bölüm 3) | Opsiyonel, ama sahne bunsuz çalışmaz |

**Asgari paket (14 kare):** 1-6, 12-15 ve düşmanın 4 karesi. Önce bunu çiz; `fall`, `dust` ve `scene` sonra gelir.

## 3. Karakter fişleri

### 3.1 Gordon Freeman

| | |
|---|---|
| Esin | Gordon Freeman |
| Vurgu rengi | Turuncu `#f97316` |
| Palet | Koyu kömür zırhlı tulum `#27272a` üstünde turuncu paneller `#f97316`, siyah saç, koyu kahve sakal `#3f2a1d`, gri levye `#9ca3af`, siyah eldiven ve bot, ten `#f2c9a5` |
| Silüet | Dik, geniş omuz, elde uzun levye (karakterden uzun) |
| İmza | Kalın çerçeveli gözlük + kısa sakal + levye + göğüste turuncu daire amblem (mevcut `stand.png` ile aynı) |
| Not | Orijinal karakterin hayran yapımı hâli; görünüş mevcut `stand.png` kareleriyle aynı kalır |
| Sahne `scene1/2` | Levyeyi omzundan indirip yere vuruyor (1: kaldırma, 2: vuruş); küçük kıvılcım |
| Pozlardaki not | `stand`: levye omuzda. `fight2`: levye öne savruluyor. `win`: levyeyi omzuna koymuş, gözlüğünü düzeltiyor |

**Düşman 1: Kafa Yengeci** (192×192)
- Görünüş: Bej-pembe yengeç, yassı gövde, altı kısa bacak, iri dişli ağız, küçük kıskaç. Kafatasına zıplamak için hazır duruş.
- `walk1/2`: Bacaklar sırayla, gövde alçak; `hit.png`: gözler kapalı, yan yatmış; `die1.png`: gövde sönük, çevresinde duman; `die2.png`: sadece duman bulutu.

**Düşman 2: Patlayan Paket** (192×192)
- Görünüş: Kutu gövdeli küçük robot, gri metal, tek kırmızı göz, kısa kollar.
- Aynı 4 kare türü.

### 3.2 Steve

| | |
|---|---|
| Esin | Minecraft'ın Steve'i |
| Vurgu rengi | Turuncu `#d97706` |
| Palet | Turuncu-kahve tişört `#c2410c`, gri pantolon `#6b7280`, koyu saç `#44260f`, taş kazma gri/kahve, ten `#e8b58c` |
| Silüet | Kare kafa ve gövde (kübik), düz kollar, kazma elde |
| İmza | Bloklu ama **çibi oranlı**: kafa blok, gövde blok, kollar blok. Gözler sabit iki kare (gözbebeği + beyaz) |
| Kaçın | Cyan tişört, mor pantolon, resmî kafa piksel deseni |
| Sahne `scene1/2` | Kazma vuruşu (1: kaldırma, 2: vuruş) ve yanında küçük bir blok kümesi; ikinci karede bir blok düşüyor |
| Pozlardaki not | `walk`: kollar dik ve kare hareket eder. `fight2`: kazmayı yan savuruyor. `win`: kazmayı yere dayamış |

Blok tarzı için çizimde kenarlar sert, gölgelendirme düzlemsel olsun; bu karakter için "yumuşak" gölge yerine 2 ton düz gölge kullan.

**Düşman 1: Zombi**
- Yeşilimsi bloklu gövde, mavi-gri giysi, kollar öne uzanık, yarı kapalı gözler.
- `walk1/2`: kollar ileride, ayaklar sürüklenir; `hit`: başı geriye; `die1/2`: duman.

**Düşman 2: Patlak**
- Yeşil, benekli, dört kısa bacaklı bloklu varlık, **hüzünlü yüz** (resmî Creeper yüzünden farklı: iki yuvarlak göz, küçük ağız).
- `walk1/2`: bacaklar sırayla; `hit`: gövde şişmiş (gerilmiş); `die1`: küçük patlama ışığı; `die2`: duman bulutu.

### 3.3 Geralt

| | |
|---|---|
| Esin | Geralt (The Witcher) |
| Vurgu rengi | Gümüş `#94a3b8` |
| Palet | Beyaz saç `#e5e7eb`, sarı kedi gözü `#facc15`, koyu deri ceket `#1f2937`, kahverengi kayış `#78350f`, gümüş kılıç `#cbd5e1`, çelik kılıç `#6b7280` |
| Silüet | Yan görünüşte sırtta iki kılıç çaprazı |
| İmza | Uzun beyaz saç, **dikey yarıklı sarı göz**, çatık kaş, yüzde ince bir iz |
| Kaçın | Kurt başlı madalyon (yerine pençe), birebir yüz yarası |
| Sahne `scene1/2` | Kılıcı çekip döndürüyor (1: çekiş, 2: dönüş); `scene2`'de sol elden mavi bir parlama (işaret) |
| Pozlardaki not | `stand`: kollar çapraz ya da belde. `talk`: kaşlar çatık, bir el hafif yukarıda. `win`: kılıcı kınına sokuyor |

**Düşman 1: Bataklık Çürüğü**
- Zeminden çıkan koyu yeşil yarı-insan, uzun kollar, palmiyeli eller, açık ağız, çıkıntılı gözler. Elleriyle yerde sürünür.
- `walk1/2`: kollarla çekiliyor; `hit`; `die1/2`: toprağa gömülüp duman.

**Düşman 2: Yaban Kurdu**
- Gri kürk, sarı gözler, ağız açık.
- `walk1/2` (dörtnala), `hit`, `die1/2`.

### 3.4 Kratos

| | |
|---|---|
| Esin | Kratos (Yunan mitolojisinde "Güç" ya da "Kuvvet" tanrısı) |
| Vurgu rengi | Bronz `#b45309` |
| Palet | Bronz zırh `#b45309` / `#78350f`, defne tacı yeşil `#4d7c0f`, ten `#d6a77a`, kırmızı pelerin parçası `#9f1239`, mızrak ahşap kahve, kalkan bronz |
| Silüet | Geniş omuzlu, mızrak dikey, kalkan yarım ay gibi sol kolda |
| İmza | Kel ya da kısa kıvırcık saç, defne yaprağı taç, kalın kaşlar |
| Kaçın | Kırmızı yüz çizgisi, zincirli çift bıçak, külden beyaz boya, balta |
| Sahne `scene1/2` | Mızrak fırlatma (1: geri çekiş, 2: fırlatma); sonra ikinci sahnede kalkanı yere vurup toz kaldırıyor |
| Pozlardaki not | `stand`: mızrağı yere dikmiş, kalkan arkada. `talk`: ağız büyük açık (gür sesli). `win`: mızrağı göğe kaldırmış |

**Düşman 1: Harpi**
- Kanatlı kadın-kuş, sivri kanatlar, ayaklar pençe, bakışlar sert. Havada gelir (`walk1/2` kanat çırpma, ayaklar yerden biraz yukarıda).
- `hit`: kanatlar kapalı; `die1/2`: duman.

**Düşman 2: İskelet Asker**
- Kemikler gri-bej, eski miğfer, kısa kılıç ve yuvarlak kalkan.
- `walk1/2`, `hit` (kemikler dağılıyor), `die1/2`.

### 3.5 Lara Croft

| | |
|---|---|
| Esin | Lara Croft |
| Vurgu rengi | Haki-yeşil `#65a30d` |
| Palet | Yeşil atlet `#4d7c0f`, kısa şort `#78350f`, saç kestane `#7c2d12` (at kuyruğu), deri kılıf ve sırt çantası `#92400e`, tabancalar gri `#6b7280` |
| Silüet | At kuyruğu sağa sallanıyor, bacaklarda kılıflar, sırt çantası |
| İmza | At kuyruğu, kılıflı bacaklar, iki küçük tabanca |
| Kaçın | Mavi-turkuaz atlet, tam örgü, resmî yüz |
| Sahne `scene1/2` | Çift ateş (1: tabancalar yukarıda, 2: namlu parlaması + geri tepme) |
| Pozlardaki not | `stand`: eller belde, tabancalar kılıfta. `fight2`: iki kolu öne uzatmış ateş. `win`: tabancaları parmağında döndürüyor |

**Düşman 1: Mağara Yarasası**
- Koyu mor kanatlar, büyük kulaklar, küçük kırmızı gözler; havada gelir.
- `walk1/2` (kanat çırpma), `hit`, `die1/2`.

**Düşman 2: Mezar Bekçisi**
- Bandajlı, çömelmiş, uzun kollu mumya benzeri yaratık, sarı gözler.
- `walk1/2` (kollar sürüklenir), `hit`, `die1/2`.

## 4. Düşman kareleri: ortak kural

| Dosya | Poz |
|---|---|
| `walk1.png`, `walk2.png` | Yürüyüş / dörtnala / kanat çırpma; **sola bakar** |
| `hit.png` | Darbe anı: gözler kapalı ya da şaşkın, geriye eğilmiş |
| `die1.png` | Sönük gövde + etrafta duman parçaları |
| `die2.png` | Sadece duman bulutu (gövde artık yok) |

- Kan, ölü beden, organ yok; yok oluş hep **beyaz-gri duman bulutu** ve belki birkaç yıldız parıltısı.
- Düşman, karaktere göre **yarım boy** ya da **aynı boy** olsun; karakterden büyük çizme.
- Dosya adları: `enemy/<kisa-ad>-walk1.png` biçiminde. Örnek: `enemy/yengec-walk1.png`, `enemy/zombi-die2.png`.

## 5. Galeri simgesi

Her karakter için bir tane: `icon.png`, **128×128 px**, karakterin yüzü ve omuzları, düz renkli ya da saydam arka plan, vurgu rengi kenarda ince bir çerçeve.

## 6. Çizim sırası ve kontrol listesi

Sırayla çiz; ilk karakterde (Gordon Freeman) tarzı oturt, sonra diğerleri.

1. [ ] `stand.png` (referans kare), onay almadan diğerlerine geçme
2. [ ] `walk1`, `walk2`, `talk`, `sleep`, `held`
3. [ ] `fight1`, `fight2`, `fight3`, `win`
4. [ ] Düşman 1: `walk1`, `walk2`, `hit`, `die1`, `die2`
5. [ ] `icon.png`
6. [ ] `scene1`, `scene2`
7. [ ] `fall1`, `fall2`, `dust1`-`dust3`
8. [ ] Düşman 2

Karakter başı iş: asgari 15 kare, tam ≈ 24 kare.
Önerilen sıra: **Gordon Freeman → Lara Croft → Geralt → Kratos → Steve** (Steve'in blok tarzı en farklısı olduğu için sona).

## 7. Teslim

- Dosyaları `pati/characters-draft/<karakter-id>/` içine koy (id: `freeman`, `steve`, `geralt`, `kratos`, `laracroft`). Düşman kareleri `enemy/` alt klasöründe.
- Her karakter için bir **referans sayfası** (isteğe bağlı): önden, yandan, arkadan görünüş; palet kutuları.
- İlk karakterin `stand.png` + `walk1/2` + `fight2` karelerini atınca tarzı birlikte kontrol edelim; sonra devam.

## 8. Yapay zekâyla çiziyorsan: kısa istem örnekleri

Aynı tarz için her isteme ortak ek: `cute chibi, 2.5 heads tall, digital illustration, soft shading, thin dark outline, transparent background, facing right, full body, game sprite`.

| Karakter | Kısa istem |
|---|---|
| Gordon Freeman | `scientist in a dark charcoal armored suit with orange panels and a round orange chest emblem, black hair, thick glasses, short brown beard, black gloves and boots, long grey crowbar` |
| Steve | `blocky miner, orange-brown shirt, grey pants, stone pickaxe, cube head, flat two-tone shading` |
| Geralt | `long white hair, yellow cat eyes with vertical pupils, dark leather jacket, two swords on back crossed, silver claw pendant` |
| Kratos | `Greek strength warrior, bald, laurel wreath, bronze chest armor, round shield, spear, heavy shoulders` |
| Lara Croft | `adventurer girl, ponytail, green tank top, short shorts, leg holsters, small backpack, two small pistols` |

Aynı karakterin kareleri için her istemde aynı tohum/stil referansı (`stand` karesi) kullan; yoksa her kare farklı karakter olur.

## 9. Tırmanma ve oturma kareleri (Tungarix ve Atlas)

Kod hazır; kareler eklenince `character.json`'a `climb` ve `sit` yazmak yeter. Pakette yoksa o davranış hiç başlamaz (eski paketler değişmez).

Ortak kural: `idle`/`stand.png` ile **aynı tuval** (Tungarix 245×306, Atlas 24×24 ve scale 5), saydam arka plan, karakter **sağa bakıyor**, ayak çizgisi `stand.png` ile aynı yükseklikte. Pencere sabit boyutlu olduğu için kare tuvalin dışına taşmamalı.

| Dosya | Poz | Adet |
|---|---|---|
| `climb1.png`..`climb4.png` | Sağ ekran kenarına yapışık: gövde dik, eller/ayaklar sağ kenara (duvara) basıyor, yüz yukarı/sağa bakıyor. Kareler eller ve ayaklar sırayla yer değiştirerek döngü oluşturur (en az 2, en çok 4) | 2-4 |
| `sit1.png`, `sit2.png` | Yere oturmuş: bacaklar önde ya da çapraz, eller dizde. sit2 isteğe bağlı küçük hareket (göz kırpma, baş sallama) | 1-2 |

- Kod `climb` karesini sol kenarda aynalar; yazı, logo ve asimetrik simge çizme.
- `sit`te ayak çizgisi oturan karakterin altına denk gelmeli (zemine "oturur"), `sleep.png` kadar alçak olması gerekmez.
- `character.json`: `"climb": { "frames": ["climb1.png","climb2.png"], "fps": 5 }`, `"sit": { "frames": ["sit1.png","sit2.png"], "fps": 1 }`.
