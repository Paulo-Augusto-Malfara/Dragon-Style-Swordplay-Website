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

// Mesma cor da base do site (--ds-bg, #0b1016). Ícone, splash e página têm que
// dividir o tom, senão aparece um quadrado de cor diferente atrás do ícone na
// tela de abertura. Mudou aqui, mude também no manifest, no BaseLayout, no
// offline.html e em test-icone-maskable.mjs.
const BG = { r: 11, g: 16, b: 22 };

// "any": o ícone aparece inteiro, só precisa não encostar na borda.
const RESPIRO_ANY = 0.88;
// "maskable": o Android recorta em círculo/squircle e só garante os 80% centrais.
// Valor medido, não chutado: scripts/test-icone-maskable.mjs calcula o raio do
// pixel mais distante do centro e compara com esse círculo. Rode o teste sempre
// que o logo mudar -- o valor certo depende do formato da arte. Com o brasão
// inteiro (faixa em cima, fita embaixo) o teto era 0.63; com só o escudo, que é
// mais compacto radialmente, 0.74 ainda deixa ~4% de folga.
const RESPIRO_MASK = 0.74;

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
