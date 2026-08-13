/**
 * Gera os ícones do PWA a partir do logo quadrado.
 * Rode com `node scripts/gen-pwa-icons.mjs` sempre que o logo mudar.
 *
 * "any"      -> o logo como está (ele já vem com fundo próprio).
 * "maskable" -> o emblema recortado e reduzido pra caber na zona segura do
 *               Android (círculo central de 80%), senão as bordas são cortadas.
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const SRC = "public/assets/img/logo-quadrada-ds-site.webp";
const OUT = "public/pwa";

// Fundo do próprio logo, medido nos cantos. Mantém os dois ícones na mesma família.
const BG = { r: 18, g: 41, b: 68 };
// Um quadrado inscrito na zona segura de 80% daria 56%. 62% arredonda pra cima
// porque o emblema não preenche os cantos do próprio bounding box.
const SAFE = 0.62;

await mkdir(OUT, { recursive: true });

const png = (buf) => sharp(buf).png({ compressionLevel: 9 });

// --- purpose: any + apple-touch-icon ---
for (const size of [192, 512, 180]) {
  const name = size === 180 ? "apple-touch-icon.png" : `icon-${size}.png`;
  await png(await sharp(SRC).resize(size, size, { fit: "cover" }).toBuffer()).toFile(
    `${OUT}/${name}`,
  );
  console.log(`${OUT}/${name}`);
}

// --- purpose: maskable ---
// trim() recorta a moldura de fundo uniforme, sobrando só o emblema.
const emblema = await sharp(SRC).trim({ threshold: 12 }).toBuffer();

for (const size of [192, 512]) {
  const inner = Math.round(size * SAFE);
  const conteudo = await sharp(emblema)
    .resize(inner, inner, { fit: "inside" })
    .toBuffer();

  await png(
    await sharp({
      create: { width: size, height: size, channels: 3, background: BG },
    })
      .composite([{ input: conteudo, gravity: "center" }])
      .png()
      .toBuffer(),
  ).toFile(`${OUT}/maskable-${size}.png`);
  console.log(`${OUT}/maskable-${size}.png`);
}
