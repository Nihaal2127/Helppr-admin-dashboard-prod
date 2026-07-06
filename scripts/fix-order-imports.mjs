import fs from "fs";
import path from "path";

function walk(dir, files = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && !["node_modules", ".git"].includes(e.name)) walk(p, files);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) files.push(p);
  }
  return files;
}

const patterns = [
  [/lib\/order\/orderTypes/g, "lib/order/orders"],
  [/lib\/order\/orderHelpers/g, "lib/order/orders"],
  [/lib\/order\/orderService/g, "lib/order/orders"],
  [/order\/orderTypes/g, "order/orders"],
];

let count = 0;
for (const f of walk("src")) {
  if (f.replace(/\\/g, "/").endsWith("lib/order/orders.ts")) continue;
  let s = fs.readFileSync(f, "utf8");
  const orig = s;
  for (const [re, rep] of patterns) s = s.replace(re, rep);
  if (s !== orig) {
    fs.writeFileSync(f, s);
    count++;
    console.log("updated", f);
  }
}
console.log("done", count);
