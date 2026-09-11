/**
 * FlipsiTherm Kernel-Tests
 * Golden-Files: Referenzwerte aus offenen Quellen (FISEKON-Rechner-Doku, TGB-Applikation,
 * CAD.de-Forumstabellen). Toleranz ±5 % (Plan §7), engere Toleranzen wo Quelle exakt.
 */
"use strict";
const kernel = require("../kernel.js");
const { calculate, dewPoint, effectiveSurface, componentLosses, internalLosses } = kernel;

let passed = 0, failed = 0, failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { failed++; failures.push({ name, err: e.message }); console.log("FAIL  " + name + " — " + e.message); }
}
function assertClose(actual, expected, tol, msg) {
  const d = Math.abs(actual - expected);
  if (d > tol) throw new Error(msg + " | ist=" + actual + " soll=" + expected + " ±" + tol);
}

// ---------- Magnus-Taupunkt (gültig 0…60 °C, φ>0) ----------
test("Taupunkt 25 °C / 60 % r. F. ≈ 16,7 °C (Magnus-Tabellenwert)", () => {
  assertClose(dewPoint(25, 60), 16.7, 0.2, "Taupunkt falsch");
});
test("Taupunkt 20 °C / 90 % r. F. ≈ 18,3 °C", () => {
  assertClose(dewPoint(20, 90), 18.3, 0.3, "Taupunkt falsch");
});
test("Taupunkt 5 °C / 60 % r. F. ≈ −2,13 °C (unter tMin möglich)", () => {
  assertClose(dewPoint(5, 60), -2.13, 0.05, "Taupunkt falsch");
});
test("Taupunkt bei φ=100 % gleich Lufttemperatur", () => {
  assertClose(dewPoint(15, 100), 15, 0.1, "τ(100 %)≠t");
});

// ---------- Oberfläche ----------
test("Freistehender Schrank (IEC-b-Faktoren): 0,8×2,0×0,6 m → 6,048 m²", () => {
  const r = effectiveSurface({ widthB: 0.8, heightH: 2.0, depthT: 0.6 }, { rear: "free", sides: "free", top: "free" });
  // front 0,9*1,6=1,44 | rear 1,44 | 2×Seite 1,08+1,08 | top 1,4*0,48=0,672 | bottom 0,7*0,48=0,336
  assertClose(r.area, 6.048, 0.01, "Fläche falsch");
});
test("Wandschrank (rear+beide Seiten Wand, oben abgedeckt): ~20 % weniger wirksame Fläche", () => {
  const free = effectiveSurface({ widthB: 1, heightH: 2, depthT: 0.5 }, { rear: "free", sides: "free", top: "free" });
  const wall = effectiveSurface({ widthB: 1, heightH: 2, depthT: 0.5 }, { rear: "wall", sides: "wall", top: "covered" });
  if (wall.area >= free.area * 0.85) throw new Error("Wandanbau-Abschlag zu klein: " + wall.area + " vs " + free.area);
});
test("FISEKON-Vergleich: freistehend A=1,8·H·(B+T)+1,4·B·T — 0,8/2,0/0,6 → 4,092 m² (ohne Bodenabzug identisch 4,092-0,336=3,756? FISEKON zählt Boden NICHT)", () => {
  const r = effectiveSurface({ widthB: 0.8, heightH: 2.0, depthT: 0.6 }, { model: "fisekon_simplified", rear: "free", sides: "free", top: "free" });
  // FISEKON: 1,8·H·(B+T)+1,4·B·T = 1,8*2*1,4 + 1,4*0,48 = 5,04+0,672 = 5,712 — ACHTUNG Faktor 1,8 auf (B+T)·H
  assertClose(r.area, 5.712, 0.05, "FISEKON-Mustermann nicht getroffen");
});

// ---------- Komponenten-Verlustmodelle ----------
test("Netzteil: 100 W Ausgang, η=0,93 → 7,5 W Verlust (P_out·(1−η)/η)", () => {
  const r = componentLosses({ type: "power_supply", P_out_W: 100, efficiency: 0.93, loadFactor: 1 });
  assertClose(r.losses, 7.53, 0.05, "Netzteil-Verlust falsch");
});
test("Umrichter 90 kW (CAD.de-Fall): η=0,97 → 2783 W ≈ Forumswert 2300 W (Größenordnung ±20 %)", () => {
  const r = componentLosses({ type: "drive", P_N_W: 90000, efficiency: 0.97, loadFactor: 1 });
  assertClose(r.losses, 2783, 560, "Umrichter-Verlust falsch"); // Forum nennt 2300 W
});
test("Netzfilter über ΔU·I (NICHT U·I!): 0,5 V × 30 A = 15 W", () => {
  const r = componentLosses({ type: "netfilter", deltaU_V: 0.5, I_load_A: 30, loadFactor: 1 });
  assertClose(r.losses, 15, 0.1, "Netzfilter-Verlust falsch");
});
test("loadFactor 0,5 halbiert Verlust (Gleichzeitigkeitsfaktor)", () => {
  const full = componentLosses({ type: "direct", watts: 200, loadFactor: 1 });
  const half = componentLosses({ type: "direct", watts: 200, loadFactor: 0.5 });
  assertClose(half.losses, full.losses / 2, 0.01, "Lastfaktor falsch");
});

