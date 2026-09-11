# FlipsiTherm — Rechenmethodik

**Grundsatz:** FlipsiTherm kopiert keine Normtexte (Urheberrecht). Implementiert wird die
Methode aus offenen Sekundärquellen (veröffentlichte Rechner-Dokumentationen,
Hersteller-Applikationsunterlagen, Fachliteratur). Jede Ergebniszeile im Protokoll nennt
Formel + Quelle. Normtexte von IEC/DIN/VDE dürfen nicht zitiert-vervielfältigt werden —
dieses Dokument referenziert sie nur.

## 1. Wirksame Oberfläche

Nach dem b-Faktoren-Muster der IEC TR 60890 (veröffentlicht u. a. in B&R-Temperaturanleitung
und FISEKON-Doku). Je Fläche: `A_i = b_i · A_roh`, Gesamt: Summe.

| Fläche | b-Faktor frei | b-Faktor behindert |
|---|---|---|
| Front (Türen) | 0,9 | 0,9 (immer frei) |
| Rückseite | 0,9 | 0,7 (Wand) |
| Seiten (je) | 0,9 | 0,7 (Wand/Anreihung) |
| Oberseite | 1,4 (frei umströmt) | 0,7 (abgedeckt) |
| Boden | 0,7 | 0,7 |

FISEKON-Vereinfachung (Referenzmodell für Golden-Files): `A = 1,8·H·(B+T) + 1,4·B·T`
(Boden entfällt). FlipsiTherm unterstützt beide Modelle; Standard ist das
b-Faktoren-Modell, `model: "fisekon_simplified"` für Vergleichsrechnungen.

## 2. Wärmedurchgang k (W/(m²·K))

Werkstoffwerte aus offenen Fachquellen (FISEKON, TGB-Applikationsseite):
lack. Stahlblech 5,5 · Edelstahl 3,7 · Aluminium 12,0 · Polyester 3,5 · Doppelwand 4,5.

## 3. Kühlfall

```
ΔT        = T_zul,innen − T_umgebung,max
Hüllabgabe= k · A_eff · ΔT                  (nur wenn ΔT > 0)
Q_Kühl    = max(0, P_verluste − Hüllabgabe)
V_Luft    = 3,1 · Q_Kühl / ΔT   [m³/h]      (3,1 m³·K/(W·h), Meereshöhe; NN>1000 m: v0.2)
```

Lösungswahl:
- `Q_Kühl ≤ 0` → Passivbetrieb
- `0 < Q_Kühl` und `ΔT > 0` → Filterlüfter (Hinweis: L/L-Wärmetauscher bei Schmutz/Öl)
- `ΔT ≤ 0` → Kühlgerät (ein Lüfter kann nicht unter Umgebungstemperatur kühlen)

## 4. Heizfall (zwei Bemessungsfälle, der größere gewinnt)

Referenzen: τ = Taupunkt nach **Magnus** (gültig 0…+60 °C, φ 1–100 %) bei **erwarteter**
Umgebung (tExp, φ) — Konvention wie FISEKON. P_idle = Verluste von im Stillstand
aktiven Komponenten (z. B. Netzteile).

```
Frostschutz:  P_V = (k·A_eff·(T_ziel,heizen − T_min) − P_idle) · 1,15
Betauung:     P_V = (k·A_eff·(τ(tExp, φ) − T_min) − P_idle) · 1,15
Heizleistung  = max(beide Fälle)
```

15 % = Resezuschlag (Praxis-Konvention, auch TGB-Rechner). Hinweis-Logik: Liegt τ
über T_ziel,heizen, warnt das Protokoll, dass der Hygrostat-Sollwert mindestens τ
betragen muss (sonst Betauung trotz Heizbetrieb).

## 5. Komponenten-Verlustmodelle

| Typ | Formel | Default (offen, mit Annahme-Meldung) |
|---|---|---|
| direct | P_v = Datenblatt · a | — |
| Netzteil | P_v = P_out·(1−η)/η·a | η=0,93 |
| Umrichter | P_v = P_N·(1−η)/η·a | η=0,97 (≈3 %, r/PLC+CAD.de-Praxis) |
| Trafo | P_v = P_N·(1−η)/η·a | η=0,95 |
| Motor | P_v = P_mech·(1−η)/η·a | η=0,85 |
| Netzfilter | **P_v = ΔU·I_b** (NIEMALS U·I — Spannungsfall!) | ΔU=0,5 V |

`a` = Auslastungs-/Gleichzeitigkeitsfaktor (0…1), Forum-Forderung aus CAD.de-Thread.

## 6. EN 61439-1 / 7.1 Defaults

Innenraum: max +40 °C, 24h-Mittel +35 °C, min −5 °C · Freiluft: max +40 °C,
24h-Mittel +35 °C, min −25 °C · Feuchte: innen ≤50 % bei +40 °C (z. B. 90 % bei +20 °C),
außen vorübergehend 100 % bei +25 °C. Als Presets in der UI.

## 7. Gültigkeitsgrenzen (ehrlich benannt)

- Stationäre Betrachtung, keine Strömungssimulation (Positionierung der Geräte im
  Luftstrom = Checklistenausgabe im Protokoll, Phase 2)
- Filterlüfter-Auswahl nach freiblasendem Volumenstrom; Gegendruck durch Filtermatte/
  Einbauten muss beim Gerät gewählt werden (Protokoll-Hinweis)
- Keine Sonneneinstrahlung (Outdoor) in v0.1 — Phase 2
- Keine Anreihung mit Wärmebrücken in v0.1 — Phase 3