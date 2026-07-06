import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../src/services");
const outDir = path.resolve(__dirname, "../src/lib/services");

fs.mkdirSync(outDir, { recursive: true });

const names = [
  ...new Set(
    fs
      .readdirSync(root)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => f.replace(/\.ts$/, ""))
  ),
].sort();

for (const name of names) {
  const content = `export * from "../../services/${name}";\n`;
  fs.writeFileSync(path.join(outDir, `${name}.ts`), content);
}

console.log(`Created ${names.length} re-exports in src/lib/services`);
