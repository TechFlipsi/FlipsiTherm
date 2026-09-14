/**
 * v0.2.3 Regression: Nur-Heizen / Nur-Kühlen im UI (jsdom) — früher CRASH in renderResult.
 * Prüft: Ergebnis-Ansicht, Geräte-Empfehlung und Protokoll bei fehlendem Zweig.
 */
"use strict";
const fs = require("fs");
const path = require("path");
let JSDOM;
try { ({ JSDOM } = require("jsdom")); }
catch (e) { console.log("jsdom fehlt — UI-Branch-Test übersprungen"); process.exit(0); }

const html = fs.readFileSync(path.join(__dirname, "..", "FlipsiTherm.html"), "utf8");
const dom = new JSDOM(html, {
  runScripts: "dangerously", pretendToBeVisual: true,
  url: "http://localhost/FlipsiTherm.html",
  beforeParse(window) {
    let store = {};
    Object.defineProperty(window, "localStorage", {
      value: { getItem: (k)=>(k in store?store[k]:null), setItem: (k,v)=>{store[k]=String(v);}, removeItem:(k)=>{delete store[k];} },
      configurable: true
    });
    window.fetch = () => Promise.resolve({ ok:false, status:0, json:()=>Promise.reject(new Error("offline")) });
    window.print = () => { window.__printed = true; };
    window.scrollTo = () => {};
    window.alert = () => {};
  }
});
const { window } = dom; const { document } = window;
let passed = 0, failed = 0, failures = [];
function test(name, fn){ try { fn(); passed++; console.log("  ok  "+name); } catch(e){ failed++; failures.push(name+" — "+e.message); console.log("FAIL  "+name+" — "+e.message); } }
function setVal(bind, v){
  const el = document.querySelector('input[data-bind="'+bind+'"]');
  el.value = v; el.dispatchEvent(new window.Event("input"));
}

(async () => {
  await new Promise(r => { if (document.readyState==="complete") r(); else window.addEventListener("load", r); });
  await new Promise(r => setTimeout(r, 50));

  test("Nur Heizen: UI rendert Schritt 4 OHNE Crash (cooling=null)", () => {
    window.goto(2);
    setVal("tMin", "-10"); setVal("tMax", ""); setVal("tInMax", "");
    window.goto(3);
    document.getElementById("btnCalc").click();
    if (!window.state.lastResult) throw new Error("kein Ergebnis");
    if (window.state.lastResult.cooling !== null) throw new Error("cooling sollte null sein");
    if (!window.state.lastResult.heating) throw new Error("heating fehlt");
    if (!document.body.textContent.includes("W")) throw new Error("Ergebnis-Sicht leer");
  });

  test("Nur Kühlen: UI rendert Schritt 4 OHNE Crash (heating=null)", () => {
    window.goto(2);
    setVal("tMin", ""); setVal("tMax", "35"); setVal("tInMax", "30");
    window.goto(3);
    document.getElementById("btnCalc").click();
    if (window.state.lastResult.heating !== null) throw new Error("heating sollte null sein");
    if (!window.state.lastResult.cooling) throw new Error("cooling fehlt");
    if (!document.body.textContent.includes("m³/h")) throw new Error("kein Volumenstrom");
  });

  test("Protokoll bei nur-Heizen: keine Kühlzeilen, druckt sauber", () => {
    window.goto(2);
    setVal("tMax", ""); setVal("tInMax", ""); setVal("tMin", "-10");
    window.goto(3);
    document.getElementById("btnCalc").click();
    document.getElementById("btnPrint").click();
    const rep = document.getElementById("report");
    if (!rep.textContent.includes("IEC TR 60890")) throw new Error("Protokoll unvollständig");
    if (rep.textContent.includes("ΔT Kühlfall") || rep.textContent.includes("ΔT cooling case")) throw new Error("Kühlzeilen sollten fehlen");
    if (!window.__printed) throw new Error("print nicht aufgerufen");
  });

  test("Protokoll bei nur-Kühlen: keine Heizzeilen, druckt sauber", () => {
    window.goto(2);
    setVal("tMin", ""); setVal("tMax", "35"); setVal("tInMax", "30");
    window.goto(3);
    document.getElementById("btnCalc").click();
    document.getElementById("btnPrint").click();
    const rep = document.getElementById("report");
    if (!rep.textContent.includes("IEC TR 60890")) throw new Error("Protokoll unvollständig");
    if (rep.textContent.includes("Heizbedarf") || rep.textContent.includes("Heating demand")) throw new Error("Heizzeilen sollten fehlen");
    if (!window.__printed) throw new Error("print nicht aufgerufen");
  });

  console.log("\n" + passed + " bestanden, " + failed + " fehlgeschlagen");
  if (failed > 0) { failures.forEach(f => console.log("  → " + f)); process.exit(1); }
})();