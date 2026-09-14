/**
 * FlipsiTherm UI-Endtest (jsdom): lädt das gebaute index.html, fährt den kompletten
 * Wizard durch (Schritte 1–4), prüft Ergebnis + Protokoll + i18n-Umschaltung + Katalog.
 * Läuft in CI ohne echten Browser. jsdom: npm i jsdom (devDependency des Testumfelds).
 */
"use strict";
const fs = require("fs");
const path = require("path");

let JSDOM;
try { ({ JSDOM } = require("jsdom")); }
catch (e) {
  console.log("jsdom nicht installiert — UI-Endtest übersprungen (Kernel-Tests laufen weiter)");
  process.exit(0);
}

const html = fs.readFileSync(path.join(__dirname, "..", "FlipsiTherm.html"), "utf8");
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "http://localhost/FlipsiTherm.html",
  beforeParse(window) {
    // localStorage: jsdom hat getter-only — mit defineProperty ersetzen (http-Origin hätte echte Storage)
    let store = {};
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; }
      },
      configurable: true
    });
    window.fetch = () => Promise.resolve({ ok: false, status: 0, json: () => Promise.reject(new Error("offline (Test)")) }); // Auto-Refresh schlägt fehl → Offline-Badge
    window.print = () => { window.__printed = true; };
    window.scrollTo = () => {};
    window.alert = (m) => { window.__lastAlert = m; };
  }
});
const { window } = dom;
const { document } = window;

let passed = 0, failed = 0, failures = [];
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => { passed++; console.log("  ok  " + name); })
    .catch(e => { failed++; failures.push(name + " — " + e.message); console.log("FAIL  " + name + " — " + e.message); });
}

(async () => {
  // DOMContentLoaded abwarten
  await new Promise(r => {
    if (document.readyState === "complete") r();
    else window.addEventListener("load", r);
  });
  await new Promise(r => setTimeout(r, 50));

  await test("Boot: Wizard mit 4 Schritten gerendert", () => {
    if (document.querySelectorAll(".step").length !== 4) throw new Error("steps != 4");
    if (!document.querySelector("h1") || !document.querySelector("h1").textContent.includes("FlipsiTherm")) throw new Error("h1 falsch");
  });
  await test("Offline-Badge gesetzt (Auto-Refresh scheitert sauber im Test)", () => {
    const b = document.getElementById("catalogBadge").textContent;
    // Sprachunabhängig: Badge muss den eingebetteten Katalog-Stand zeigen und NICHT den Online-Zustand behaupten
    if (!b.includes("2026-09-11") || /online aktualisiert|refreshed online/.test(b)) throw new Error("Badge: " + b);
  });
  await test("Sprachmenü enthält DE + EN", () => {
    const opts = [...document.querySelectorAll("#langSel option")].map(o => o.value);
    if (!opts.includes("de") || !opts.includes("en")) throw new Error("Sprachen: " + opts.join(","));
  });
  await test("Sprachumschaltung DE→EN ändert UI-Texte", () => {
    const sel = document.getElementById("langSel");
    sel.value = "en"; sel.dispatchEvent(new window.Event("change"));
    if (!document.body.textContent.includes("Enclosure climate design")) throw new Error("EN-Text fehlt");
    sel.value = "de"; sel.dispatchEvent(new window.Event("change"));
    if (!document.body.textContent.includes("Schaltschrank-Klimaauslegung")) throw new Error("DE-Text fehlt");
  });
  await test("Schritt 1→2→3 Navigation", () => {
    window.goto(2); if (!document.body.textContent.includes("Umgebung")) throw new Error("Schritt 2 fehlt");
    window.goto(3); if (!document.getElementById("btnAddComp")) throw new Error("Schritt 3 fehlt");
  });
  await test("Komponente hinzufügen + Typwechsel Netzteilmuster", () => {
    document.getElementById("btnAddComp").click();
    const sels = document.querySelectorAll("#compList select[data-cf=type]");
    if (sels.length !== 1) throw new Error("Komponente nicht im DOM");
    sels[0].value = "power_supply"; sels[0].dispatchEvent(new window.Event("change"));
    const pOut = document.querySelector('#compList input[data-cf=P_out_W]');
    if (!pOut) throw new Error("Netzteil-Felder nicht gerendert");
    pOut.value = "100"; pOut.dispatchEvent(new window.Event("input"));
  });
  await test("Berechnung über UI → Schritt 4 mit KPI-Werten", () => {
    document.getElementById("btnCalc").click();
    const txt = document.body.textContent;
    if (!txt.includes("Geräte-Empfehlung")) throw new Error("Ergebnissicht fehlt");
    if (!/m³\/h/.test(txt)) throw new Error("kein Volumenstrom angezeigt");
  });
  await test("Device-Empfehlung listet Kataloggeräte mit Herkunfts-Badge", () => {
    const rows = document.querySelectorAll("#devTable tr");
    if (rows.length < 2) throw new Error("keine Empfehlungszeilen");
    if (!document.body.textContent.includes("Community")) throw new Error("Badge fehlt");
  });
  await test("Annahmen sichtbar (Netzteil ohne η → Annahme η=0,93)", () => {
    if (!document.body.textContent.includes("η=0,93")) throw new Error("Annahme-Hinweis fehlt");
  });
  await test("Protokoll wird erzeugt und gedruckt", () => {
    document.getElementById("btnPrint").click();
    const rep = document.getElementById("report");
    if (!rep.textContent.includes("Auslegungsprotokoll")) throw new Error("Protokoll-Inhalt fehlt");
    if (!rep.textContent.includes("Magnus-Formel")) throw new Error("Formelspalte fehlt");
    if (!rep.textContent.includes("IEC TR 60890")) throw new Error("Norm-Verweis fehlt");
    if (!window.__printed) throw new Error("window.print nicht aufgerufen");
  });
  await test("Projekt speichern erzeugt Download-JSON (Blob-URL)", () => {
    let captured = null;
    const orig = window.URL.createObjectURL;
    window.URL.createObjectURL = function (b) { captured = b; return "blob:test"; };
    try { document.getElementById("btnSave").click(); } finally { window.URL.createObjectURL = orig; }
    if (!captured) throw new Error("kein Blob erzeugt");
  });

  console.log("\n" + passed + " bestanden, " + failed + " fehlgeschlagen");
  if (failed > 0) { failures.forEach(f => console.log("  → " + f)); process.exit(1); }
})();