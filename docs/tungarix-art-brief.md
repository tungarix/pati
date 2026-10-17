# Tungarix çizim planı (masaüstü maskotu)

## 1. Amaç
Tungarix, Pati'de ekranın altında yaşayan masaüstü maskotu. Yürüyor, konuşuyor, uyuyor, tutulup fırlatılıyor,
düşüyor ve yere inince üstünü silkeliyor. Her durum için ayrı bir kare lazım. Ekranda yaklaşık 150 piksel
boyunda görünecek (kullanıcı %50–%200 büyütebilir), o yüzden küçükken de net okunmalı.

## 2. Karakter (her karede aynı)
- Antropomorfik gri kurt, beyaz ağız ve göğüs tüyleri
- Dikenli, mavi parlayan yele
- Siyah güneş gözlüğü, kendinden emin hafif sırıtış
- Kırmızı askeri ceket, altın kenar şeridi, altın düğmeler, altın püsküllü apoletler
- Zincirde altın madalyon
- Siyah tişört, siyah pantolon, tokalı siyah botlar
- Çizim tarzı: temiz koyu çizgiler, cel shading, karakterin üstünde hafif mavi kenar ışığı (referans resimlerdeki gibi)

## 3. Teknik kurallar (zorunlu)
| Kural | Değer |
|---|---|
| Boy | Tam boy: kulak ucundan bot tabanına, hiçbir yer kesilmesin |
| Oran | Chibi: kafa büyük, boy yaklaşık 2,5 kafa |
| Açı | 3/4 görünüş, **sağa bakıyor**, her karede aynı (sola yürümeyi uygulama aynalar) |
| Tuval | 1024 × 1024, kare |
| Yerleşim | Karakter tuvalin yaklaşık %85'i boyunda, yatayda ortalı |
| Zemin çizgisi | Bot tabanları her karede aynı yükseklikte, alttan yaklaşık 40 piksel yukarıda (oturma ve düşme pozlarında da en alt nokta bu çizgide) |
| Ölçek | Her karede aynı; karakter kareden kareye büyüyüp küçülmesin |
| Arka plan | Şeffaf PNG; olmuyorsa düz #00FF00 yeşil (yeşilde karakterde yeşil renk olmasın) |
| Yasak | Yerde gölge, karakterin dışına taşan parlama/ışık halesi, yazı, filigran, sahne, ikinci karakter |

## 4. Kareler
| # | Dosya adı | Poz |
|---|---|---|
| 1 | `stand.png` | Rahat ayakta duruyor, bir pençesi cebinde, sırıtıyor |
| 2 | `walk1.png` | Yürüyor: sol ayak önde, sağ kol önde |
| 3 | `walk2.png` | Yürüyor: sağ ayak önde, sol kol önde |
| 4 | `talk.png` | Konuşuyor: ağzı açık, bir pençesiyle anlatır gibi el hareketi |
| 5 | `sleep.png` | Yerde bağdaş kurmuş oturuyor, kollar bağlı, kafası öne düşmüş, uyukluyor |
| 6 | `held.png` | Ensesinden tutulup havaya kaldırılmış: kollar ve bacaklar sarkık, şaşkın yüz |
| 7 | `fall1.png` | Düşüyor: iki kol yukarıda çırpınıyor, bacaklar açık, ağzı "O" şeklinde |
| 8 | `fall2.png` | Düşüyor: kollar farklı açıda (biri yukarı biri yana), bacaklar açık, ağzı açık |
| 9 | `dust1.png` | Yere inmiş, sağ pençesiyle ceketinin göğsündeki tozu silkeliyor (pençe göğüs hizasında) |
| 10 | `dust2.png` | Aynı hareketin devamı (pençe bel hizasına inmiş) |
| 11 | `dust3.png` | Ceketinin yakasını iki eliyle düzeltiyor, havalı ve kendinden emin |
| 12 | `guitar1.png` *(isteğe bağlı)* | Siyah-altın elektro gitar çalıyor, kafa ritimle eğik |
| 13 | `guitar2.png` *(isteğe bağlı)* | Gitar çalıyor, pena aşağı vurmuş, kafa diğer yöne |

