/**
 * Point imports at src/services and src/models (not lib/services, lib/models).
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

for (const abs of walk(srcRoot)) {
  let s = fs.readFileSync(abs, "utf8");
  const orig = s;
  s = s.split("lib/services/").join("services/");
  s = s.split("lib/models/").join("models/");
  if (s !== orig) fs.writeFileSync(abs, s, "utf8");
}

console.log("fixed lib/services and lib/models import paths");
