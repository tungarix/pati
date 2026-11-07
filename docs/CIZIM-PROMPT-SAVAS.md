# Savaş karelerini tek görselde çizdirme istemi

Her karakter için **tek bir görsel** istenir: üstte karakterin savaş kareleri, altta düşmanın kareleri. Görsel yapay zekâ çizim aracına **karakterin mevcut `stand.png` kareleriyle birlikte referans olarak** verilir ki yüz, kıyafet ve tarz tutsun.

Çıkan görsel 10 hücrelik bir ızgaradır (5 sütun × 2 satır), bir hücre boş kalır:

| | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Üst satır (karakter, sağa bakar) | `fight1` hazırlık (istemde `action1`) | `fight2` vuruş (`action2`) | `fight3` vuruş sonu (`action3`) | `win` zafer | boş |
| Alt satır (düşman, sola bakar) | `walk1` | `walk2` | `hit` (`bonk`) | `die1` (`poof1`) | `die2` (`poof2`) |

Kesme betiği (`scripts/slice-sheet.py`) pozları bağlı parçalar olarak bulur; bu yüzden pozlar birbirine değmemeli, arka plan düz beyaz olmalı.

## İstem (İngilizce, kopyala-yapıştır)

```
Create ONE sprite sheet image for a desktop-pet game, in the exact same art style, proportions, outline weight and colours as the attached reference character images. Cute chibi, about 2.5 heads tall, digital illustration, soft shading, thin dark outline, light from the top left, shadows in dark purple-navy rather than pure black.

CHARACTER: [CHARACTER DESCRIPTION: name, clothes, colours, prop/weapon, hair. Must match the reference exactly.]
CREATURE: [CREATURE DESCRIPTION: creature, colours, size relative to the character (half height up to same height, never bigger).]

LAYOUT: a plain pure white background (#FFFFFF), no ground, no shadow, no frame, no text, no labels, no numbers, no logos. A wide image with a grid of 5 columns and 2 rows. Every pose is fully separate with clear white space around it; no parts overlap or touch another pose or the image edge. Row 1 and row 2 each sit on their own invisible baseline: the feet of every pose in a row are on the same horizontal line, and every pose of the same figure is drawn at the same scale.

ROW 1, the CHARACTER, always facing RIGHT, same size in all four poses:
1. action1: ready stance, knees bent, determined face, prop raised and about to swing.
2. action2: the swing at its peak, body leaning forward, prop swung forward, with a few thin speed lines.
3. action3: follow-through right after the swing, prop lowered and swinging back, body recovering.
4. win: victory pose, relaxed grin, [WIN POSE: e.g. weapon resting on the shoulder / fist raised].
5. leave this fifth cell completely empty white.

ROW 2, the CREATURE, always facing LEFT (toward the character), same size in all five poses:
1. walk1: walking toward the character, first step of the walk cycle.
2. walk2: walking toward the character, opposite step of the walk cycle.
3. bonk: the moment it gets a playful bonk, bounced slightly backwards, eyes shut or startled.
4. poof1: fading away, the body pale and see-through, small puffs of smoke around it.
5. poof2: only a soft white-grey smoke cloud with two or three tiny sparkle stars; the creature has vanished.

STYLE RULES: a friendly, family-friendly cartoon like a children's game; the creature always vanishes in a soft white-grey puff of smoke. Do not redesign the character; keep face, outfit and colours identical to the reference in every pose. Do not add any text, captions, arrows, panels or decorations.
```

## Karakterlere göre doldurulacak yerler

Her karakter için üstteki istemin `[...]` yerleri şunlarla değişir (görünüşler [CIZIM-PLANLARI.md](CIZIM-PLANLARI.md) bölüm 3'ten):

| Karakter | CHARACTER | CREATURE | WIN POSE |
|---|---|---|---|
| Gordon Freeman | scientist in a dark charcoal armored suit with orange panels on chest, shoulders and thighs and a round orange emblem on the chest, black hair, thick-rimmed glasses, short brown beard, black gloves and boots, long grey crowbar, tired face | Kafa Yengeci: beige-pink four-legged crab-like creature with big teeth, leaps at faces; half the character's height | crowbar resting on the shoulder |
| Steve | blocky miner, orange-brown shirt, grey trousers, dark hair, stone pickaxe, cube-shaped head, flat two-tone shading | Zombi: green blocky creature, arms stretched forward, same height | pickaxe raised in one fist |
| Geralt | long white hair, yellow cat eyes with vertical pupils, dark leather jacket, two swords crossed on the back (one silver, one steel), silver claw pendant | Yaban Kurdu: grey wild wolf, half the character's height, snarling | sword spun and sheathed |
| Kratos | Greek strength warrior, bald, laurel wreath, bronze chest armour, round shield, spear, heavy shoulders | Harpi: winged woman-bird with dark feathers, same height | shield slammed on the ground |
| Lara Croft | adventurer girl, ponytail, green tank top, short shorts, leg holsters, small backpack, two small pistols | Mağara Yarasası: big purple bat with small red eyes, half the character's height | spinning a pistol on her finger |

## Sonra

- Görsel elinde olunca: `python scripts/slice-sheet.py` mevcut 8 pozluk kesiciyle uyumsuz; savaş sayfası için ayrı bir kesme adımı gerekir (karakter sağa bakar, düşman sola bakar, iki satırın ölçeği ayrı). İstek gelince eklenir.
- Aynı yöntemle ayrı bir sayfada `scene1`/`scene2` (karakterin kendi sahnesi) ve `fall`/`dust` çizilebilir; savaş için gerekli değiller.
