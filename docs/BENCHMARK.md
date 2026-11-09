# Pati ölçüm sonuçları

Türkçe ölçüm setiyle ([eval/README.md](../eval/README.md)) ölçülen her model yan yana. Bu dosya `node eval/benchmark.ts` ile kayıtlı sonuçlardan üretilir.

Okurken: iki vaka seti var ve birbirine eklenemez (80 vaka tek turlu eski set, 158 vaka çok turlu, tekrar, dosya ve gramer kontrolleri olan yeni set). **Genel** katı puandır. **Genel (küçük harf hariç)** yalnızca küçük harfle başlayan cevap yüzünden kalan vakaları geçmiş sayar; bu uygulamanın kendisinin düzeltebileceği bir biçim kuralıdır. Kategori hücrelerinde parantez içindeki sayı, aynı kural yok sayılınca çıkan orandır (yalnızca farklıysa yazılır). Sayılar vaka başına koşuların ortalamasıdır, kayıtlı dosyalardan hesaplanır.

## 80 vakalık set

| | Qwen3.6-35B (2 bit) | Qwen3.5-4B (düz) | Qwen3.5-9B (düz) | Pati-4B ilk eğitim | Pati-4B deneme v2 | Pati-4B deneme a |
|---|---|---|---|---|---|---|
| **Genel** | **65%** | **54%** | **49%** | **87%** | **83%** | **87%** |
| Genel (küçük harf hariç) | 69% | 56% | 51% | 90% | 85% | 91% |
| Araç doğruluğu | 80% | 69% | 60% | 96% | 90% | 96% |
| hatirlatici | 83% (88%) | 71% | 4% | 96% | 92% | 92% |
| hafiza_kaydet | 0% | 0% | 0% | 100% | 100% | 95% (100%) |
| hafiza_kullan | 75% (100%) | 92% | 92% | 75% | 67% | 75% |
| arac_eylem | 71% (75%) | 38% | 21% | 92% | 88% (92%) | 83% (96%) |
| sohbet | 75% | 45% | 45% | 90% | 75% | 90% (95%) |
| durustluk | 81% | 56% | 88% (94%) | 69% | 50% | 81% |
| saat | 100% | 75% | 100% | 100% | 100% | 100% |
| bilgi | 85% | 75% | 95% | 85% (90%) | 90% | 85% |
| stil | 31% (44%) | 69% (81%) | 75% (88%) | 69% (94%) | 75% (94%) | 81% (88%) |
| Medyan gecikme | 1.8 sn | 1.2 sn | 1.4 sn | 1.2 sn | 1.1 sn | 1.4 sn |
| Koşu / tarih | 2 / 2026-10-20 | 2 / 2026-10-20 | 2 / 2026-10-20 | 2 / 2026-10-21 | 2 / 2026-10-21 | 2 / 2026-10-24 |

## 158 vakalık set

