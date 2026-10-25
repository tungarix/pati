# Pati değerlendirme (eval)

Yerel bir modelin Pati'nin gerçek sohbet trafiğini Türkçe'de ne kadar iyi taşıdığını ölçer. Mesajlar uygulamadakiyle aynı kurulur (karakter personası, bilinen bilgiler, önceki günlerin özeti, kurallar, bugünün geçmişi, saatli kullanıcı mesajı) ve gerçek `chatWithTools` döngüsü çalışır. Araçlar sahtedir: çağrıları kaydeder, makul başarı cevabı döner, böylece modelin son cümlesi de ölçülür. Saat sabittir: 21 Ekim 2026 Çarşamba 14:37.

İlk sürüm her vakayı tek seferde, tek başına sorup yalnız regex ile bakıyordu; bu yüzden %87 çıkarken kullanıcı aynı cevabın tekrarını, bozuk Türkçeyi ve açılmayan dosyayı yaşıyordu. Bu sürüm bunları görmek için kuruldu.

## Dosyalar

- `cases.json`: ilk 80 vaka (tek tur). Değişmez.
- `cases-v2.json`: 78 vaka. `cok_tur` 16, `tekrar` 12, `dil` 14, `dosya` 14, `rota` 14, `durustluk` +8. Vakaların yaklaşık üçte biri Atlas, gerisi Tungarix.
- `checks.ts`: sunucusuz kontroller ve şema doğrulaması. `hidden.ts`: gizli kontroller. `turn.ts`: bir turu uygulamanın kurduğu gibi kurar. `stats.ts`: eşleştirilmiş bootstrap. `judge.ts`: çevrimdışı hakem.

## Çalıştırma

```
node eval/run.ts --dry --cases eval/cases.json,eval/cases-v2.json     # doğrula, kategori sayıları, rota vakalarını modelsiz sına
npm run eval -- --url http://127.0.0.1:8081/v1 --key local --label pati4b --cases eval/cases.json,eval/cases-v2.json --runs 3
node eval/run.ts --only rota --cases eval/cases-v2.json --label rota  # sunucusuz
node eval/compare.ts
```

