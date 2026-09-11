/**
 * FlipsiTherm Rechenkern v0.1
 * Herstellerneutrale Schaltschrank-Klimaauslegung
 *
 * Norm-Bezug (Implementierung aus offenen Sekundärquellen, Normtexte nicht kopiert):
 *  - IEC TR 60890 (DE: DIN VDE 0660-507): Temperaturerhöhung, b-Faktoren der Oberflächen
 *  - EN 61439-1 Abschnitt 7.1: Übliche Betriebsbedingungen (Umgebungstemperaturen, Feuchte)
 *  - Taupunkt: Magnus-Formel (DIN ISO 18454-Bereich gültig für 0–60 °C, φ 1–100 %)
 *
 * Grundsatz: KEINE stillen Annahmen. Jede Annahme erscheint im Ergebnis als "assumptions".
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
    front: 0.9,               // Türen/Vorderseite, immer frei
    rear_free: 0.9,           // Rückseite frei
    rear_wall: 0.7,           // Rückseite an Wand
    side_free: 0.9,           // Seitenfläche frei
    side_wall: 0.7,           // Seitenfläche an Wand / in Anreihung
    top_free: 1.4,            // Oberseite frei umströmt
    top_covered: 0.7,         // Oberseite abgedeckt (Bühne, Kabelboden, Dach)
    bottom: 0.7               // Bodenfläche (stehend auf Boden)
  };

  /** Sicherheitszuschlag Heizleistung */
  var HEATING_RESERVE = 1.15;

  /** Luftvolumenstrom-Faktor m³·K/(W·h) bei Meereshöhe (Kehrwert ρ·cp, auf Stunde) */
  var AIR_FLOW_FACTOR = 3.1;

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

  /**
   * Taupunkt nach Magnus (Parametersatz 2, gültig über Wasser, 0…+60 °C Umgebung).
   * @returns {number} Taupunkt in °C
   */
  function dewPoint(tC, rhPercent) {
    var rh = clamp(rhPercent, 1, 100) / 100;
    var a = Math.log(rh) + (17.62 * tC) / (243.12 + tC);
    return (243.12 * a) / (17.62 - a);
  }

  /**
   * Wirksame Oberfläche nach b-Faktoren (IEC TR 60890-Muster).
   * @param {object} e enclosure {widthB, heightH, depthT} in Metern
   * @param {object} m  mounting {rear: "free"|"wall", sides: "free"|"wall", top: "free"|"covered", model: "iec60890"|"fisekon_simplified"}
   * @returns {{area: number, breakdown: object}} Fläche in m² + Nachweis je Fläche
   */
  function effectiveSurface(e, m) {
    var B = e.widthB, H = e.heightH, T = e.depthT;
    var fRear = m.rear === "wall" ? SURFACE_FACTORS.rear_wall : SURFACE_FACTORS.rear_free;
    var fSide = m.sides === "wall" ? SURFACE_FACTORS.side_wall : SURFACE_FACTORS.side_free;
    var fTop = m.top === "covered" ? SURFACE_FACTORS.top_covered : SURFACE_FACTORS.top_free;
    var parts = {
      front: { factor: SURFACE_FACTORS.front, raw: B * H, area: SURFACE_FACTORS.front * B * H },
      rear: { factor: fRear, raw: B * H, raw_note: m.rear === "wall" ? "an Wand" : "frei", area: fRear * B * H },
      sideLeft: { factor: fSide, raw: T * H, raw_note: m.sides === "wall" ? "an Wand/Anreihung" : "frei", area: fSide * T * H },
      sideRight: { factor: fSide, raw: T * H, area: fSide * T * H },
      top: { factor: fTop, raw: B * T, raw_note: m.top === "covered" ? "abgedeckt" : "frei", area: fTop * B * T },
      bottom: { factor: SURFACE_FACTORS.bottom, raw: B * T, area: SURFACE_FACTORS.bottom * B * T }
    };
    var area = 0, k;
    for (k in parts) { area += parts[k].area; }
    // FISEKON-kompatible Vereinfachung (Boden entfällt): für Golden-File-Abgleich
    if (m.model === "fisekon_simplified") { area -= parts.bottom.area; }
    return { area: round(area, 3), breakdown: parts, model: m.model || "iec60890" };
  }

  /**
   * Verlustleistung einer Komponente.
   * Typen: direct | power_supply | drive | transformer | motor | netfilter
   * @returns {{losses: number, formula: string, assumption: string|null}}
   */
  function componentLosses(c) {
    var f = c.loadFactor == null ? 1.0 : clamp(c.loadFactor, 0, 1);
    var eta, losses, formula, assumption = null;
    switch (c.type) {
      case "direct":
        return { losses: c.watts * f, formula: "P_v = " + c.watts + " W · a=" + f + " (Datenblatt · Auslastung)", assumption: null };
      case "power_supply":
        eta = c.efficiency == null ? 0.93 : c.efficiency; // typ. Netzteil, offene Fachquellen
        assumption = c.efficiency == null ? "η=0,93 angenommen (typ. Schaltnetzteil)" : null;
        // P_v = P_out · (1−η)/η · Auslastung
        return {
          losses: c.P_out_W * (1 - eta) / eta * f,
          formula: "P_v = P_out · (1−η)/η · a = " + c.P_out_W + " · (1−" + eta + ")/" + eta + " · " + f,
          assumption: assumption
        };
      case "drive":
        eta = c.efficiency == null ? 0.97 : c.efficiency; // ~3 % Verlust, r/PLC-Praxis
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
        // Forum-Falle: Verlust über Spannungsfall ΔU bei Betriebsstrom, NIEMALS U·I
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

  /** Summierte Verlustleistung aller Komponenten inkl. Herleitung je Komponente */
  function internalLosses(components) {
    var total = 0, idle = 0, details = [], assumptions = [], i, r;
    for (i = 0; i < components.length; i++) {
      r = componentLosses(components[i]);
      total += r.losses;
      details.push({ name: components[i].name || components[i].type, losses: round(r.losses, 1), formula: r.formula, assumption: r.assumption });
      if (r.assumption) { assumptions.push(components[i].name + ": " + r.assumption); }
      if (components[i].countsAtIdle) { idle += r.losses; } // z. B. Netzteile im Standby
    }
    return { total: round(total, 1), idle: round(idle, 1), details: details, assumptions: assumptions };
  }

  // ---------- Hauptberechnung ----------

  /**
   * Vollständige Klimaauslegung.
   * @param {object} input  s. docs/RECHENMETHOD.md §Eingaben
   * @returns {object} strukturiertes Ergebnis (Grundlage für UI + Protokoll)
   */
  function calculate(input) {
    var e = input.enclosure;          // {widthB, heightH, depthT} in m
    var m = input.mounting || {};     // {rear, sides, top, model}
    var env = input.environment;      // {tMax, tMin, rhPercent, altitude_m?, indoorOutdoor?}
    var tInMax = input.target.tInMax; // zulässige Innentemperatur °C
    var tInMin = input.target.tInMin; // Ziel-Innentemperatur beim Heizen °C
    var losses = internalLosses(input.components || []);
    var surf = effectiveSurface(e, m);
    var k = K_VALUES[input.material] || K_VALUES.stahl_lackiert;
    var assumptions = losses.assumptions.slice();

    if (env.altitude_m != null && env.altitude_m > 1000) {
      assumptions.push("Höhe über NN " + env.altitude_m + " m: Luftdichte-Korrektur des Volumenstroms ist v0.2 vorbehalten (Ergebnis konservativ ohne Korrektur)");
    }

    // --- Kühlung ---
    var dT_cool = tInMax - env.tMax;
    var shellDiss_cool = k * surf.area * dT_pos(dT_cool);
    var qCool = round(Math.max(0, losses.total - shellDiss_cool), 1);
    var fanPossible = dT_cool > 0;
    var airflow = fanPossible && qCool > 0 ? round(AIR_FLOW_FACTOR * qCool / dT_cool, 0) : 0;

    var solution; // Passiv | filterfan | heatexchanger | cooling_unit
    if (qCool <= 0) {
      solution = "passive";
    } else if (fanPossible) {
      solution = "filterfan"; // L/L-WTA als Alternative bei Schmutz/Öl — UI-Hinweis
    } else {
      solution = "cooling_unit";
    }

    // --- Heizung ---
    // Taupunkt-Referenz: erwartete Umgebung (tExp, φ) — FISEKON-Konvention. Der Schrank
    // kühlt im Stillstand Richtung tMin; Kondensat entsteht, wenn er unter τ(tExp, φ) fällt.
    var tExp = env.tExp == null ? 25 : env.tExp;
    if (env.tExp == null) { assumptions.push("Erwartete Umgebungstemperatur nicht angegeben: tExp=25 °C angenommen (Taupunkt-Referenz, FISEKON-Konvention)"); }
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

    return {
      meta: {
        tool: "FlipsiTherm", version: "0.1.0",
        normRefs: [
          "IEC TR 60890 (DE: DIN VDE 0660-507) — Temperaturerhöhung / b-Faktoren",
          "EN 61439-1 Abschnitt 7.1 — Übliche Betriebsbedingungen"
        ]
      },
      surface: surf,
      kValue: k,
      losses: losses,
      environment: env,
      target: input.target,
      cooling: {
        dT: round(dT_cool, 1),
        shellDissipation: round(shellDiss_cool, 1),
        qCool: qCool,
        airflow_m3h: airflow,
        fanPossible: fanPossible,
        solution: solution,
        note: solution === "cooling_unit"
          ? "Umgebung ≥ zulässige Innentemperatur: Filterlüfter/Lüftung wirkungslos, Kühlgerät erforderlich (Ein Lüfter kann nicht unter Umgebungstemperatur kühlen)."
          : (solution === "filterfan" ? "Bei starker Verschmutzung/Öl: Luft-Luft-Wärmetauscher als geschlossene Alternative zum Filterlüfter." : "Passiver Betrieb ausreichend: die Hülle führt die Verlustwärme vollständig ab.")
      },
      heating: {
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
      },
      assumptions: assumptions
    };
  }

  function dT_pos(dT) { return Math.max(dT, 0); }

  // Öffentliches API
  return {
    K_VALUES: K_VALUES,
    SURFACE_FACTORS: SURFACE_FACTORS,
    EN61439: EN61439,
    dewPoint: dewPoint,
    effectiveSurface: effectiveSurface,
    componentLosses: componentLosses,
    internalLosses: internalLosses,
    calculate: calculate
  };
});