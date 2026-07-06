/**
 * Models live under src/lib/models. Files outside src/lib/ must import .../lib/models/...
 * Files under src/lib/ keep relative imports like ../models/ (already points at lib/models).
 */
import fs from "fs";
import path from "path";

const srcRoot = path.resolve("src");

const walk = (dir, out = []) => {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules") continue;
      walk(p, out);
    } else if (/\.(tsx?)$/.test(ent.name)) out.push(p);
  }
  return out;
};

function patch(content, relFromSrc) {
  const norm = relFromSrc.split(path.sep).join("/");
  if (norm.startsWith("lib/")) return content;

  let s = content;
  s = s.replace(
    /from(\s+)(["'])((?:\.\.\/)+)models\//g,
    "from$1$2$3lib/models/"
  );
  s = s.replaceAll(
    'import("../franchise/franchiseCatalog")',
    'import("../lib/franchise/franchiseCatalog")'
  );
  return s;
}

for (const abs of walk(srcRoot)) {
  const rel = path.relative(srcRoot, abs);
  const raw = fs.readFileSync(abs, "utf8");
  const next = patch(raw, rel);
  if (next !== raw) fs.writeFileSync(abs, next, "utf8");
}

console.log("models + franchiseCatalog import paths fixed");
