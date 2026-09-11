/**
 * FlipsiTherm v0.2-Feature-Tests: Zweig-Unabhängigkeit, Validierungs-Gate,
 * Raumaufheizung, Kundenverwaltung, Dark Mode, Protokoll ohne Dateipfad.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const kernel = require("../kernel.js");
const { calculate, validateInput } = kernel;

let passed = 0, failed = 0, failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { failed++; failures.push(name + " — " + e.message); console.log("FAIL  " + name + " — " + e.message); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const BASE = {
  enclosure: { widthB: 0.8, heightH: 2, depthT: 0.6 },
  mounting: { rear: "free", sides: "free", top: "free" },
  material: "stahl_lackiert",
  components: [{ type: "direct", watts: 200 }]
};

// ---------- Zweig-Unabhängigkeit ----------
test("Nur Heizen (keine Kühl-Eingaben): Heizleistung kommt, cooling=null", () => {
  const r = calculate(Object.assign({}, BASE, { environment: { tMin: -10 }, target: {} }));
  if (r.cooling !== null) throw new Error("cooling sollte null sein");
  if (!(r.heating.required > 0)) throw new Error("Heizleistung fehlt");
});
test("Nur Kühlen (keine Heiz-Eingaben): Lösung kommt, heating=null", () => {
  const r = calculate(Object.assign({}, BASE, { environment: { tMax: 35 }, target: { tInMax: 35 } }));
  if (r.heating !== null) throw new Error("heating sollte null sein");
  if (!r.cooling) throw new Error("cooling fehlt");
});
test("Heizen ohne tInMin: Default +5 °C mit Annahme-Hinweis", () => {
  const r = calculate(Object.assign({}, BASE, { environment: { tMin: -10 }, target: {} }));
  const a = r.assumptions.join(" ");
  if (!a.includes("Heizziel-Innentemperatur nicht angegeben")) throw new Error("Annahme fehlt");
  if (!a.includes("5 °C angenommen")) throw new Error("Default-Wert nicht genannt");
});
test("Weder Kühl- noch Heizdaten: Blockierender Fehler", () => {
  const v = validateInput(Object.assign({}, BASE, { environment: {}, target: {} }));
  if (v.errors.length === 0) throw new Error("sollte blockieren");
});

// ---------- Plausibilitäts-Gate ----------
test("Gate: B=99 m blockiert", () => {
  const v = validateInput(Object.assign({}, BASE, {
    enclosure: { widthB: 99, heightH: 2, depthT: 0.6 },
    environment: { tMin: -10 }, target: {}
  }));
  if (!v.errors.some(e => e.includes("Breite"))) throw new Error("keine Breiten-Meldung");
});
test("Gate: φ=150 % blockiert", () => {
  const v = validateInput(Object.assign({}, BASE, { environment: { tMax: 30, tInMax: 35, tMin: -10, rhPercent: 150 }, target: { tInMax: 35, tInMin: 5 } }));
  if (!v.errors.some(e => e.includes("1 und 100"))) throw new Error("keine Feuchte-Meldung: " + v.errors.join("; "));
});
test("Gate: Wirkungsgrad 1,2 blockiert", () => {
  const v = validateInput(Object.assign({}, BASE, { environment: { tMax: 30 }, target: { tInMax: 35 },
    components: [{ type: "power_supply", P_out_W: 100, efficiency: 1.2 }] }));
  if (!v.errors.some(e => e.includes("Wirkungsgrad"))) throw new Error("keine η-Meldung");
});
test("Warnung (nicht Block): Heizziel ≤ tMin", () => {
  const v = validateInput(Object.assign({}, BASE, { environment: { tMin: 5 }, target: { tInMin: 5 } }));
  if (v.errors.length) throw new Error("sollte nur warnen: " + v.errors[0]);
  if (!v.warnings.some(w => w.includes("keine Wirkung"))) throw new Error("Warnung fehlt");
});
test("Warnung: tInMax ≤ tMax → Kühlgerät-Hinweis", () => {
  const v = validateInput(Object.assign({}, BASE, { environment: { tMax: 35 }, target: { tInMax: 35 } }));
  if (v.errors.length) throw new Error("sollte nur warnen");
  if (!v.warnings.some(w => w.includes("Kühlgerät"))) throw new Error("Warnung fehlt");
});

// ---------- Aufstellung erweitert ----------
test("Anreihung (sides=row): wirksame Fläche zwischen frei und Wand", () => {
  const sFree = kernel.effectiveSurface(BASE.enclosure, { sides: "free", rear: "free", top: "free" });
  const sRow = kernel.effectiveSurface(BASE.enclosure, { sides: "row", rear: "free", top: "free" });
  const sWall = kernel.effectiveSurface(BASE.enclosure, { sides: "wall", rear: "free", top: "free" });
  if (!(sWall.area < sRow.area && sRow.area < sFree.area)) throw new Error("Reihenfolge falsch: " + sFree.area + " / " + sRow.area + " / " + sWall.area);
});
test("Raumaufheizung: +8 K auf alle Umgebungstemperaturen, Annahme gemeldet", () => {
  const r = calculate(Object.assign({}, BASE, {
    environment: { tMax: 30, tExp: 25, tMin: -10, rhPercent: 60, roomHeatingK: 8 },
    target: { tInMax: 35, tInMin: 5 }
  }));
  if (r.environment.tMax !== 38) throw new Error("tMax=" + r.environment.tMax);
  if (r.environment.tMin !== -2) throw new Error("tMin=" + r.environment.tMin);
  if (!r.assumptions.some(a => a.includes("Raumaufheizung"))) throw new Error("Annahme fehlt");
  // Kühlfall muss schwerer werden: qCool bei +8K größer als ohne
  const r0 = calculate(Object.assign({}, BASE, {
    environment: { tMax: 30, tExp: 25, tMin: -10, rhPercent: 60 }, target: { tInMax: 35, tInMin: 5 }
  }));
  if (!(r.cooling.qCool > r0.cooling.qCool)) throw new Error("qCool sollte steigen: " + r0.cooling.qCool + " → " + r.cooling.qCool);
});

// ---------- HTML/UI-Features (Bau-Datei) ----------
const tpl = fs.readFileSync(path.join(__dirname, "..", "index.template.html"), "utf8");
const built = fs.existsSync(path.join(__dirname, "..", "FlipsiTherm.html")) ? fs.readFileSync(path.join(__dirname, "..", "FlipsiTherm.html"), "utf8") : null;

test("Dark-Mode-CSS im Template (data-theme=dark + Print bleibt hell)", () => {
  if (!tpl.includes('[data-theme="dark"]')) throw new Error("kein Dark-CSS");
  if (!tpl.includes('html[data-theme="dark"]')) throw new Error("kein Print-Override");
});
test("Theme-Toggle mit localStorage-Persistenz", () => {
  if (!tpl.includes("flipsitherm_theme")) throw new Error("localStorage-Key fehlt");
  if (!tpl.includes("toggleTheme")) throw new Error("toggleTheme fehlt");
});
test("Kundenverwaltung: Dialog, localStorage, kein Upload-Weg", () => {
  if (!tpl.includes("dlgCustomers") || !tpl.includes("flipsitherm_customers")) throw new Error("Kundenverwaltung unvollständig");
  if (new RegExp("customers[^\\n]{0,120}(fetch\\(|fetchJSON|FormData|XMLHttpRequest)", "i").test(tpl)) throw new Error("Upload-Weg für Kunden!");
});
test("Kunden-/Projekt-Felder in Schritt 1 verdrahtet", () => {
  if (!tpl.includes("custSelect") || !tpl.includes("projTitle")) throw new Error("Felder fehlen");
  if (!tpl.includes('state.project.customer.name=cs.value')) throw new Error("Kunde-Bind fehlt");
  if (!tpl.includes('state.project.customer.ref=pt.value')) throw new Error("Projektname-Bind fehlt");
});
test("runCalc-Gate: blockiert bei errors, zeigt sie an", () => {
  if (!tpl.includes("if (v.errors.length) return;")) throw new Error("Gate fehlt");
  if (!tpl.includes("gateErrors")) throw new Error("Fehlerbox fehlt");
});
test("Protokoll: kein Dateipfad, Kundenadresse + Projekttitel im Kopf", () => {
  if (!tpl.includes("custContact") || !tpl.includes("custAddress")) throw new Error("Kundenblock fehlt");
  if (/file:\/\/|C:\\\\|\/root\//.test(tpl.split("buildReport")[1] || "")) throw new Error("Dateipfad im Protokoll!");
});
test("Gebaute Datei heißt FlipsiTherm.html (nicht index.html)", () => {
  if (!fs.existsSync(path.join(__dirname, "..", "FlipsiTherm.html"))) throw new Error("FlipsiTherm.html fehlt");
  const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");
  if (readme.includes("index.html")) throw new Error("README nennt noch index.html");
});

console.log("\n" + passed + " bestanden, " + failed + " fehlgeschlagen");
if (failed > 0) { failures.forEach(f => console.log("  → " + f)); process.exit(1); }