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

const pairs = [
  ["lib/hooks/useFranchiseScopedGetCount", "lib/global/hooks/useFranchiseScopedGetCount"],
  ["lib/mockData/ticketManagement/", "mockData/ticketManagement/"],
];

for (const abs of walk(srcRoot)) {
  let s = fs.readFileSync(abs, "utf8");
  const orig = s;
  for (const [a, b] of pairs) s = s.split(a).join(b);
  if (s !== orig) fs.writeFileSync(abs, s, "utf8");
}

console.log("fixed hook and mockData import paths");
