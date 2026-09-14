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
  /**
   * Sprach-Tag des Kernels: "de" | "en". Die UI setzt ihn via setKernelLang()
   * (bzw. state.lang-Prop beim Boot). Alle Nutzer-Meldungen (Fehler, Warnungen,
   * Annahmen, Notizen) folgen dieser Sprache.
   */
  var kernelLang = "de";
  function setKernelLang(l) { kernelLang = (l === "en") ? "en" : "de"; }
  function getKernelLang() { return kernelLang; }

  /** Zweitsprachige Meldungen des Rechenkerns */
  var MSG = {
    width_range: { de: "Breite B muss zwischen 0,1 und 6 m liegen", en: "Width B must be between 0.1 and 6 m" },
    height_range: { de: "Höhe H muss zwischen 0,1 und 4 m liegen", en: "Height H must be between 0.1 and 4 m" },
    depth_range: { de: "Tiefe T muss zwischen 0,05 und 3 m liegen", en: "Depth T must be between 0.05 and 3 m" },
    material_missing: { de: "Werkstoff nicht gewählt", en: "Material not selected" },
    no_case: { de: "Weder Kühl- noch Heizfall ausgefüllt: mind. maximale Umgebungstemperatur + zulässige Innentemperatur (Kühlung) ODER minimale Umgebungstemperatur (Heizung) angeben", en: "Neither cooling nor heating case filled in: provide at least maximum ambient temperature + permissible interior temperature (cooling) OR minimum ambient temperature (heating)" },
    tmax_implausible: { de: "Maximale Umgebungstemperatur unplausibel (−55…+70 °C)", en: "Maximum ambient temperature implausible (−55…+70 °C)" },
    tinmax_implausible: { de: "Zulässige Innentemperatur unplausibel (0…+80 °C)", en: "Permissible interior temperature implausible (0…+80 °C)" },
    tmin_implausible: { de: "Minimale Umgebungstemperatur unplausibel (−55…+20 °C)", en: "Minimum ambient temperature implausible (−55…+20 °C)" },
    rh_implausible: { de: "Luftfeuchte muss zwischen 1 und 100 % liegen", en: "Humidity must be between 1 and 100 %" },
    texp_implausible: { de: "Erwartete Umgebungstemperatur unplausibel (−55…+70 °C)", en: "Expected ambient temperature implausible (−55…+70 °C)" },
    tinmin_implausible: { de: "Heizziel-Innentemperatur unplausibel (−30…+60 °C)", en: "Heating-target interior temperature implausible (−30…+60 °C)" },
    roomheating_range: { de: "Raumaufheizung 0…30 K", en: "Room heating 0…30 K" },
    warn_filterfan_useless: { de: "Zulässige Innentemperatur ≤ maximale Umgebungstemperatur: Filterlüftung wirkungslos — es wird ein Kühlgerät bemessen (erwartetes Verhalten, falls Kühlgerät gewünscht)", en: "Permissible interior temperature ≤ maximum ambient temperature: filter ventilation ineffective — a cooling unit is sized (expected behaviour if a cooling unit is desired)" },
    warn_tinmax60: { de: "Innentemperatur > 60 °C: nur mit Bauteilen zulässig, deren Datenblatt das hergibt (EN 61439 üblich ≤ 40 °C)", en: "Interior temperature > 60 °C: only permitted with components whose datasheet allows it (EN 61439 typically ≤ 40 °C)" },
    warn_heating_no_effect: { de: "Heizziel liegt auf/unter der minimalen Umgebungstemperatur: die Heizung hat dann keine Wirkung (ΔT ≤ 0) — Angabe prüfen", en: "Heating target at/below minimum ambient temperature: the heater then has no effect (ΔT ≤ 0) — check the input" },
    warn_texp_gt_tmax: { de: "Erwartete Umgebungstemperatur ist höher als die maximale: bitte prüfen (max. sollte ≥ erwartet sein)", en: "Expected ambient temperature is higher than the maximum: please check (max should be ≥ expected)" },
    load_factor_range: { de: "Auslastung a muss 0…1 sein", en: "Load factor a must be 0…1" },
    watts_range: { de: "Verlustleistung 0,1…50 000 W angeben", en: "Power dissipation 0.1…50 000 W required" },
    pout_range: { de: "Ausgangsleistung 0,1…50 000 W angeben", en: "Output power 0.1…50 000 W required" },
    pn_range: { de: "Nennleistung 0,1…2 000 000 W angeben", en: "Rated power 0.1…2 000 000 W required" },
    pmech_range: { de: "mechanische Leistung 0,1…2 000 000 W angeben", en: "mechanical power 0.1…2 000 000 W required" },
    iload_range: { de: "Betriebsstrom 0,05…2 500 A angeben", en: "Operating current 0.05…2 500 A required" },
    du_range: { de: "ΔU 0…5 V", en: "ΔU 0…5 V" },
    efficiency_range: { de: "Wirkungsgrad 0,3…0,999", en: "Efficiency 0.3…0.999" },
    comp_n: { de: "Komponente {n}", en: "Component {n}" },
    more_errors: { de: " (+ {n} weitere)", en: " (+ {n} more)" },
    eta_ps: { de: "η=0,93 angenommen (typ. Schaltnetzteil)", en: "η=0.93 assumed (typical SMPS)" },
    eta_drive: { de: "η=0,97 für Umrichter angenommen (Forum-/Herstellertabellen)", en: "η=0.97 assumed for drives (forum/manufacturer tables)" },
    eta_trafo: { de: "η=0,95 für Trafo angenommen", en: "η=0.95 assumed for transformers" },
    eta_motor: { de: "η=0,85 für Motor angenommen", en: "η=0.85 assumed for motors" },
    eta_du: { de: "ΔU=0,5 V angenommen (typ. Einfügedämpfung Netzfilter)", en: "ΔU=0.5 V assumed (typical line-filter insertion attenuation)" },
    unknown_comp: { de: "Unbekannter Komponententyp: {t}", en: "Unknown component type: {t}" },
    room_heating: { de: "Raumaufheizung durch benachbarte Anlagen im Aufstellraum: +{k} K auf alle Umgebungstemperaturen addiert", en: "Room heating from adjacent equipment in the installation room: +{k} K added to all ambient temperatures" },
    rh_default: { de: "Relative Luftfeuchte nicht angegeben: {rh} % r. F. angenommen (nur relevant für den Taupunkt)", en: "Relative humidity not specified: {rh} % r. h. assumed (only relevant for the dew point)" },
    altitude: { de: "Höhe über NN {alt} m: Luftdichte-Korrektur des Volumenstroms vorbehalten (Ergebnis konservativ ohne Korrektur)", en: "Altitude {alt} m: air-density correction of the volume flow reserved (result conservative without correction)" },
    texp_default: { de: "Erwartete Umgebungstemperatur nicht angegeben: tExp={v} °C angenommen (Taupunkt-Referenz, FISEKON-Konvention)", en: "Expected ambient temperature not specified: tExp={v} °C assumed (dew-point reference, FISEKON convention)" },
    tinmin_default: { de: "Heizziel-Innentemperatur nicht angegeben: {v} °C angenommen (typ. Frostschutz-Betriebsfall)", en: "Heating-target interior temperature not specified: {v} °C assumed (typical frost-protection case)" },
    dew_over_target: { de: "Taupunkt {d} °C liegt ÜBER der Ziel-Innentemperatur {t} °C: Heizungs-Sollwert muss mindestens auf den Taupunkt gestellt werden, sonst Betauung trotz Heizbetrieb", en: "Dew point {d} °C is ABOVE the target interior temperature {t} °C: the heater setpoint must be set to at least the dew point, otherwise condensation despite heating" },
    note_cooling_unit: { de: "Umgebung ≥ zulässige Innentemperatur: Filterlüftung wirkungslos, Kühlgerät erforderlich (Ein Lüfter kann nicht unter Umgebungstemperatur kühlen).", en: "Ambient ≥ permissible interior temperature: filter ventilation ineffective, cooling unit required (a fan cannot cool below ambient temperature)." },
    note_filterfan: { de: "Bei starker Verschmutzung/Öl: Luft-Luft-Wärmetauscher als geschlossene Alternative zum Filterlüfter.", en: "With heavy dust/oil: air/air heat exchanger as a closed alternative to the filter fan." },
    note_passive: { de: "Passiver Betrieb ausreichend: die Hülle führt die Verlustwärme vollständig ab.", en: "Passive operation sufficient: the enclosure fully dissipates the loss heat." },
    note_condensation: { de: "Betauung ist bemessungsrelevant: Taupunkt {d} °C (bei erwarteter Umgebung {e} °C / {rh} % r. F.) liegt über der minimalen Umgebungstemperatur {m} °C. Heizung mit Hygrostat wählen.", en: "Condensation governs the design: dew point {d} °C (at expected ambient {e} °C / {rh} % r. h.) is above the minimum ambient temperature {m} °C. Choose a heater with hygrostat." },
    note_frost: { de: "Frostschutz ist bemessungsrelevant.", en: "Frost protection governs the design." },
    side_both_wall: { de: "beide an Wand/Anreihung", en: "both at wall/baying" },
    side_one_wall: { de: "eine Seite Nachbarschrank/Wand", en: "one side neighbour cabinet/wall" },
    side_free: { de: "beide frei", en: "both free" },
    rear_wall: { de: "an Wand", en: "at wall" },
    rear_free: { de: "frei", en: "free" },
    top_covered: { de: "abgedeckt", en: "covered" },
    top_free: { de: "frei", en: "free" },
    norm1: { de: "IEC TR 60890 (DE: DIN VDE 0660-507) — Temperaturerhöhung / b-Faktoren", en: "IEC TR 60890 (DE: DIN VDE 0660-507) — temperature rise / b-factors" },
    norm2: { de: "EN 61439-1 Abschnitt 7.1 — Übliche Betriebsbedingungen", en: "EN 61439-1 section 7.1 — ordinary operating conditions" },
    warn_tinmin_gt_tinmax: { de: "Heizziel-Innentemperatur ist HÖHER als die zulässige Innentemperatur — Werte prüfen (untypisch)", en: "Heating-target interior temperature is HIGHER than the permissible interior temperature — check values (atypical)" },
    warn_tmin_gt_tmax: { de: "Minimale Umgebungstemperatur ist HÖHER als die maximale — Werte vertauscht?", en: "Minimum ambient temperature is HIGHER than the maximum — values swapped?" },
    note_no_heating: { de: "Keine Heizleistung erforderlich: die Hülle deckt den Bedarf ab bzw. das Heizziel liegt auf/unter der Umgebungstemperatur.", en: "No heating power required: the shell covers the demand, or the heating target is at/below ambient temperature." },
    warn_magnus_range: { de: "Taupunkt-Formel (Magnus) außerhalb der Gültigkeit (0…60 °C): tExp={v} °C — Ergebnis nur näherungsweise.", en: "Dew-point formula (Magnus) outside its validity range (0…60 °C): tExp={v} °C — result is approximate only." }
  };
  function tr(key, vars) {
    var s = MSG[key] ? MSG[key][kernelLang] : key;
    if (vars) for (var k in vars) s = s.replace("{" + k + "}", vars[k]);
    return s;
  }

  var AIR_FLOW_FACTOR = 3.1;    // m³·K/(W·h) at sea level
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
    if (m.sides === "wall") { fSideL = SURFACE_FACTORS.side_wall; fSideR = SURFACE_FACTORS.side_wall; noteSide = tr("side_both_wall"); }
    else if (m.sides === "row") { fSideL = SURFACE_FACTORS.side_wall; fSideR = SURFACE_FACTORS.side_free; noteSide = tr("side_one_wall"); }
    else { fSideL = SURFACE_FACTORS.side_free; fSideR = SURFACE_FACTORS.side_free; noteSide = tr("side_free"); }
    var parts = {
      front: { factor: SURFACE_FACTORS.front, raw: B * H, area: SURFACE_FACTORS.front * B * H },
      rear: { factor: fRear, raw: B * H, raw_note: m.rear === "wall" ? tr("rear_wall") : tr("rear_free"), area: fRear * B * H },
      sideLeft: { factor: fSideL, raw: T * H, raw_note: noteSide, area: fSideL * T * H },
      sideRight: { factor: fSideR, raw: T * H, area: fSideR * T * H },
      top: { factor: fTop, raw: B * T, raw_note: m.top === "covered" ? tr("top_covered") : tr("top_free"), area: fTop * B * T },
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
        return { losses: c.watts * f, formula: "P_v = " + c.watts + " W · a=" + f + (kernelLang === "en" ? " (datasheet · load)" : " (Datenblatt · Auslastung)"), assumption: null };
      case "power_supply":
        eta = c.efficiency == null ? 0.93 : c.efficiency;
        assumption = c.efficiency == null ? tr("eta_ps") : null;
        return {
          losses: c.P_out_W * (1 - eta) / eta * f,
          formula: "P_v = P_out · (1−η)/η · a = " + c.P_out_W + " · (1−" + eta + ")/" + eta + " · " + f,
          assumption: assumption
        };
      case "drive":
        eta = c.efficiency == null ? 0.97 : c.efficiency;
        assumption = c.efficiency == null ? tr("eta_drive") : null;
        return {
          losses: c.P_N_W * (1 - eta) / eta * f,
          formula: "P_v = P_N · (1−η)/η · a = " + c.P_N_W + " W · (1−" + eta + ")/" + eta + " · " + f,
          assumption: assumption
        };
      case "transformer":
        eta = c.efficiency == null ? 0.95 : c.efficiency;
        assumption = c.efficiency == null ? tr("eta_trafo") : null;
        return {
          losses: c.P_N_W * (1 - eta) / eta * f,
          formula: "P_v = P_N · (1−η)/η · a",
          assumption: assumption
        };
      case "motor":
        eta = c.efficiency == null ? 0.85 : c.efficiency;
        assumption = c.efficiency == null ? tr("eta_motor") : null;
        return {
          losses: c.P_mech_W * (1 - eta) / eta * f,
          formula: "P_v = P_mech · (1−η)/η · a",
          assumption: assumption
        };
      case "netfilter":
        var dU = c.deltaU_V == null ? 0.5 : c.deltaU_V;
        assumption = c.deltaU_V == null ? tr("eta_du") : null;
        return {
          losses: dU * c.I_load_A * f,
          formula: "P_v = ΔU · I_b = " + dU + " V · " + c.I_load_A + " A · " + f,
          assumption: assumption
        };
      default:
        throw new Error(tr("unknown_comp", {t: c.type}));
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

    need(inRange(e.widthB, 0.1, 6), tr("width_range"));
    need(inRange(e.heightH, 0.1, 4), tr("height_range"));
    need(inRange(e.depthT, 0.05, 3), tr("depth_range"));
    need(K_VALUES[input.material] != null, tr("material_missing"));

    var hasCooling = env.tMax != null && inRange(env.tMax, -55, 70) && tgt.tInMax != null && inRange(tgt.tInMax, 0, 80);
    var hasHeating = env.tMin != null && inRange(env.tMin, -55, 20);
    if (!hasCooling && !hasHeating) {
      errors.push(tr("no_case"));
    }
    if (env.tMax != null && !inRange(env.tMax, -55, 70)) errors.push(tr("tmax_implausible"));
    if (tgt.tInMax != null && !inRange(tgt.tInMax, 0, 80)) errors.push(tr("tinmax_implausible"));
    if (env.tMin != null && !inRange(env.tMin, -55, 20)) errors.push(tr("tmin_implausible"));
    if (env.rhPercent != null && !inRange(env.rhPercent, 1, 100)) errors.push(tr("rh_implausible"));
    if (env.tExp != null && !inRange(env.tExp, -55, 70)) errors.push(tr("texp_implausible"));
    if (tgt.tInMin != null && !inRange(tgt.tInMin, -30, 60)) errors.push(tr("tinmin_implausible"));
    if (env.roomHeatingK != null && !inRange(env.roomHeatingK, 0, 30)) errors.push(tr("roomheating_range"));

    if (hasCooling && tgt.tInMax <= env.tMax) {
      warnings.push(tr("warn_filterfan_useless"));
    }
    if (hasCooling && tgt.tInMax > 60) {
      warnings.push(tr("warn_tinmax60"));
    }
    if (hasHeating && tgt.tInMin != null && tgt.tInMin <= env.tMin) {
      warnings.push(tr("warn_heating_no_effect"));
    }
    if (env.tExp != null && env.tMax != null && env.tExp > env.tMax) {
      warnings.push(tr("warn_texp_gt_tmax"));
    }
    if (tgt.tInMin != null && tgt.tInMax != null && tgt.tInMin > tgt.tInMax) {
      warnings.push(tr("warn_tinmin_gt_tinmax"));
    }
    if (env.tMin != null && env.tMax != null && env.tMin > env.tMax) {
      warnings.push(tr("warn_tmin_gt_tmax"));
    }

    (input.components || []).forEach(function (c, i) {
      var n = c.name || tr("comp_n", {n: i + 1});
      if (!inRange(c.loadFactor == null ? 1 : c.loadFactor, 0, 1)) errors.push(n + ": " + tr("load_factor_range"));
      if (c.type === "direct" && !inRange(c.watts, 0.1, 50000)) errors.push(n + ": " + tr("watts_range"));
      if (c.type === "power_supply" && !inRange(c.P_out_W, 0.1, 50000)) errors.push(n + ": " + tr("pout_range"));
      if (c.type === "drive" && !inRange(c.P_N_W, 0.1, 2000000)) errors.push(n + ": " + tr("pn_range"));
      if (c.type === "transformer" && !inRange(c.P_N_W, 0.1, 2000000)) errors.push(n + ": " + tr("pn_range"));
      if (c.type === "motor" && !inRange(c.P_mech_W, 0.1, 2000000)) errors.push(n + ": " + tr("pmech_range"));
      if (c.type === "netfilter") {
        if (!inRange(c.I_load_A, 0.05, 2500)) errors.push(n + ": " + tr("iload_range"));
        if (c.deltaU_V != null && !inRange(c.deltaU_V, 0, 5)) errors.push(n + ": " + tr("du_range"));
      }
      if (c.efficiency != null && !inRange(c.efficiency, 0.3, 0.999)) errors.push(n + ": " + tr("efficiency_range"));
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
    if (v.errors.length) { throw new Error(v.errors[0] + (v.errors.length > 1 ? tr("more_errors", {n: v.errors.length - 1}) : "")); }

    var e = input.enclosure;
    var m = input.mounting || {};
    var env0 = input.environment;
    var tgt = input.target || {};
    var roomK = env0.roomHeatingK || 0;

    // Raumaufheizung durch benachbarte Anlagen: wirkt auf alle Umgebungstemperaturen
    var env = {
      tMax: env0.tMax != null ? round(env0.tMax + roomK, 1) : null,
      tExp: env0.tExp != null ? round(env0.tExp + roomK, 1) : null,
      tMin: env0.tMin != null ? round(env0.tMin + roomK, 1) : null,
      rhPercent: env0.rhPercent,
      roomHeatingK: roomK,
      altitude_m: env0.altitude_m
    };

    var losses = internalLosses(input.components || []);
    var surf = effectiveSurface(e, m);
    var k = K_VALUES[input.material];
    var assumptions = losses.assumptions.slice();

    if (roomK) { assumptions.push(tr("room_heating", {k: roomK})); }
    if (env.rhPercent == null) { env.rhPercent = DEFAULT_RH; assumptions.push(tr("rh_default", {rh: DEFAULT_RH})); }
    if (env.altitude_m != null && env.altitude_m > 1000) {
      assumptions.push(tr("altitude", {alt: env.altitude_m}));
    }

    // --- Kühlung (optional) — Zweig nur, wenn Kühl-Eingaben vollständig angegeben ---
    var cooling = null;
    if (v.hasCooling) {
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
          ? tr("note_cooling_unit")
          : (solution === "filterfan" ? tr("note_filterfan") : tr("note_passive"))
      };
    }

    // --- Heizung (optional) — Zweig nur, wenn Heiz-Eingabe angegeben ---
    var heating = null;
    if (v.hasHeating) {
      var tInMin = tgt.tInMin == null ? DEFAULT_TINMIN : tgt.tInMin;
      var tExp = env.tExp == null ? DEFAULT_TEXP : env.tExp;
      if (env0.tExp == null) { assumptions.push(tr("texp_default", {v: DEFAULT_TEXP})); }
      if (tgt.tInMin == null) { assumptions.push(tr("tinmin_default", {v: tInMin})); }
      var dewRef = dewPoint(tExp, env.rhPercent);
      if (tExp < 0 || tExp > 60) { assumptions.push(tr("warn_magnus_range", {v: tExp})); }
      var dT_heat_frost = tInMin - env.tMin;
      var dT_heat_dew = dewRef - env.tMin;
      var loss_frost = k * surf.area * Math.max(dT_heat_frost, 0);
      var loss_dew = k * surf.area * Math.max(dT_heat_dew, 0);
      var pFrost = round(Math.max(0, (loss_frost - losses.idle) * HEATING_RESERVE), 0);
      var pDew = round(Math.max(0, (loss_dew - losses.idle) * HEATING_RESERVE), 0);
      var pHeater = Math.max(pFrost, pDew);
      var condensationGoverns = pDew > pFrost;
      if (dewRef > tInMin) {
        assumptions.push(tr("dew_over_target", {d: round(dewRef, 1), t: tInMin}));
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
        note: pHeater <= 0
          ? tr("note_no_heating")
          : (condensationGoverns
          ? tr("note_condensation", {d: round(dewRef, 1), e: tExp, rh: env.rhPercent, m: env.tMin})
          : tr("note_frost"))
      };
    }

    return {
      meta: {
        tool: "FlipsiTherm", version: "0.2.4",
        normRefs: [
          tr("norm1"), tr("norm2")
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
    setKernelLang: setKernelLang,
    getKernelLang: getKernelLang,
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