# FlipsiTherm

**Herstellerneutrale Schaltschrank-Klimaauslegung — offline, ohne Installation, ohne Login.**

FlipsiTherm berechnet, welche **Heiz- und Kühlleistung** ein Schaltschrank benötigt
(Taupunkt/Betauung, Frostschutz, Innentemperatur-Ziel), leitet daraus den nötigen
**Volumenstrom** für Filterlüfter ab und empfiehlt den **Lösungstyp** (Passiv /
Filterlüfter / Luft-Luft-Wärmetauscher / Kühlgerät) — inkl. normbezogenem Auslegungsprotokoll.

## Warum dieses Tool?

Die großen Herstellertools (Rittal RiTherm, Pfannenberg PSS, Schneider ProClima) sind
Cloud-gebunden, login-pflichtig und empfehlen nur Eigenprodukte. FlipsiTherm ist:

- **Offline-first:** Eine einzige HTML-Datei. Doppelklicken → läuft. Kein Setup, kein
  Admin, keine EXE — funktioniert auch auf gesperrten Firmen-PCs.
- **Herstellerneutral:** Der Rechenkern kennt keine Marke. Geräteempfehlungen kommen
  aus einer offenen Katalog-Datenbank über alle Hersteller hinweg.
- **Offene Rechnung:** Jede Zahl im Protokoll ist nachvollziehbar — Formel + Norm-Bezug
  sichtbar. Keine Blackbox.
- **Norm-Referenz:** IEC TR 60890 (Temperaturerhöhung, in DE als DIN VDE 0660-507
  geführt) und DIN EN/ÖVE ÖNORM EN 61439-1/-2 (Betriebsbedingungen, Abschnitt 7.1).
- **Sicher:** Es wird niemals Code nachgeladen — nur Daten (JSON, Kataloge, Sprachen).
  Manipulierte Daten werden per SHA-256-Prüfsumme erkannt und verworfen.

## Benutzung

1. `FlipsiTherm.html` herunterladen (oder aus [Releases](../../releases) nehmen)
2. Doppelklicken — öffnet sich im Browser, fertig.
3. Projektdaten als JSON speichern/laden, Bericht über den Druckdialog als PDF
   („Microsoft Print to PDF" ist ab Windows 10 vorinstalliert).

Ohne Internet läuft alles mit dem eingebetteten Katalog-Snapshot. Mit Internet werden
Kataloge und Sprachen automatisch aktuell geladen.

## Gerätedatenbank (3 Schichten)

| Schicht | Wo | Wer | Auf GitHub? |
|---|---|---|---|
| Community-Katalog | `data/catalogs/*.json` (dieses Repo) | Projekt/Community per PR | ja |
| Firmen-Katalog | eigenes JSON auf Firmennetzlaufwerk | die Firma, nie öffentlich | nein |
| Projekt-Geräte | im Projektfile des Nutzers | Einzelnutzer | nein |

Es existiert **kein Upload-Weg** für Schicht 2/3 — Kundengeräte bleiben firmenintern.
Lokale Einträge überschreiben zentrale bei Namens-Kollision (Schicht 3 > 2 > 1).

## Sprachen

Deutsch + Englisch sind eingebettet. Weitere Sprachen: `data/lang/*.json` per
Pull Request ergänzen — die App lädt sie beim Start automatisch. Oder lokal über den
Sprach-Import-Dialog (ohne GitHub).

## Berechnungsmethode (offen dokumentiert)

Alle Formeln stehen in [`docs/RECHENMETHOD.md`](docs/RECHENMETHOD.md) und werden zusätzlich
im Protokoll je Ergebniszeile ausgewiesen (Formel + Quelle). Grundmodell:

- Wirksame Oberfläche nach b-Faktoren (in Anlehnung an IEC TR 60890, wie von
  FISEKON/ZPAS veröffentlicht): `A = 1,8·H·(B+T) + 1,4·B·T` freistehend
- Hüllverlust: `Q = k·A·ΔT` (k: Stahlblech 5,5 / Edelstahl 3,7 / Alu 12 / Polyester 3,5)
- Heizbedarf: gegen unterschreiten der Ziel-Innentemperatur **und** gegen Betauung
  (Taupunkt nach Magnus), mit 15 % Reserve
- Kühlfall: `Q_K = P_intern − k·A·(T_zul − T_max)`, Volumenstrom `V = 3,1·Q/ΔT`
- Komponenten-Verlustmodelle: Netzteil/Umrichter/Trafo/Motor über Wirkungsgrad +
  Lastfaktor, direkte Eingabe immer möglich

## Status & Ehrlichkeit

**v0.1 — Rechenkern + UI, Katalogdaten OBERFLÄCHLICH.** Der Katalog startet mit
wenigen Beispieldatensätzen, alle markiert `status: "zu_verifizieren"`. Der
Verifikationsdurchlauf gegen aktuelle Herstellerdaten ist offen — Korrekturen sehr
willkommen (PR oder Issue). Validierungsbericht (Golden-File-Abgleich gegen
veröffentlichte Beispielrechnungen) folgt in v0.2.

## Mitmachen

- **Geräte ergänzen:** `data/catalogs/<hersteller>.json` erweitern, Quellenlink +
  „zuletzt_geprüft"-Datum pflicht, dann PR.
- **Sprache ergänzen:** `data/lang/<iso>.json` anlegen (Schlüssel aus `data/lang/de.json`
  übernehmen), PR.
- **Fehler gefunden:** Issue mit Eingabewerten + erwartetem Ergebnis.

Lizenz: [MIT](LICENSE)