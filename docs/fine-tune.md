# Kendi verinle ince ayar

Pati'nin 👍/👎 düğmeleri, beğendiğin ve beğenmediğin cevapları beyin klasöründe (`Ayarlar > Hafıza`'dan açılır)
`Feedback.jsonl` dosyasına yazar. Bu rehber o dosyayı eğitim verisine çevirmeyi anlatır.

## Dosyada ne var
Her satır bir JSON nesnesi:

| Alan | Anlamı |
|---|---|
| `time`, `character`, `model` | Ne zaman, hangi karakter, hangi model |
| `messages` | O cevabı üreten konuşmanın tamamı (sistem talimatı dahil) |
| `answer` | Modelin verdiği cevap |
| `rating` | `up` (👍) ya da `down` (👎) |
| `better` | Yalnız 👎'de, yazdıysan: "Nasıl olmalıydı?" kutusundaki düzeltme |

## Eğitim setine çevirmek
Her satırdan bir örnek çıkar: `messages` + bir asistan cevabı.
- 👍: `answer` olduğu gibi.
- 👎 ve `better` var: cevap olarak `answer` yerine `better`.
- 👎 ve `better` yok: at. Neyin yanlış olduğunu bilmeden ondan öğretilmez.

Başlamak için yaklaşık 300 örnek yeter. Azıyla da denenir ama etki küçük kalır; önce biriktir, sonra eğit.

## Eğitim
QLoRA, [Unsloth](https://github.com/unslothai/unsloth) ile, taban model Qwen3.5-4B (Pati-4B'nin tabanı).
4B için 8 GB'lık bir ekran kartı yeter; Pati-4B v3 8 GB'lık bir dizüstü kartında yaklaşık 100 dakikada eğitildi.
Ayrıntılar ve sonuçlar için `docs/PATI-4B.md`. Eğitim betiği bu repoda yok, Unsloth'un kendi örnek defterleri iş görür.

## Gizlilik
`Feedback.jsonl` senin gerçek konuşmalarını içerir: adın, planların, yazdığın her şey. Okumadan hiçbir yere
yükleme, paylaşma. Eğitim için de bulut GPU kullanacaksan önce içinden özel olanları ayıkla.
