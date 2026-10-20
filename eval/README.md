# Pati değerlendirme (eval)

Yerel bir modelin Pati'nin gerçek sohbet trafiğini Türkçe'de ne kadar iyi taşıdığını ölçer. Mesajlar uygulamadakiyle aynı kurulur (karakter personası, bilinen bilgiler, kurallar, günün geçmişi, saatli kullanıcı mesajı) ve gerçek `chatWithTools` döngüsü çalışır. Araçlar sahtedir: çağrıları kaydeder, makul başarı cevabı döner, böylece modelin son cümlesi de ölçülür. Saat sabittir: 21 Ekim 2026 Çarşamba 14:37.

`eval/cases.json` 80 vaka içerir: hatırlatıcı, hafıza kaydet/kullan, araç eylemi, sohbet, dürüstlük, saat, bilgi, stil. `matchIntent`, `matchFocus` ve `matchScreen`'in yakaladığı mesajlar uygulamada modele gitmediği için çalıştırıcı bunları atlar ve bildirir.

## Çalıştırma

Her model için sunucuyu aç, sonra:

```
node eval/run.ts --dry                                   # sadece cases.json'u doğrula
npm run eval -- --url http://127.0.0.1:8081/v1 --key local --label qwen3.5-4b
npm run eval -- --url http://127.0.0.1:8081/v1 --key local --label qwen3.5-9b
npm run eval -- --url http://127.0.0.1:8081/v1 --key local --label qwen3.6-35b
node eval/compare.ts
```

Seçenekler: `--model ad` (boşsa sunucunun ilk modeli), `--only hatirlatici`, `--limit 5`, `--runs 3` (sıcaklık 0.5 olduğu için tekrar ölçümü daha güvenilir yapar). Sonuçlar `eval/results/<label>.json` dosyasına yazılır (git'e girmez).

## Okuma

- Bir vaka, tüm `expect` kontrolleri geçerse ve stil bayrağı yoksa geçer. Vaka başına 180 sn zaman aşımı vardır; hata ya da zaman aşımı başarısız sayılır.
- Araç doğruluğu: yalnızca araç beklenen (ya da "araç çağırma" beklenen) vakalarda, doğru araç ve argümanlar.
- Stil bayrakları (her cevaba uygulanır, ayrıca sayılır): `empty`, `markdown`, `latex`, `emoji` (1'den fazla), `exclaim` (3'ten fazla ünlem), `nonTurkish`, `ruleLeak` (persona ya da kural metnini aynen alıntılama), `kanka` (1'den fazla).
- Kontrol sözlüğü: `tool` (ad ya da `null`), `anyTool`, `args` (regex, sayı için ±1, dizi: hepsi bir çağrıda bulunmalı, `"url|query"` gibi anahtar: biri yeterli), `contains`, `notContains`, `maxSentences`. Regex'ler küçük harfe Türkçe kurallarıyla çevrilen metinde aranır.
- `compare.ts` kategori tablosunu ve modellerin ayrıştığı vakaları (biri geçiyor, diğeri kalıyor) cevap özetleriyle gösterir.
- `dur-*` ve `soh-*` gibi dürüstlük vakaları anahtar kelimeyle ölçüldüğü için sınırdadır: bir hatayı "yanlış alarm" saymadan önce sonuç dosyasındaki cevaba bak.
