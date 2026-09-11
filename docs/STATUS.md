# FlipsiTherm — Projektstatus

Stand: 11.09.2026 · J.A.R.V.I.S. · Repo: https://github.com/TechFlipsi/FlipsiTherm (ÖFFENTLICH)

## Erledigt (M1+M2+M4 im Mini-Scope, M3 als Ausbaustufen)

- **Repo angelegt & gepusht:** TechFlipsi/FlipsiTherm, öffentlich, main, Commit-Geschichte sauber
- **Rechenkern kernel.js:** Oberfläche (b-Faktoren + FISEKON-Referenzmodell), k-Werte 5 Werkstoffe,
  Kühlfall (Q, V=3,1·Q/ΔT, Lösungswahl passiv/filterfan/cooling_unit), Heizfall
  (Frost + Betauung über Magnus-tExp-Konvention, 15 % Zuschlag, P_idle-Abzug),
  6 Komponententypen (inkl. Netzfilter über ΔU — Forum-Falle abgedeckt), Lastfaktor,
  Annahmen-Transparenz (keine stillen Annahmen) — **17/17 Tests grün**
- **UI index.template.html → build.js → index.html (52 KB Single-File):** 4-Schritt-Wizard,
  KPI-Ergebnissicht, Geräte-Empfehlung mit Herkunfts-Badge (Community/Firma/Projekt) +
  „zu verifizieren"-Warnung, Protokoll (Eingaben, Flächen-Nachweis, Komponenten-Formeln,
  Rechnung mit Formel+Normspalte, Annahmen) via Druckdialog → PDF
- **i18n:** DE/EN eingebettet; data/lang/*.json per Repo-Autoload ODER lokalem Import;
  index.json als Registry
- **Kataloge:** Rittal/STEGO/Pfannenberg/nVent-Hoffman, Ausbaustufen-Typen, ALLE markiert
  `status: "zu_verifizieren"` (ehrlich!), Stand-Badge online/offline
- **Daten-only-Sicherheit:** nur JSON.parse-Nachladen, kein eval/new Function; SHA-256-Konzept
  im Plan §6.1 (Umsetzung v0.2)
- **CI:** GitHub Actions — npm install, build, 17 Kernel- + 11 UI-Tests → **erster Run: success**
- **Release v0.1.0** live: https://github.com/TechFlipsi/FlipsiTherm/releases/tag/v0.1.0
- UI-Endtest läuft in jsdom (echter Chromium-Endtest hier nicht möglich: Browser-Binary fehlt
  auf Kibot — Chrome 127, chromium binary not found; jsdom-Test deckt Wizard/Ergebnis/
  Protokoll/Print/Save ab)

## Offen für v0.2+ (Plan §3)

- **KATALOG-VERIFIKATION (wichtigster Punkt):** Alle Ausbaustufen gegen echte
  Herstellerkataloge prüfen (Artikelnummern, exakte Leistungen, Kennlinien)
- Golden-File-Validierungsbericht (15–30 veröffentlichte Beispielrechnungen, ±5–10 %)
- SHA-256-Prüfsummenprüfung der Kataloge in der App
- Custom-Device-Editor UI (aktuell: Custom-Devices nur über Projektdatei/Firmenkatalog-JSON)
- Höhenkorrektur, Outdoor/Sonnenlast, Busbar-Verluste, EPLAN-Import (Phase 2/3)
- DE/AT-Schalter (aktuell nur nötig für Protokoll-Beschriftung — EN harmonisiert, s. Plan §2a)

## Ehrlichkeits-Vermerk

Die Katalogdaten sind PLATZHALTER mit Status-Flag — bewusst nicht als verifiziert ausgegeben.
Vor ernsthafter Auslegung: Kataloge gegen Herstellerdaten verifizieren (Issue #1 vorgesehen).