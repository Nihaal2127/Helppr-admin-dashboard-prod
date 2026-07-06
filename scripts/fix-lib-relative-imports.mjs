/**
 * Fix relative imports inside src/lib after moving remote/constant/... under global/.
 * Files under lib/global/* keep ../remote (sibling under global).
 */
import fs from "fs";
import path from "path";

const srcRoot = path.resolve("src", "lib");

const walk = (dir, out = []) => {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith(".ts")) out.push(p);
  }
  return out;
};

function patchFile(abs, rel) {
  const underGlobal = rel.startsWith(`global${path.sep}`);
  let s = fs.readFileSync(abs, "utf8");
  const orig = s;
  if (!underGlobal) {
    s = s.replace(/from\s+["']\.\.\/remote\//g, 'from "../global/remote/');
    s = s.replace(/from\s+["']\.\.\/constant\//g, 'from "../global/constant/');
    s = s.replace(/from\s+["']\.\.\/helper\//g, 'from "../global/helper/');
  }
  if (s !== orig) fs.writeFileSync(abs, s, "utf8");
}

if (fs.existsSync(srcRoot)) {
  for (const abs of walk(srcRoot)) {
    const rel = path.relative(srcRoot, abs);
    patchFile(abs, rel);
  }
}
console.log("fix-lib-relative done");
