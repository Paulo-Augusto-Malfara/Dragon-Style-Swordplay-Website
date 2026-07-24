import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const files = execSync("git grep -lIE \"\\.(png|jpg|jpeg|PNG)\" -- src", { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);

for (const file of files) {
  const before = readFileSync(file, "utf8");
  const after = before.replace(/\.(png|jpg|jpeg|PNG)(?=["'`)])/g, ".webp");
  if (before !== after) {
    writeFileSync(file, after);
    console.log(`updated: ${file}`);
  }
}
