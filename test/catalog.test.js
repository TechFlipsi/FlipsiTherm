/**
 * FlipsiTherm Katalog-Validierung
 * Prüft alle data/catalogs/*.json gegen das Schema (README §Gerätedatenbank):
 * Pflichtfelder, erlaubte Werte, ID-Eindeutigkeit, Kühl-Nennbedingung, Quellenlink,
 * status-Flag-Konsistenz. Läuft in CI — ein kaputter Katalog bricht den Build.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const CAT_DIR = path.join(__dirname, "..", "data", "catalogs");
const TYPES = ["heizung", "filterluefter", "waermetauscher", "kuehlgeraet"];
const STATUSES = ["verifiziert", "zu_verifizieren"];
// Wärmetauscher: entweder absolute Kühlleistung ODER spezifische Wärmeleistung W/K
function valueField(d) {
  if (d.typ === "heizung") return "leistung_W";
  if (d.typ === "filterluefter") return "luftstrom_m3h";
  if (d.typ === "waermetauscher") return (typeof d.waermeleistung_wk === "number") ? "waermeleistung_wk" : "kuehlleistung_W";
  return "kuehlgeraet" ? "kuehlleistung_W" : null;
}

let passed = 0, failed = 0, failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { failed++; failures.push(name + " — " + e.message); console.log("FAIL  " + name + " — " + e.message); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const files = fs.readdirSync(CAT_DIR).filter(f => f.endsWith(".json"));
const seenIds = new Set();
let totalDevices = 0, verifiedDevices = 0;

test("Mindestens 4 Katalogdateien vorhanden", () => {
  assert(files.length >= 4, "nur " + files.length + " Kataloge: " + files.join(","));
});

for (const f of files) {
  const file = path.join(CAT_DIR, f);
  let json;
  test(f + ": gültiges JSON", () => {
    json = JSON.parse(fs.readFileSync(file, "utf8"));
  });
  test(f + ": Kopf-Schema (hersteller, stand, quelle_url, devices)", () => {
    assert(typeof json.hersteller === "string" && json.hersteller.length > 1, "hersteller fehlt");
    assert(/^\d{4}-\d{2}-\d{2}$/.test(json.stand), "stand kein ISO-Datum: " + json.stand);
    assert(typeof json.quelle_url === "string" && json.quelle_url.startsWith("http"), "quelle_url fehlt");
    assert(Array.isArray(json.devices) && json.devices.length >= 3, "devices fehlt/zu leer");
  });
  test(f + ": jede Zeile vollständig & typ-korrekt", () => {
    for (const d of json.devices) {
      const ctx = d.id || d.bezeichnung || "?";
      assert(d.id && /^[a-z0-9-]+$/.test(d.id), "id fehlt/Format: " + ctx);
      assert(!seenIds.has(d.id), "doppelte id: " + d.id);
      seenIds.add(d.id);
      assert(TYPES.includes(d.typ), "unbekannter typ: " + d.typ + " (" + ctx + ")");
      const vf = valueField(d);
      assert(vf, "kein Werte-Feld möglich: " + ctx);
      assert(typeof d[vf] === "number" && d[vf] > 0, vf + " fehlt/≤0: " + ctx);
      assert(typeof d.bezeichnung === "string" && d.bezeichnung.length > 2, "bezeichnung fehlt: " + ctx);
      assert(typeof d.quell_url === "string" && d.quell_url.startsWith("http"), "quell_url fehlt: " + ctx);
      assert(/^\d{4}-\d{2}-\d{2}$/.test(d.zuletzt_geprueft), "zuletzt_geprueft kein ISO-Datum: " + ctx);
      assert(STATUSES.includes(d.status), "status ungueltig: " + d.status + " (" + ctx + ")");
      if (d.typ === "kuehlgeraet") {
        assert(typeof d.kuehl_nennbedingung === "string" && /L\d{2}/.test(d.kuehl_nennbedingung), "kuehl_nennbedingung fehlt: " + ctx);
      }
      if (d.typ === "heizung") assert(d.leistung_W <= 3000, "unplausibel große Heizleistung: " + ctx);
      if (d.typ === "filterluefter") assert(d.luftstrom_m3h >= 10 && d.luftstrom_m3h <= 4000, "unplausibler Luftstrom: " + ctx);
      if (d.typ === "kuehlgeraet") assert(d.kuehlleistung_W >= 300 && d.kuehlleistung_W <= 30000, "unplausible Kühlleistung: " + ctx);
      if (d.typ === "waermetauscher" && vf === "waermeleistung_wk") assert(d.waermeleistung_wk >= 3 && d.waermeleistung_wk <= 300, "unplausible W/K-Leistung: " + ctx);
    }
  });
  test(f + ": Verifizierungsquote erfassbar", () => {
    const v = json.devices.filter(d => d.status === "verifiziert").length;
    totalDevices += json.devices.length;
    verifiedDevices += v;
    console.log("      ↳ " + json.hersteller + ": " + v + "/" + json.devices.length + " verifiziert");
  });
}

test("Gesamtverifizierungsstand plausibel dokumentiert", () => {
  console.log("      ↳ GESAMT: " + verifiedDevices + "/" + totalDevices + " Geräte verifiziert (" + Math.round(100 * verifiedDevices / totalDevices) + " %)");
  assert(totalDevices >= 20, "zu wenige Geräte insgesamt: " + totalDevices);
});

console.log("\n" + passed + " bestanden, " + failed + " fehlgeschlagen · " + verifiedDevices + "/" + totalDevices + " verifiziert");
if (failed > 0) process.exit(1);