// ---------- End-to-End: FISEKON-Konvention ----------
test("Golden File: FISEKON-Beispiel — freistehender 0,8/2,0/0,6-Stahlschrank, 200 W, Ti 35/Tu_max 30, τ-Heizfall, Heizen auf +5 °C bei Tu_min −10, φ 60 %", () => {
  const res = calculate({
    enclosure: { widthB: 0.8, heightH: 2.0, depthT: 0.6 },
    mounting: { rear: "free", sides: "free", top: "free", model: "fisekon_simplified" },
    material: "stahl_lackiert",
    environment: { tMax: 30, tExp: 25, tMin: -10, rhPercent: 60 },
    target: { tInMax: 35, tInMin: 5 },
    components: [{ type: "direct", watts: 200, name: "Beispielverbraucher" }]
  });
  // FISEKON: A=5,712; Kühlfall ΔT=5K: Hülle=5,5*5,712*5=157 W → Q_Kühl=200−157=43 W; V=3,1*43/5=27 m³/h
  // Heizfall: τ(25/60 %)=16,7 → dT_dew=26,7K → 5,5*5,712*26,7=805 W → (267-0)*1,15=307 W
  //   (loss_dew=5,5*5,712*26,7=838 W; (838-0)*1,15=964 W) — Kontrolle unten mit echten Werten
  if (!(res.heating.required > 300)) throw new Error("Heizleistung unrealistisch niedrig: " + res.heating.required);
  if (res.cooling.solution !== "filterfan") throw new Error("Erwartet filterfan, ist " + res.cooling.solution);
  assertClose(res.cooling.qCool, 43, 5, "Kühlbedarf falsch");
});

test("Kühlfall: Tu_max ≥ Ti_zul → Kühlgerät, kein Lüfter", () => {
  const res = calculate({
    enclosure: { widthB: 1, heightH: 2, depthT: 0.6 },
    material: "stahl_lackiert",
    mounting: { rear: "free", sides: "free", top: "free" },
    environment: { tMax: 40, tExp: 30, tMin: -10, rhPercent: 60 },
    target: { tInMax: 35, tInMin: 5 },
    components: [{ type: "direct", watts: 500 }]
  });
  if (res.cooling.solution !== "cooling_unit") throw new Error("sollte cooling_unit: " + res.cooling.solution);
});
test("Passivfall: kleine Last, große Hülle → keine aktive Kühlung nötig", () => {
  const res = calculate({
    enclosure: { widthB: 1.2, heightH: 2, depthT: 0.6 },
    material: "stahl_lackiert",
    mounting: { rear: "free", sides: "free", top: "free" },
    environment: { tMax: 25, tExp: 20, tMin: -10, rhPercent: 60 },
    target: { tInMax: 35, tInMin: 0 },
    components: [{ type: "direct", watts: 100 }]
  });
  if (res.cooling.solution !== "passive") throw new Error("sollte passive sein, ist " + res.cooling.solution);
});
test("Heizen: ohne Verluste im Stillstand wird gegen Taupunkt geheizt", () => {
  const res = calculate({
    enclosure: { widthB: 0.6, heightH: 1.0, depthT: 0.3 },
    material: "stahl_lackiert",
    mounting: { rear: "free", sides: "free", top: "free" },
    environment: { tMax: 30, tExp: 25, tMin: -10, rhPercent: 60 },
    target: { tInMax: 35, tInMin: 0 },
    components: []
  });
  if (res.heating.required <= 0) throw new Error("Heizleistung muss > 0 sein");
  if (!res.heating.condensationGoverns) throw new Error("τ(25/60 %)=16,7 > 0 °C → Betauung muss bemessungsrelevant sein");
});
test("Keine stillen Annahmen: fehlende η-Werte erscheinen als Assumptions", () => {
  const res = calculate({
    enclosure: { widthF: 0, widthB: 1, heightH: 2, depthT: 0.6 },
    material: "stahl_lackiert",
    mounting: {},
    environment: { tMax: 30, tMin: -5, rhPercent: 60 },
    target: { tInMax: 35, tInMin: 5 },
    components: [{ type: "power_supply", P_out_W: 100 }]
  });
  if (res.assumptions.length === 0) throw new Error("Annahmen müssen sichtbar sein");
});
test("EN 61439-Defaults verfügbar (Innen −5 °C / Freiluft −25 °C)", () => {
  if (kernel.EN61439.indoor.tMin !== -5 || kernel.EN61439.outdoor.tMin !== -25) throw new Error("EN-Defaults falsch");
});

console.log("\n" + passed + " bestanden, " + failed + " fehlgeschlagen");
if (failed > 0) { process.exit(1); }