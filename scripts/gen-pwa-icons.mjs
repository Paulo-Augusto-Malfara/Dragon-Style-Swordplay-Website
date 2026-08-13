/**
 * Gera os ícones do PWA a partir do emblema.
 * Rode com `node scripts/gen-pwa-icons.mjs` sempre que o logo mudar.
 *
 * O mestre é transparente e já vem recortado no conteúdo (sem moldura vazia),
 * porque quem decide o respiro é este script, não o arquivo: "any" e "maskable"
 * precisam de margens bem diferentes.
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const SRC = "public/assets/img/logo-ds-emblema.png";
const OUT = "public/pwa";

// Fundo da própria arte original (#151f28), que é também o --secondary-color do
// site. Mantém ícone, splash e página na mesma cor, sem emenda visível.
const BG = { r: 21, g: 31, b: 40 };

// "any": o ícone aparece inteiro, só precisa não encostar na borda.
const RESPIRO_ANY = 0.88;
// "maskable": o Android recorta em círculo/squircle e só garante os 80% centrais.
// Valor medido, não chutado: scripts/test-icone-maskable.mjs calcula o raio do
// pixel mais distante do centro e compara com esse círculo. A 0.68 o conteúdo
// batia 103,6% do raio seguro, ou seja, as pontas da fita seriam cortadas.
// 0.63 deixa ~4% de folga. Se o logo mudar, rode o teste de novo.
const RESPIRO_MASK = 0.63;

await mkdir(OUT, { recursive: true });

async function icone(tamanho, respiro, arquivo) {
  const interno = Math.round(tamanho * respiro);
  const arte = await sharp(SRC)
    .resize(interno, interno, {
      fit: "inside",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  await sharp({
    create: { width: tamanho, height: tamanho, channels: 3, background: BG },
  })
    .composite([{ input: arte, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/${arquivo}`);

  console.log(`${OUT}/${arquivo}`);
}

for (const t of [192, 512]) await icone(t, RESPIRO_ANY, `icon-${t}.png`);
await icone(180, RESPIRO_ANY, "apple-touch-icon.png");
for (const t of [192, 512]) await icone(t, RESPIRO_MASK, `maskable-${t}.png`);
