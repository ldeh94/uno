# Uno am Tisch

Uno-Kartenspiel als Web-App für 2 bis 4 Spieler. Eine einzige `index.html`, kein Build, keine Abhängigkeiten.

- Jeder Platz ist wahlweise **Mensch** oder **Bot**. So geht Solo gegen Bots, zu zweit am selben Gerät oder gemischt.
- Mehrere Menschen an einem Gerät: Vor jedem Zug erscheint ein Sichtschutz, damit niemand fremde Karten sieht.
- Alle 108 Karten, Aussetzen, Richtungswechsel, +2, Farbwahl, +4 (nur wenn keine Karte der aktuellen Farbe auf der Hand ist), Uno-Ruf mit 2 Strafkarten bei Vergessen.
- Spielziel: eine Runde, 200 oder 500 Punkte. Optional: Strafkarten stapeln.
- Läuft auf Handy und Desktop.

## Starten

`index.html` im Browser öffnen. Oder lokal serven:

```
python3 -m http.server 8000
```

## Veröffentlichen mit GitHub Pages

Repo-Einstellungen, Pages, Source: Branch `main`, Ordner `/ (root)`.

## Tests

Die Spiel-Engine steckt in `index.html` (zwischen `ENGINE-START` und `ENGINE-END`) und wird ohne Browser getestet:

```
node --test tests/engine.test.js
```

Geprüft werden Einzelregeln, Stapeln, Nachmischen und 900 simulierte Bot-Partien mit 2, 3 und 4 Spielern.

## Hinweis

Uno ist eine Marke von Mattel. Dies ist ein nicht-kommerzielles Hobbyprojekt mit eigenem Kartendesign und hat keine Verbindung zu Mattel.