| | Pati-4B v1 (eski ayar) | Pati-4B v1 | Pati-4B v3 (eski ayar) | Pati-4B v3 | Bolt E4B (düşünme açık) | Bolt E4B (düşünme kapalı) | Pati-4B v4 (deneme) | Pati-4B v4.1 (deneme) | Pati-4B v3 (1. ölçüm, yeni set) | Pati-4B v4.2 (1. ölçüm) | Pati-4B v4.2 (2. ölçüm) | Pati-4B v3 (2. ölçüm, yeni set) | Pati-4B v4.3 (1. ölçüm, yayınlanmadı) | Pati-4B v4.3 (2. ölçüm, yayınlanmadı) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Genel** | **69%** | **67%** | **80%** | **82%** | **44%** | **43%** | **73%** | **72%** | **84%** | **90%** | **88%** | **82%** | **88%** | **88%** |
| Genel (küçük harf hariç) | 70% | 69% | 81% | 83% | 74% | 76% | 76% | 76% | 85% | 90% | 89% | 83% | 88% | 89% |
| Araç doğruluğu | 88% | 88% | 90% | 91% | 85% | 86% | 89% | 92% | 93% | 98% | 96% | 93% | 96% | 96% |
| hatirlatici | 89% | 89% (94%) | 92% | 100% | 81% | 89% (94%) | 81% (92%) | 86% (94%) | 94% | 100% | 94% | 97% | 92% | 92% |
| hafiza_kaydet | 97% | 97% (100%) | 100% | 100% | 100% | 100% | 90% (97%) | 90% (97%) | 97% (100%) | 100% | 100% | 100% | 100% | 100% |
| hafiza_kullan | 89% | 83% | 72% | 61% (67%) | 50% (83%) | 44% (83%) | 100% | 94% | 72% | 83% | 83% | 67% (72%) | 83% | 83% |
| arac_eylem | 92% (97%) | 86% (94%) | 94% | 97% | 81% | 75% | 69% (81%) | 94% (100%) | 92% | 100% | 92% (97%) | 94% (100%) | 94% | 94% (97%) |
| sohbet | 93% | 70% | 90% | 93% | 33% (100%) | 17% (100%) | 97% | 80% | 87% | 97% | 87% | 90% | 90% (93%) | 93% |
| durustluk | 50% | 58% | 85% | 81% | 21% (52%) | 19% (48%) | 31% | 67% | 81% | 85% | 83% | 77% | 79% | 83% (85%) |
| saat | 100% | 100% | 100% | 92% | 75% (100%) | 75% (100%) | 92% | 75% (83%) | 92% | 83% | 100% | 100% | 100% | 92% |
| bilgi | 90% (93%) | 83% | 90% | 87% | 70% (83%) | 67% (87%) | 80% (90%) | 83% (87%) | 93% | 93% | 90% | 90% | 87% | 87% |
| stil | 92% | 92% | 100% | 96% | 29% (100%) | 46% (100%) | 100% | 83% | 100% | 96% | 96% | 100% | 96% | 100% |
| cok_tur | 58% | 60% (63%) | 46% | 52% | 21% (71%) | 25% (73%) | 50% (54%) | 46% (54%) | 75% | 88% | 83% | 63% | 81% | 79% (81%) |
| tekrar | 0% | 8% | 53% | 56% | 8% (61%) | 6% (75%) | 39% | 14% (17%) | 67% | 61% | 72% | 58% | 67% | 69% |
| dil | 69% | 64% | 79% | 88% | 26% (86%) | 29% (90%) | 71% | 69% | 74% | 83% | 76% | 76% | 83% | 83% |
| dosya | 33% | 26% | 69% (81%) | 74% (79%) | 7% | 7% | 98% | 81% (83%) | 74% (83%) | 95% (98%) | 95% (98%) | 74% (79%) | 98% (100%) | 98% |
| rota | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| Medyan gecikme | 1.1 sn | 1.4 sn | 0.9 sn | 1.4 sn | 0.9 sn | 0.9 sn | 1.3 sn | 1.5 sn | 1.2 sn | 1.1 sn | 1.1 sn | 1.2 sn | 1.1 sn | 1.1 sn |
| Koşu / tarih | 3 / 2026-10-25 | 3 / 2026-10-25 | 3 / 2026-10-25 | 3 / 2026-10-25 | 3 / 2026-11-01 | 3 / 2026-11-01 | 3 / 2026-11-01 | 3 / 2026-11-01 | 3 / 2026-11-02 | 3 / 2026-11-03 | 3 / 2026-11-03 | 3 / 2026-11-03 | 3 / 2026-11-09 | 3 / 2026-11-09 |

## Notlar

- **Bolt E4B** modelin kendi ayarlarıyla, "düşünme" açık ölçüldü (Pati-4B düşünmeden cevap verir). Q4_K_M, 6,18 GB. Cevapların yaklaşık yarısı küçük harfle başlıyor; bu yüzden katı ve düzeltilmiş puan çok ayrışıyor.
- Sonuç dosyaları `eval/results/` altındadır ve depoya girmez.
