/**
 * FlipsiTherm Rechenkern v0.2
 * Herstellerneutrale Schaltschrank-Klimaauslegung
 *
 * Norm-Bezug (Implementierung aus offenen Sekundärquellen, Normtexte nicht kopiert):
 *  - IEC TR 60890 (DE: DIN VDE 0660-507): Temperaturerhöhung, b-Faktoren der Oberflächen
 *  - EN 61439-1 Abschnitt 7.1: Übliche Betriebsbedingungen (Umgebungstemperaturen, Feuchte)
 *  - Taupunkt: Magnus-Formel (gültig 0…60 °C, φ 1–100 %)
 *
 * Grundsatz: KEINE stillen Annahmen. Jede Annahme erscheint im Ergebnis als "assumptions".
 * v0.2: Kühl- und Heizzweig UNABHÄNGIG auswertbar (nur Heizen / nur Kühlen möglich),
 * validateInput als Plausibilitäts-Gate (UI + CI), Aufstellungsvarianten erweitert
 * (Anreihung, Raumaufheizung durch benachbarte Anlagen).
 */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.FlipsiThermKernel = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------- Konstanten ----------

  /** Wärmedurchgangskoeffizienten W/(m²·K) je Werkstoff (offene Fachquellen: FISEKON, TGB) */
  var K_VALUES = {
    "stahl_lackiert": 5.5,
    "edelstahl": 3.7,
    "aluminium": 12.0,
    "polyester": 3.5,
    "doppelwand": 4.5
  };

  /** Oberflächen-b-Faktoren in Anlehnung an IEC TR 60890 (veröffentlicht u. a. bei B&R) */
  var SURFACE_FACTORS = {
    front: 0.9,
    rear_free: 0.9,
    rear_wall: 0.7,
    side_free: 0.9,
    side_wall: 0.7,
    top_free: 1.4,
    top_covered: 0.7,
    bottom: 0.7
  };

  var HEATING_RESERVE = 1.15;   // Sicherheitszuschlag Heizleistung
  var AIR_FLOW_FACTOR = 3.1;    // m³·K/(W·h) bei Meereshöhe
  var DEFAULT_RH = 60;          // % r. F. wenn nicht angegeben (Annahme wird gemeldet)
  var DEFAULT_TEXP = 25;        // °C erwartete Umgebung (Taupunkt-Referenz, FISEKON-Konvention)
  var DEFAULT_TINMIN = 5;       // °C Heizziel wenn nicht angegeben (typ. Frostschutz)

  /** EN 61439-1 / 7.1 Defaults */
  var EN61439 = {
    indoor: { tMax: 40, tMax24h: 35, tMin: -5 },
    outdoor: { tMax: 40, tMax24h: 35, tMin: -25 }
  };

  // ---------- Hilfsfunktionen ----------

  function round(x, digits) {
    var f = Math.pow(10, digits == null ? 1 : digits);
    return Math.round(x * f) / f;
  }

  function clamp(x, lo, hi) { return Math.min(Math.max(x, lo), hi); }

  /** Taupunkt nach Magnus (gültig 0…+60 °C, φ 1–100 %) */
  function dewPoint(tC, rhPercent) {
    var rh = clamp(rhPercent, 1, 100) / 100;
    var a = Math.log(rh) + (17.62 * tC) / (243.12 + tC);
    return (243.12 * a) / (17.62 - a);
  }

  /**
   * Wirksame Oberfläche nach b-Faktoren (IEC TR 60890-Muster).
   * m.sides: "free" (beide Seiten frei) | "row" (eine Seite Nachbarschrank/Anreihung) |
   *          "wall" (beide Seiten an Wand/Nische)
   * m.rear:  "free" | "wall" · m.top: "free" | "covered"
   */
  function effectiveSurface(e, m) {
    var B = e.widthB, H = e.heightH, T = e.depthT;
    var fRear = m.rear === "wall" ? SURFACE_FACTORS.rear_wall : SURFACE_FACTORS.rear_free;
    var fTop = m.top === "covered" ? SURFACE_FACTORS.top_covered : SURFACE_FACTORS.top_free;
    var fSideL, fSideR, noteSide;
    if (m.sides === "wall") { fSideL = SURFACE_FACTORS.side_wall; fSideR = SURFACE_FACTORS.side_wall; noteSide = "beide an Wand/Anreihung"; }
    else if (m.sides === "row") { fSideL = SURFACE_FACTORS.side_wall; fSideR = SURFACE_FACTORS.side_free; noteSide = "eine Seite Nachbarschrank/Wand"; }
    else { fSideL = SURFACE_FACTORS.side_free; fSideR = SURFACE_FACTORS.side_free; noteSide = "beide frei"; }
    var parts = {
      front: { factor: SURFACE_FACTORS.front, raw: B * H, area: SURFACE_FACTORS.front * B * H },
      rear: { factor: fRear, raw: B * H, raw_note: m.rear === "wall" ? "an Wand" : "frei", area: fRear * B * H },
      sideLeft: { factor: fSideL, raw: T * H, raw_note: noteSide, area: fSideL * T * H },
      sideRight: { factor: fSideR, raw: T * H, area: fSideR * T * H },
      top: { factor: fTop, raw: B * T, raw_note: m.top === "covered" ? "abgedeckt" : "frei", area: fTop * B * T },
      bottom: { factor: SURFACE_FACTORS.bottom, raw: B * T, area: SURFACE_FACTORS.bottom * B * T }
    };
    var area = 0, k;
    for (k in parts) { area += parts[k].area; }
    if (m.model === "fisekon_simplified") { area -= parts.bottom.area; }
    return { area: round(area, 3), breakdown: parts, model: m.model || "iec60890" };
  }

  /**
   * Verlustleistung einer Komponente.
   * Typen: direct | power_supply | drive | transformer | motor | netfilter
   */
  function componentLosses(c) {
    var f = c.loadFactor == null ? 1.0 : clamp(c.loadFactor, 0, 1);
    var eta, assumption = null;
    switch (c.type) {
      case "direct":
        return { losses: c.watts * f, formula: "P_v = " + c.watts + " W · a=" + f + " (Datenblatt · Auslastung)", assumption: null };
      case "power_supply":
        eta = c.efficiency == null ? 0.93 : c.efficiency;
        assumption = c.efficiency == null ? "η=0,93 angenommen (typ. Schaltnetzteil)" : null;
        return {
          losses: c.P_out_W * (1 - eta) / eta * f,
          formula: "P_v = P_out · (1−η)/η · a = " + c.P_out_W + " · (1−" + eta + ")/" + eta + " · " + f,
          assumption: assumption
        };
      case "drive":
        eta = c.efficiency == null ? 0.97 : c.efficiency;
        assumption = c.efficiency == null ? "η=0,97 für Umrichter angenommen (Forum-/Herstellertabellen)" : null;
        return {
          losses: c.P_N_W * (1 - eta) / eta * f,
          formula: "P_v = P_N · (1−η)/η · a = " + c.P_N_W + " W · (1−" + eta + ")/" + eta + " · " + f,
          assumption: assumption
        };
      case "transformer":
        eta = c.efficiency == null ? 0.95 : c.efficiency;
        assumption = c.efficiency == null ? "η=0,95 für Trafo angenommen" : null;
        return {
          losses: c.P_N_W * (1 - eta) / eta * f,
          formula: "P_v = P_N · (1−η)/η · a",
          assumption: assumption
        };
      case "motor":
        eta = c.efficiency == null ? 0.85 : c.efficiency;
        assumption = c.efficiency == null ? "η=0,85 für Motor angenommen" : null;
        return {
          losses: c.P_mech_W * (1 - eta) / eta * f,
          formula: "P_v = P_mech · (1−η)/η · a",
          assumption: assumption
        };
      case "netfilter":
        var dU = c.deltaU_V == null ? 0.5 : c.deltaU_V;
        assumption = c.deltaU_V == null ? "ΔU=0,5 V angenommen (typ. Einfügedämpfung Netzfilter)" : null;
        return {
          losses: dU * c.I_load_A * f,
          formula: "P_v = ΔU · I_b = " + dU + " V · " + c.I_load_A + " A · " + f,
          assumption: assumption
        };
      default:
        throw new Error("Unbekannter Komponententyp: " + c.type);
    }
  }

  /** Summierte Verlustleistung inkl. Stillstand-Anteil */
  function internalLosses(components) {
    var total = 0, idle = 0, details = [], assumptions = [], i, r;
    for (i = 0; i < components.length; i++) {
      r = componentLosses(components[i]);
      total += r.losses;
      details.push({ name: components[i].name || components[i].type, losses: round(r.losses, 1), formula: r.formula, assumption: r.assumption });
      if (r.assumption) { assumptions.push((components[i].name || components[i].type) + ": " + r.assumption); }
      if (components[i].countsAtIdle) { idle += r.losses; }
    }
    return { total: round(total, 1), idle: round(idle, 1), details: details, assumptions: assumptions };
  }

  // ---------- Plausibilitätsprüfung (UI-Gate + Tests) ----------

  /**
   * Prüft Eingaben auf Vollständigkeit (Pflicht je Zweig) und Plausibilität.
   * Kühlzweig: tMax + tInMax · Heizzweig: tMin (tInMin optional, Default +5 °C).
   * @returns {{errors: string[], warnings: string[], hasCooling: bool, hasHeating: bool}}
   */
  function validateInput(input) {
    var errors = [], warnings = [];
    var e = input.enclosure || {}, env = input.environment || {}, tgt = input.target || {};
    function need(cond, msg) { if (!cond) errors.push(msg); }
    function inRange(x, lo, hi) { return typeof x === "number" && isFinite(x) && x >= lo && x <= hi; }

    need(inRange(e.widthB, 0.1, 6), "Breite B muss zwischen 0,1 und 6 m liegen");
    need(inRange(e.heightH, 0.1, 4), "Höhe H muss zwischen 0,1 und 4 m liegen");
    need(inRange(e.depthT, 0.05, 3), "Tiefe T muss zwischen 0,05 und 3 m liegen");
    need(K_VALUES[input.material] != null, "Werkstoff nicht gewählt");

    var hasCooling = inRange(env.tMax, -55, 70) && inRange(tgt.tInMax, 0, 80);
    var hasHeating = inRange(env.tMin, -55, 20);
    if (!hasCooling && !hasHeating) {
      errors.push("Weder Kühl- noch Heizfall ausgefüllt: mind. maximale Umgebungstemperatur + zulässige Innentemperatur (Kühlung) ODER minimale Umgebungstemperatur (Heizung) angeben");
    }
    if (inRange(env.tMax, -55, 70) !== !!env.tMax && env.tMax != null && !inRange(env.tMax, -55, 70)) errors.push("Maximale Umgebungstemperatur unplausibel (−55…+70 °C)");
    if (env.tMax != null && !inRange(env.tMax, -55, 70)) errors.push("Maximale Umgebungstemperatur unplausibel (−55…+70 °C)");
    if (tgt.tInMax != null && !inRange(tgt.tInMax, 0, 80)) errors.push("Zulässige Innentemperatur unplausibel (0…+80 °C)");
    if (env.tMin != null && !inRange(env.tMin, -55, 20)) errors.push("Minimale Umgebungstemperatur unplausibel (−55…+20 °C)");
    if (env.rhPercent != null && !inRange(env.rhPercent, 1, 100)) errors.push("Luftfeuchte muss zwischen 1 und 100 % liegen");
    if (env.tExp != null && !inRange(env.tExp, -55, 70)) errors.push("Erwartete Umgebungstemperatur unplausibel (−55…+70 °C)");
    if (tgt.tInMin != null && !inRange(tgt.tInMin, -30, 60)) errors.push("Heizziel-Innentemperatur unplausibel (−30…+60 °C)");
    if (env.roomHeatingK != null && !inRange(env.roomHeatingK, 0, 30)) errors.push("Raumaufheizung 0…30 K");

    if (hasCooling && tgt.tInMax <= env.tMax) {
      warnings.push("Zulässige Innentemperatur ≤ maximale Umgebungstemperatur: Filterlüftung wirkungslos — es wird ein Kühlgerät bemessen (erwartetes Verhalten, falls Kühlgerät gewünscht)");
    }
    if (hasCooling && tgt.tInMax > 60) {
      warnings.push("Innentemperatur > 60 °C: nur mit Bauteilen zulässig, deren Datenblatt das hergibt (EN 61439 üblich ≤ 40 °C)");
    }
    if (hasHeating && tgt.tInMin != null && tgt.tInMin <= env.tMin) {
      warnings.push("Heizziel liegt auf/unter der minimalen Umgebungstemperatur: die Heizung hat dann keine Wirkung (ΔT ≤ 0) — Angabe prüfen");
    }
    if (env.tExp != null && env.tMax != null && env.tExp > env.tMax) {
      warnings.push("Erwartete Umgebungstemperatur ist höher als die maximale: bitte prüfen (max. sollte ≥ erwartet sein)");
    }

    (input.components || []).forEach(function (c, i) {
      var n = c.name || ("Komponente " + (i + 1));
      if (!inRange(c.loadFactor == null ? 1 : c.loadFactor, 0, 1)) errors.push(n + ": Auslastung a muss 0…1 sein");
      if (c.type === "direct" && !inRange(c.watts, 0.1, 50000)) errors.push(n + ": Verlustleistung 0,1…50 000 W angeben");
      if (c.type === "power_supply" && !inRange(c.P_out_W, 0.1, 50000)) errors.push(n + ": Ausgangsleistung 0,1…50 000 W angeben");
      if (c.type === "drive" && !inRange(c.P_N_W, 0.1, 2000000)) errors.push(n + ": Nennleistung 0,1…2 000 000 W angeben");
      if (c.type === "transformer" && !inRange(c.P_N_W, 0.1, 2000000)) errors.push(n + ": Nennleistung 0,1…2 000 000 W angeben");
      if (c.type === "motor" && !inRange(c.P_mech_W, 0.1, 2000000)) errors.push(n + ": mechanische Leistung 0,1…2 000 000 W angeben");
      if (c.type === "netfilter") {
        if (!inRange(c.I_load_A, 0.05, 2500)) errors.push(n + ": Betriebsstrom 0,05…2 500 A angeben");
        if (c.deltaU_V != null && !inRange(c.deltaU_V, 0, 5)) errors.push(n + ": ΔU 0…5 V");
      }
      if (c.efficiency != null && !inRange(c.efficiency, 0.3, 0.999)) errors.push(n + ": Wirkungsgrad 0,3…0,999");
    });

    return { errors: errors, warnings: warnings, hasCooling: hasCooling, hasHeating: hasHeating };
  }

  // ---------- Hauptberechnung ----------

  /**
   * Vollständige Klimaauslegung. Kühl- und Heizzweig unabhängig:
   * tMax+tInMax → Kühlfall · tMin → Heizfall. Raumaufheizung (roomHeatingK) addiert
   * +K auf alle Umgebungstemperaturen (Nachbarschränke/Anlagen im selben Raum).
   */
  function calculate(input) {
    var v = validateInput(input);
    if (v.errors.length) { throw new Error(v.errors[0] + (v.errors.length > 1 ? " (+ " + (v.errors.length - 1) + " weitere)" : "")); }

    var e = input.enclosure;
    var m = input.mounting || {};
    var env0 = input.environment;
    var tgt = input.target;
    var roomK = env0.roomHeatingK || 0;

    // Raumaufheizung durch benachbarte Anlagen: wirkt auf alle Umgebungstemperaturen
    var env = {
      tMax: env0.tMax != null ? round(env0.tMax + roomK, 1) : null,
      tExp: env0.tExp != null ? round(env0.tExp + roomK, 1) : null,
      tMin: env0.tMin != null ? round(env0.tMin + roomK, 1) : null,
      rhPercent: env0.rhPercent,
      roomHeatingK: roomK
    };

    var losses = internalLosses(input.components || []);
    var surf = effectiveSurface(e, m);
    var k = K_VALUES[input.material];
    var assumptions = losses.assumptions.slice();

    if (roomK) { assumptions.push("Raumaufheizung durch benachbarte Anlagen im Aufstellraum: +" + roomK + " K auf alle Umgebungstemperaturen addiert"); }
    if (env.rhPercent == null) { env.rhPercent = DEFAULT_RH; assumptions.push("Relative Luftfeuchte nicht angegeben: " + DEFAULT_RH + " % r. F. angenommen (nur relevant für den Taupunkt)"); }
    if (env.altitude_m != null && env.altitude_m > 1000) {
      assumptions.push("Höhe über NN " + env.altitude_m + " m: Luftdichte-Korrektur des Volumenstroms vorbehalten (Ergebnis konservativ ohne Korrektur)");
    }

    // --- Kühlung (optional) ---
    var cooling = null;
    if (env.tMax != null && tgt.tInMax != null) {
      var dT_cool = tgt.tInMax - env.tMax;
      var shellDiss_cool = k * surf.area * Math.max(dT_cool, 0);
      var qCool = round(Math.max(0, losses.total - shellDiss_cool), 1);
      var fanPossible = dT_cool > 0;
      var airflow = fanPossible && qCool > 0 ? round(AIR_FLOW_FACTOR * qCool / dT_cool, 0) : 0;
      var solution;
      if (qCool <= 0) { solution = "passive"; }
      else if (fanPossible) { solution = "filterfan"; }
      else { solution = "cooling_unit"; }
      cooling = {
        dT: round(dT_cool, 1),
        shellDissipation: round(shellDiss_cool, 1),
        qCool: qCool,
        airflow_m3h: airflow,
        fanPossible: fanPossible,
        solution: solution,
        note: solution === "cooling_unit"
          ? "Umgebung ≥ zulässige Innentemperatur: Filterlüftung wirkungslos, Kühlgerät erforderlich (Ein Lüfter kann nicht unter Umgebungstemperatur kühlen)."
          : (solution === "filterfan" ? "Bei starker Verschmutzung/Öl: Luft-Luft-Wärmetauscher als geschlossene Alternative zum Filterlüfter." : "Passiver Betrieb ausreichend: die Hülle führt die Verlustwärme vollständig ab.")
      };
    }

    // --- Heizung (optional) ---
    var heating = null;
    if (env.tMin != null) {
      var tInMin = tgt.tInMin == null ? DEFAULT_TINMIN : tgt.tInMin;
      var tExp = env.tExp == null ? DEFAULT_TEXP : env.tExp;
      if (env0.tExp == null) { assumptions.push("Erwartete Umgebungstemperatur nicht angegeben: tExp=" + DEFAULT_TEXP + " °C angenommen (Taupunkt-Referenz, FISEKON-Konvention)"); }
      if (tgt.tInMin == null) { assumptions.push("Heizziel-Innentemperatur nicht angegeben: " + tInMin + " °C angenommen (typ. Frostschutz-Betriebsfall)"); }
      var dewRef = dewPoint(tExp, env.rhPercent);
      var dT_heat_frost = tInMin - env.tMin;
      var dT_heat_dew = dewRef - env.tMin;
      var loss_frost = k * surf.area * Math.max(dT_heat_frost, 0);
      var loss_dew = k * surf.area * Math.max(dT_heat_dew, 0);
      var pFrost = round(Math.max(0, (loss_frost - losses.idle) * HEATING_RESERVE), 0);
      var pDew = round(Math.max(0, (loss_dew - losses.idle) * HEATING_RESERVE), 0);
      var pHeater = Math.max(pFrost, pDew);
      var condensationGoverns = pDew > pFrost;
      if (dewRef > tInMin) {
        assumptions.push("Taupunkt " + round(dewRef, 1) + " °C liegt ÜBER der Ziel-Innentemperatur " + tInMin + " °C: Heizungs-Sollwert muss mindestens auf den Taupunkt gestellt werden, sonst Betauung trotz Heizbetrieb");
      }
      heating = {
        tAmbMin: env.tMin,
        tExp: tExp,
        dewPoint: round(dewRef, 1),
        dTFrost: round(dT_heat_frost, 1),
        dTDew: round(dT_heat_dew, 1),
        lossFrost: round(loss_frost, 0),
        lossDew: round(loss_dew, 0),
        pFrost: pFrost,
        pDew: pDew,
        required: pHeater,
        condensationGoverns: condensationGoverns,
        note: condensationGoverns
          ? "Betauung ist bemessungsrelevant: Taupunkt " + round(dewRef, 1) + " °C (bei erwarteter Umgebung " + tExp + " °C / " + env.rhPercent + " % r. F.) liegt über der minimalen Umgebungstemperatur " + env.tMin + " °C. Heizung mit Hygrostat wählen."
          : "Frostschutz ist bemessungsrelevant."
      };
    }

    return {
      meta: {
        tool: "FlipsiTherm", version: "0.2.0",
        normRefs: [
          "IEC TR 60890 (DE: DIN VDE 0660-507) — Temperaturerhöhung / b-Faktoren",
          "EN 61439-1 Abschnitt 7.1 — Übliche Betriebsbedingungen"
        ]
      },
      surface: surf,
      kValue: k,
      losses: losses,
      environment: env,
      target: tgt,
      cooling: cooling,
      heating: heating,
      assumptions: assumptions,
      warnings: v.warnings
    };
  }

  // Öffentliches API
  return {
    K_VALUES: K_VALUES,
    SURFACE_FACTORS: SURFACE_FACTORS,
    EN61439: EN61439,
    dewPoint: dewPoint,
    effectiveSurface: effectiveSurface,
    componentLosses: componentLosses,
    internalLosses: internalLosses,
    validateInput: validateInput,
    calculate: calculate
  };
});