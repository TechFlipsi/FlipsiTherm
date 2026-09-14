# FlipsiTherm — Projektstatus

Stand: 14.09.2026 · J.A.R.V.I.S. · Repo: https://github.com/TechFlipsi/FlipsiTherm (ÖFFENTLICH)

## Erledigt (M1+M2+M4 im Mini-Scope, M3 verifiziert)

- **Repo angelegt & gepusht:** TechFlipsi/FlipsiTherm, öffentlich, main, Commit-Geschichte sauber
- **Rechenkern kernel.js:** Oberfläche (b-Faktoren + FISEKON-Referenzmodell), k-Werte 5 Werkstoffe,
  Kühlfall (Q, V=3,1·Q/ΔT, Lösungswahl passiv/filterfan/cooling_unit), Heizfall
  (Frost + Betauung über Magnus-tExp-Konvention, 15 % Zuschlag, P_idle-Abzug),
  6 Komponententypen (inkl. Netzfilter über ΔU — Forum-Falle abgedeckt), Lastfaktor,
  Annahmen-Transparenz (keine stillen Annahmen) — **17/17 Tests grün**
- **UI index.template.html → build.js → index.html (~100 KB Single-File):** 4-Schritt-Wizard,
  KPI-Ergebnissicht, Geräte-Empfehlung mit Herkunfts-Badge (Community/Firma/Projekt) +
  „zu verifizieren"-Warnung, Wärmetauscher-Empfehlung (W/K × ΔT), Protokoll
  (Eingaben, Flächen-Nachweis, Komponenten-Formeln, Rechnung mit Formel+Normspalte,
  Annahmen) via Druckdialog → PDF
- **i18n:** DE/EN eingebettet; data/lang/*.json per Repo-Autoload ODER lokalem Import
- **Kataloge VERIFIZIERT (11.09.2026):** 84 Geräte / 4 Hersteller (Rittal 23, Pfannenberg 23,
  nVent Hoffman 22, STEGO 16), **83/84 (99 %) status=verifiziert** mit quell_url +
  zuletzt_geprueft; 1 offen markiert (nVent CUVN21002, L35/L35 nur im Diagramm). Stichproben- Gegenprüfung durch J.A.R.V.I.S.:
  Rittal SK 3178.800 (0,3 kW L35/L35, Rittal-PDF) ✓ · STEGO 01874.0-30 (433 m³/h
  freiblasend, STEGO-Seite) ✓. Kühlgeräte mit Nennbedingung (L35/L35), Wärmetauscher
  teils in W/K (feld waermeleistung_wk, einheitlich über alle Hersteller; Umrechnung in UI). Schema-Validator
  (test/catalog.test.js, 18 Tests) in CI
- **Daten-only-Sicherheit:** nur JSON.parse-Nachladen + client-seitiger Schema-Check
  (validateCatalog) — korrupte Kataloge werden verworfen, kein eval/new Function
- **CI:** GitHub Actions — npm install, build, 17 Kernel- + 18 Katalog- + 11 UI-Tests
- **Releases:** v0.1.0, v0.1.1, v0.2.0, v0.2.1 (latest) — v0.2.1 erstmals mit Asset FlipsiTherm.html + SHA256SUMS
- **14.09.2026 Sichtbarkeit-Paket:** i18n vervollständigt (23 fehlende DE-Keys + Badge — App zeigte vorher Platzhalter), Topics bereinigt (riththal→Rittal-Fix, 18 Topics), README (Screenshot, Direkt-Download, Status v0.2.1), Site-SEO (og:image + twitter:card + Social-Banner + Direkt-Download), Discussions + Starter-Issues (#1 Katalog, #2 Validierung, #3 Custom-Device-Editor), Root-Pages (techflipsi.github.io) mit robots.txt + IndexNow-Key (Bing/Seznam 202)

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