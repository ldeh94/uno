# Uno am Tisch

Uno-Kartenspiel als Web-App für 2 bis 4 Spieler, lokal und online. Eine einzige `index.html`, kein Build.

- **Lokal:** Jeder Platz ist wahlweise Mensch oder Bot. Solo gegen Bots, zu zweit am selben Gerät (mit Sichtschutz) oder gemischt.
- **Online:** Einer erstellt einen Raum, die anderen treten mit 5-stelligem Code oder Einladungslink bei. Freie Plätze füllt der Host mit Bots.
- Alle 108 Karten, Aussetzen, Richtungswechsel, +2, Farbwahl, +4 (nur wenn keine Karte der aktuellen Farbe auf der Hand ist), Der Uno-Button ist immer tippbar. Gesagt wird Uno, wenn nur noch eine Karte auf der Hand ist (auch schon vorher mit zwei Karten möglich). Vergessen kostet 2 Strafkarten, sobald der Nächste zieht oder spielt.
- Spielziel: eine Runde, 200 oder 500 Punkte. Optional: Strafkarten stapeln.
- Läuft auf Handy und Desktop.

## Starten

`index.html` im Browser öffnen (Online-Modus braucht Internet). Oder lokal serven:

```
python3 -m http.server 8000
```

## Veröffentlichen mit GitHub Pages

Repo-Einstellungen, Pages, Source: Branch `main`, Ordner `/ (root)`. Der Einladungslink (`?raum=CODE`) funktioniert dann für alle.

## Wie Online funktioniert

- Es gibt keinen eigenen Spielserver. Die Geräte verbinden sich direkt (WebRTC). [PeerJS](https://peerjs.com) vermittelt nur den Verbindungsaufbau über seinen kostenlosen Server und wird beim ersten Online-Start von jsDelivr (Ausweichquelle: unpkg) geladen, Version 1.5.4.
- Der **Host** führt das Spiel aus (Regeln, Mischen, Bots). Die anderen schicken nur ihre Züge und bekommen ihre persönliche Sicht: eigene Karten, von den anderen nur die Anzahl. Nach Rundenende sind alle Hände offen.
- **Der Host muss die Seite offen lassen.** Schließt er sie, endet das Spiel für alle. Auch ein Handy im Hintergrund kann Verbindungen verlieren.
- Verliert ein Gast die Verbindung, spielt ein Bot den Platz, bis er mit demselben Namen über "Neu verbinden" oder den Einladungslink zurückkommt.
- Manche Netze (Firmen-WLAN, einige Mobilfunkanbieter) lassen Direktverbindungen nicht zu. Dann hilft ein anderes Netz, denn es gibt keinen Relay-Server (TURN).
- Eigener Vermittlungsserver: `?broker=host:port` an die URL hängen (PeerServer, ohne TLS).

## Fehlerprotokoll

Das Spiel schreibt ein Protokoll in den Speicher des Browsers (Netzereignisse, Zugfolge, abgelehnte Nachrichten, Fehler, Stillstand-Warnungen). Es bleibt auf dem Gerät, wird nirgends hingeschickt, und **Einträge älter als 48 Stunden werden automatisch gelöscht** (beim Laden und bei jedem Schreiben, höchstens 3000 Einträge). Unter *Regeln* lässt es sich als Textdatei speichern oder löschen. Jeder Tab hat eine eigene Kennung in eckigen Klammern.

Bei einem Hänger: Auf dem betroffenen Gerät *Regeln*, *Protokoll speichern*, und zwar bei Host und Gast.

## Tests

Spiel-Engine, Online-Sicht und Protokoll stecken in `index.html` und werden ohne Browser getestet:

```
node --test tests/engine.test.js tests/log.test.js
```

Geprüft werden Einzelregeln, Stapeln, Nachmischen, 900 simulierte Bot-Partien, dass keine fremden Karten über das Netz gehen, manipulierte Nachrichten und die 48-Stunden-Bereinigung.

## Hinweis

Uno ist eine Marke von Mattel. Dies ist ein nicht-kommerzielles Hobbyprojekt mit eigenem Kartendesign und hat keine Verbindung zu Mattel.
