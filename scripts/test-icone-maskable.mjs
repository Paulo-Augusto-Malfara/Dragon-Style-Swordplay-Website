/**
 * Checa se o ícone maskable cabe na zona segura do Android.
 *
 * Launcher com máscara circular só garante os 80% centrais do ícone. O que passa
 * disso é cortado, e o corte não aparece em nenhum lugar até alguém instalar o
 * app e ver o logo mutilado na gaveta. Este teste mede o pixel mais distante do
 * centro e reprova se ele ultrapassar o raio seguro.
 *
 * Rode com `node scripts/test-icone-maskable.mjs` depois de gerar os ícones.
 */
import assert from "node:assert/strict";
import sharp from "sharp";

// Mesmo fundo usado por gen-pwa-icons.mjs.
const BG = [21, 31, 40];
const ARQUIVOS = ["public/pwa/maskable-192.png", "public/pwa/maskable-512.png"];

for (const arquivo of ARQUIVOS) {
  const { data, info } = await sharp(arquivo)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, channels: C } = info;
  const centro = (W - 1) / 2;

  let rmax = 0;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * C;
      const dist =
        Math.abs(data[i] - BG[0]) +
        Math.abs(data[i + 1] - BG[1]) +
        Math.abs(data[i + 2] - BG[2]);
      if (dist > 30) {
        const r = Math.hypot(x - centro, y - centro);
        if (r > rmax) rmax = r;
      }
    }
  }

  const seguro = 0.4 * W;
  const ocupacao = (rmax / seguro) * 100;
  console.log(
    `${arquivo}: conteudo ocupa ${ocupacao.toFixed(1)}% do raio seguro`,
  );
  assert.ok(
    rmax <= seguro,
    `${arquivo}: conteudo passa da zona segura (${ocupacao.toFixed(1)}%), seria cortado em launcher circular. Reduza RESPIRO_MASK em scripts/gen-pwa-icons.mjs.`,
  );
}

console.log("ok: todos os maskable cabem na zona segura");