## 5. Önce sprite sheet dene (tutarlılık için en iyisi)
Tek tek üretince karakter kareden kareye değişebilir. Önce hepsini tek resimde iste ve referans olarak
mevcut Tungarix resmini ver:

```
Character sprite sheet of the same character as the reference image, 4 columns x 3 rows grid, 12 poses, every pose the same size and scale, each centered in its own equal cell with empty space around it, feet of every pose on the same baseline of its cell.
Character: an anthropomorphic gray wolf with white muzzle and chest fur, a spiky glowing blue mane, black sunglasses, a confident smirk, a red military jacket with gold trim, gold buttons and gold fringed epaulettes, a gold medallion on a chain, black t-shirt, black pants, black buckled boots.
Chibi proportions (big head, about 2.5 heads tall), full body visible from ears to boots in every pose, 3/4 view facing right in every pose.
Style: clean dark lineart, cel shading, subtle blue rim light on the character only.
Poses in order: 1 standing relaxed with one paw in pocket; 2 walking, left foot forward; 3 walking, right foot forward; 4 talking with mouth open and one paw gesturing; 5 sitting cross-legged asleep, arms crossed, head down; 6 lifted by the scruff, arms and legs dangling, surprised; 7 falling, both arms flailing up, legs apart, mouth in an O; 8 falling, one arm up one arm out, legs apart, mouth open; 9 brushing dust off the chest of the jacket with the right paw; 10 same, paw lower at the waist; 11 straightening the jacket collar with both paws, proud; 12 playing a black and gold electric guitar.
Transparent background, no ground shadow, no glow outside the character, no text, no labels, no numbers.
```

## 6. Tek tek üretmek gerekirse (her kare için aynı şablon)
Referans resmi her seferinde ver; yalnızca son satırı değiştir:

```
Chibi full-body sprite of the same character as the reference image: an anthropomorphic gray wolf with white muzzle and chest fur, a spiky glowing blue mane, black sunglasses, a confident smirk, a red military jacket with gold trim, gold buttons and gold fringed epaulettes, a gold medallion on a chain, black t-shirt, black pants, black buckled boots.
Chibi proportions (big head, about 2.5 heads tall), whole body visible from ears to boots, 3/4 view facing right, centered on a 1024x1024 square canvas, character about 85% of the canvas height, feet on a baseline 40 px above the bottom edge.
Clean dark lineart, cel shading, subtle blue rim light on the character only.
Transparent background, no ground shadow, no glow outside the character, no text.
Pose: <POZ>
```

`<POZ>` yerine:
1. `standing relaxed, one paw in his jacket pocket, smirking`
2. `walking, left foot forward, right arm swinging forward`
3. `walking, right foot forward, left arm swinging forward`
4. `talking with his mouth open, one paw raised in an explaining gesture`
5. `sitting cross-legged on the ground asleep, arms crossed, head bowed`
6. `being lifted by the scruff of his neck, arms and legs dangling limply, surprised face`
7. `falling through the air, both arms flailing above his head, legs apart, mouth in a shocked O`
8. `falling through the air, one arm up and one arm out to the side, legs apart, mouth open`
9. `just landed, brushing dust off the chest of his jacket with his right paw`
10. `just landed, brushing dust off his jacket, right paw lower at his waist`
11. `straightening the collar of his jacket with both paws, proud and cool`
12. `playing a black and gold electric guitar, head tilted to the beat`
13. `playing a black and gold electric guitar, strumming down, head tilted the other way`

## 7. Kontrol listesi (göndermeden önce)
- [ ] Hepsi aynı karakter mi (yele rengi, gözlük, madalyon, apoletler aynı)?
- [ ] Hepsi sağa mı bakıyor?
- [ ] Hiçbir karede kulak, el ya da bot kesilmiş mi?
- [ ] Arka plan şeffaf mı (ya da düz yeşil mi)?
- [ ] Karakter boyu karelerde aşağı yukarı aynı mı?

