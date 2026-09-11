/**
 * FlipsiTherm Build: index.template.html + kernel.js + Daten → index.html (Single-File)
 */
const fs = require("fs");
const path = require("path");

const tpl = fs.readFileSync("index.template.html", "utf8");
const kernel = fs.readFileSync("kernel.js", "utf8");

const langDir = "data/lang";
const langFiles = fs.readdirSync(langDir).filter(f => f.endsWith(".json"));
const langData = {};
for (const f of langFiles) {
  const iso = f.replace(".json", "");
  if (iso === "index") continue;
  langData[iso] = JSON.parse(fs.readFileSync(path.join(langDir, f), "utf8"));
}
const langFilesList = langFiles.map(f => f.replace(".json", "")).filter(x => x !== "index");

const catDir = "data/catalogs";
const catFiles = fs.readdirSync(catDir).filter(f => f.endsWith(".json"));
const catalogs = catFiles.map(f => JSON.parse(fs.readFileSync(path.join(catDir, f), "utf8")));
const stands = [...new Set(catalogs.map(c => c.stand))];

const config = {
  autoUpdate: true,
  catalogFiles: catFiles,
  catalogStand: stands.join("/") || "unbekannt"
};

const embedded = JSON.stringify({
  config: config,
  catalogs: catalogs,
  lang: langData
});

const out = tpl
  .replace("/*__KERNEL__*/", () => kernel)
  .replace("/*__EMBEDDED_DATA__*/", () => embedded);

fs.writeFileSync("index.html", out);
console.log("index.html gebaut:", (out.length / 1024).toFixed(1), "KB ·",
  "Sprachen:", langFilesList.join(", "), "· Kataloge:", catFiles.join(", "), "· Stand:", config.catalogStand);