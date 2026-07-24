import sharp from "sharp";
import { readdirSync, statSync, unlinkSync } from "fs";
import { join, extname, basename, dirname } from "path";

const root = "public/assets/img";
const exts = new Set([".png", ".jpg", ".jpeg"]);

function collect(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, files);
    else if (exts.has(extname(entry).toLowerCase())) files.push(full);
  }
  return files;
}

async function convert(file) {
  const out = join(dirname(file), basename(file, extname(file)) + ".webp");
  await sharp(file).webp({ quality: 80 }).toFile(out);
  unlinkSync(file);
  console.log(`${file} -> ${out}`);
}

for (const file of collect(root)) {
  await convert(file);
}