Seçenekler: `--cases a.json,b.json` (varsayılan `eval/cases.json`, id'ler dosyalar arasında benzersiz olmalı), `--sampling old|new`, `--model ad`, `--only kategori`, `--limit n`, `--runs n`, `--dry`. Sonuçlar `eval/results/<label>.json` dosyasına yazılır. Sunucu yoksa tek bir Türkçe mesaj verip hata koduyla çıkar (yalnız rota vakaları seçiliyse sunucu gerekmez).

### Eski ve yeni örnekleme

`--sampling old` uygulamanın 0.4.6 öncesi ayarıdır: yalnız `temperature 0.5` ve `frequency_penalty 0.5`, `ai.ts` içindeki ek alanların hiçbiri yok. `--sampling new` `ai.ts` içindeki `SAMPLING`'dir (uygulamanın gönderdiği). "Örnekleme mi iyileştirdi, model mi?" sorusu için aynı modeli iki kere ölç ve karşılaştır:

```
npm run eval -- --label pati4b-eski --sampling old --runs 3 --cases eval/cases.json,eval/cases-v2.json
npm run eval -- --label pati4b-yeni --sampling new --runs 3 --cases eval/cases.json,eval/cases-v2.json
node eval/compare.ts --pair pati4b-eski pati4b-yeni
```

Eski ayar `run.ts` içinde `fetch` sarılarak uygulanır; `src/` değişmez.

## Vaka şeması

Tek tur: `user` + `expect`. Çok tur: `turns: [{user, expect?}]` (`user` ile birlikte olmaz). `expectAll` her tura varsayılan olarak eklenir, turun kendi `expect`'i aynı anahtarları ezer. Çok turlu vakada geçmiş uygulamadaki gibi kurulur: önceki kullanıcı metinleri (saat satırsız, saat yalnız en yeni mesaja eklenir) ve modelin kendi önceki cevapları düz metin olarak, son 20 mesaj, kelimesi kelimesine tekrar eden turlar atılır. Uygulama model turlarını araç çağrısı olmadan kaydettiği için eval de öyle yapar.

Vaka düzeyi alanlar: `facts` (hafıza bloğu), `pastDays: [{key, summary}]` (en yeniden eskiye; `brain.ts` `pastBlock` ile "Önceki günlerde..." bloğu olur), `distinct` (0-1 arası eşik, `tekrar` kategorisinde varsayılan 0.6), `tool_results` (sahte araç sonucunu ezer, ör. `{"open_path": {"error": "not found"}}`).

`expect` anahtarları: `tool` (ad ya da `null`), `anyTool`, `args` (regex, sayı için ±1, dizi: hepsi bulunmalı, `"url|query"` gibi anahtar: biri yeterli), `contains`, `notContains`, `maxSentences`, `fireAt`/`fireIn`, ve yeniler:

- `route`: model çağrılmaz, `matchIntent(metin, 'tr')` sonucuna bakılır. `{tool, args?}` araç ve argümanlar uymalı; `null` hiçbir şeyin yakalamaması demektir. Uygulamada kalıp komutların yakaladığı mesajlar böyle sınanır (`rota` kategorisi).
- `admits`: cevap sınırını kabul etmeli (`yapamıyorum`, `edemiyorum`, `erişimim yok`, `göremiyorum`, `bakamıyorum`, `canlı veri` ve benzerleri; liste `checks.ts` içinde `ADMITS`). Uydurma sayıyı `notContains: ["\\d"]` ile yakalıyoruz.

Modele gidecek her mesaj `matchIntent`, `matchFocus` ve `matchScreen` tarafından yakalanmamalıdır; yakalanırsa uygulamada modele gitmez. `--dry` bunları "offender" olarak listeler ve hata koduyla çıkar. Tüm `rota` vakaları da `--dry` içinde modelsiz sınanır.

## Yeni kontroller

Bir vaka, tüm tur `expect`'leri geçerse ve stil, gramer, uzunluk, tekrar kontrollerinden hiçbiri bayrak vermezse geçer. Hepsi sonuç dosyasında ayrı adla durur (`distinct`, `grammar`, `length`), `compare.ts` bunları sayar. `grammar` ve `length` kayıtlı cevaplardan yeniden hesaplandığı için eski sonuç dosyaları da okunur.

- **Tekrar (`distinct`)**: Aynı vakanın iki cevabı arasında karakter üçlüsü (trigram) Jaccard benzerliği eşik ve üstündeyse ya da ikisi de aynı ilk dört kelimeyle başlıyorsa vaka kalır. "iyiyim sen nasılsın" üç kere sorulup üç kere aynı cevap alınırsa burada kalır. Tabloda "Tekrar % ": kontrol edilen vakalardan geçenlerin yüzdesi.
- **Gramer bayrağı (`grammarFlags`)**: ucuz kural listesi, her kuralın adı var: `tamamdı`, `sen_nasıl_gidiyor`, `çift_kelime` ("tamam tamam"; "yavaş yavaş", "tek tek" gibi küçük bir izin listesi hariç), `seni_hatırlat` (ek yok), `çift_mi` (yan yana iki mi/mı), `küçük_harfle_başlıyor`, `ünlem_soru_karışık` (`?!`, `!?`), `iki_nokta` (`..`). Tabloda toplam bayrak sayısı.
- **Uzunluk bayrağı (`lengthFlags`)**: `sohbet`, `selam`, `tekrar`, `dil` kategorilerinde 3 cümleden uzun cevap.
- **Açılış çeşitliliği (`openerStats`)**: tüm cevaplar üzerinde en sık ilk kelimenin payı, farklı iki kelimelik açılış sayısı ve araç çağrısı olmayan cevaplardan "Tamam" ile başlayanların payı. Model her şeye "Tamam" diyorsa buradan görünür.
- **Hakem (aşağıda)**: "Judge geçti %" satırı.

`hidden.ts` ve hakem **gizli kontrollerdir**: eğitim verisi üreticisi (`pati-model/scripts/uret`) bunları içe aktarmaz, `test/eval.test.ts` bunu denetler. Üretici bunlara karşı süzerse ölçüm modeli değil süzgeci ölçer.

## Hakem

```
node eval/judge.ts --url http://127.0.0.1:8080/v1 --key local --label pati4b [--model ad] [--par 3]
```

`eval/results/pati4b.json` içindeki her turun cevabını sunucuya (sıcaklık 0, düşünme kapalı, yalnız JSON) verir ve dört ekseni 0-2 ile puanlatır: `dilbilgisi`, `dogallik`, `baglam`, `karakter`. Herhangi bir eksen 0 ise cevap kalır; bir koşu, cevaplarının hiçbiri kalmadıysa geçer. Verdikler `eval/results/pati4b.judge.json` dosyasına (vaka, koşu, tur, cevap özeti) önbelleğe alınır; yeniden çalıştırmak yalnız eksikleri puanlar, yarıda kesmek güvenlidir. Okunamayan cevaplar önbelleğe girmez, sonraki çalıştırmada yeniden denenir. Hakem, Arda'nın elle etiketlediği örneklerle (`eval/etiketler.json`, henüz yok) en az %85 uyuşmadan karar vermek için kullanılmamalıdır.

## Karşılaştırma

`node eval/compare.ts` tüm sonuçları yan yana koyar: kategori tablosu, araç doğruluğu, stil bayrakları, yukarıdaki yeni satırlar ve modellerin ayrıştığı vakalar.

`node eval/compare.ts --pair eski yeni` iki etiketi vaka id'sine göre eşler (birden çok koşu varsa vaka başına ortalama), farkı `yeni - eski` olarak alır ve vakaları yerine koyarak 2000 kez yeniden örnekleyip (sabit tohumla, her çalıştırmada aynı sonuç) %95 aralık verir:

```
fark +4.4 puan [+0.6, +8.1] — anlamlı
```

Sayı yeni sonucun eskisinden kaç yüzde puan iyi (+) ya da kötü (-) olduğunu söyler. Aralık 0'ı içermiyorsa "anlamlı", içeriyorsa "anlamsız": fark gürültüden ayırt edilemez. 80 vakada 2-3 puanlık farklar neredeyse hep anlamsızdır; `--runs 3` ve daha çok vaka aralığı daraltır.

## Okuma

- Vaka başına 180 sn zaman aşımı (her tur için); hata ya da zaman aşımı başarısız sayılır.
- Araç doğruluğu: yalnızca araç beklenen (ya da "araç çağırma" beklenen) vakalarda, doğru araç ve argümanlar. Rota vakaları buna girmez.
- Stil bayrakları (her cevaba uygulanır): `empty`, `markdown`, `latex`, `emoji` (1'den fazla), `exclaim` (3'ten fazla ünlem), `nonTurkish`, `ruleLeak`, `kanka` (1'den fazla).
- Regex'ler küçük harfe Türkçe kurallarıyla çevrilen metinde aranır.
- `dur-*`, `soh-*` ve `du-*` gibi dürüstlük vakaları anahtar kelimeyle ölçüldüğü için sınırdadır: bir hatayı "yanlış alarm" saymadan önce sonuç dosyasındaki cevaba bak.
- Uygulamadaki "aynı cevabı tekrarladı, bir kez daha sıcak dene" yeniden denemesi eval'de yoktur: ölçüm modelin ilk cevabına bakar.
