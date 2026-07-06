/**
 * Patch imports: (1) non-lib files -> insert lib/ before module roots.
 * (2) files under lib/ -> fix path to src/helper/utility.tsx
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
    } else if (/\.(tsx?|jsx?)$/.test(ent.name)) out.push(p);
  }
  return out;
};

function utilityImportPath(relFromSrc) {
  const dir = path.dirname(relFromSrc);
  const depth = dir.split(path.sep).filter(Boolean).length;
  return `${new Array(depth + 1).join("../")}helper/utility`;
}

const buckets = [
  "services",
  "models",
  "constant",
  "remote",
  "mockData",
  "types",
  "hooks",
  "layout",
  "routes",
  "quote",
];

const relPrefixes = [];
for (let i = 1; i <= 8; i++) relPrefixes.push("../".repeat(i));

function patch(content, relFromSrc) {
  let s = content;
  const inLib = relFromSrc.startsWith(`lib${path.sep}`);

  if (inLib) {
    const utilPath = utilityImportPath(relFromSrc);
    s = s.replace(
      /from\s+["'](?:\.\.\/)+helper\/utility["']/g,
      `from "${utilPath}"`
    );
  }

  if (!inLib) {
    for (const pre of relPrefixes) {
      for (const b of buckets) {
        s = s.replaceAll(`from "${pre}${b}/`, `from "${pre}lib/${b}/`);
        s = s.replaceAll(`from '${pre}${b}/`, `from '${pre}lib/${b}/`);
      }
      s = s.replaceAll(`from "${pre}helper/`, `from "${pre}lib/helper/`);
      s = s.replaceAll(`from '${pre}helper/`, `from '${pre}lib/helper/`);
      s = s.replaceAll(`from "${pre}lib/helper/utility`, `from "${pre}helper/utility`);
      s = s.replaceAll(`from '${pre}lib/helper/utility`, `from '${pre}helper/utility`);
    }

    s = s.replaceAll('from "./services/', 'from "./lib/services/');
    s = s.replaceAll("from './services/", "from './lib/services/");
    s = s.replaceAll('from "./helper/', 'from "./lib/helper/');
    s = s.replaceAll("from './helper/", "from './lib/helper/");
    s = s.replaceAll('from "./lib/helper/utility', 'from "./helper/utility');
    s = s.replaceAll("from './lib/helper/utility", "from './helper/utility");
    s = s.replaceAll('from "./constant/', 'from "./lib/constant/');
    s = s.replaceAll("from './constant/", "from './lib/constant/");
  }

  s = s.replace(/lib\/lib\//g, "lib/");
  return s;
}

for (const abs of walk(srcRoot)) {
  const rel = path.relative(srcRoot, abs);
  const raw = fs.readFileSync(abs, "utf8");
  const next = patch(raw, rel);
  if (next !== raw) fs.writeFileSync(abs, next, "utf8");
}

console.log("patch-lib-imports done");