## 8. Teslim
Dosyaları tek bir klasöre koy (ör. `Masaüstü\tungarix-art`) ve yolunu söyle. Sprite sheet olursa tek dosya yeter.
Gerisini ben yapıyorum: keserim, arka planı temizlerim, ayakları aynı çizgiye hizalarım, boyutu ayarlarım,
`character.json`'a bağlarım. Gitar kareleri gelirse boş zamanlarda gitar çalma animasyonu da eklerim.

---

# Bölüm 2: ek kareler (akıcılık için)

İlk sheet uygulamada. Hareketlerin arasındaki can şu an kodla veriliyor (nefes, adım sekmesi, sallanma,
düşüşte esneme, inişte ezilme). Tam akıcılık için birkaç hareketin daha çok karesi lazım. Kurallar
Bölüm 3'tekiyle aynı (aynı karakter, aynı ölçek, sağa bakış, şeffaf arka plan, ayaklar aynı çizgide).

| # | Dosya adı | Poz |
|---|---|---|
| 1 | `walk3.png` | Yürüyüş, sol ayak yere basmış, dizler hafif bükük (en alçak an) |
| 2 | `walk4.png` | Yürüyüş, sağ bacak sol bacağın yanından geçiyor, gövde en yüksekte |
| 3 | `walk5.png` | Yürüyüş, sağ ayak yere basmış, dizler hafif bükük |
| 4 | `walk6.png` | Yürüyüş, sol bacak sağ bacağın yanından geçiyor, gövde en yüksekte |
| 5 | `talk2.png` | Konuşuyor, ağzı yarı açık, el hareketi biraz farklı |
| 6 | `talk3.png` | Konuşuyor, ağzı kapalı ama gülümsüyor, el aşağıda |
| 7 | `idle2.png` | Ayakta, kuyruk sağa sallanmış, kafa çok hafif yana eğik |
| 8 | `idle3.png` | Ayakta, kuyruk sola sallanmış, gözlüğünü bir parmağıyla itiyor |
| 9 | `sleep2.png` | Uykuda, nefes vermiş (omuzlar biraz aşağıda), ağzı aralık |
| 10 | `land.png` | Yere yeni inmiş: dizler bükülmüş çömelme, kollar dengede açık |
| 11 | `turn.png` | Yüzü tam öne dönük, ayakta (sağdan sola dönerken ara kare) |
| 12 | `wave.png` | Bir pençesiyle selam veriyor, sırıtıyor |

Sheet promptu (Bölüm 5'teki karakter cümlesi aynı, poz listesi değişiyor):

```
Character sprite sheet of the same character as the reference image, 4 columns x 3 rows grid, 12 poses, every pose the same size and scale as in the reference sheet, each centered in its own equal cell with empty space around it, feet of every pose on the same baseline of its cell.
Character: an anthropomorphic gray wolf with white muzzle and chest fur, a spiky glowing blue mane, black sunglasses, a confident smirk, a red military jacket with gold trim, gold buttons and gold fringed epaulettes, a gold medallion on a chain, black t-shirt, black pants, black buckled boots, fluffy gray tail with blue tips.
Chibi proportions (big head, about 2.5 heads tall), full body visible from ears to boots in every pose, 3/4 view facing right in every pose except pose 11.
Style: clean dark lineart, cel shading, subtle blue rim light on the character only.
Poses in order: 1 walk cycle contact, left foot planted, knees slightly bent, body at its lowest; 2 walk cycle passing, right leg passing the left, body at its highest; 3 walk cycle contact, right foot planted, knees slightly bent; 4 walk cycle passing, left leg passing the right, body at its highest; 5 talking, mouth half open, different hand gesture; 6 talking pause, mouth closed smiling, hand down; 7 standing, tail swung to the right, head slightly tilted; 8 standing, tail swung to the left, pushing his sunglasses up with one finger; 9 sitting cross-legged asleep, breathing out, shoulders lower, mouth slightly open; 10 just landed, crouching with bent knees, arms out for balance; 11 standing facing the viewer straight on; 12 waving hello with one paw, smirking.
Transparent background, no ground shadow, no glow outside the character, no text, no labels, no numbers.
```

Gelince `art/` klasörüne ikinci sheet olarak koyarım; kesme scripti aynı şekilde işler.
