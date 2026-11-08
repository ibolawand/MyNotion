# MyNotion

Eine lokale Notiz- und Kalender-App für den Desktop: Notizen mit Ordnern und Kategorien, Checklisten,
ein Wochenkalender mit wiederkehrenden Terminen. Alles liegt in einer SQLite-Datei auf dem eigenen Rechner.

Gebaut mit **Electron**, **Angular 20** und dem Editor **TipTap**.

## Funktionen

- **Notizen** mit Rich-Text-Editor, Ordnern (auch verschachtelt) und Kategorien
- **Checklisten** mit Häkchen direkt im Editor („☑ To-do")
- **Formeln** (LaTeX, mit Vorschau und Knöpfen für ², Bruch, √ …) und **Matrizen**: `/matrix` öffnet ein Raster zum
  Ausfüllen (runde/eckige Klammern oder Determinante, bis 10 × 10). „+ matrix" hängt weitere an (A + B = C, mit
  + − · × =), „In the text" oder „Own line" bestimmt, ob Text daneben stehen kann. In der Formel-Box fügt „+ Matrix"
  eine Matrix an der Cursorstelle ein, und „Matrix 1, 2 …" bearbeitet eine Matrix aus einer Formel wie A = … im Raster
- **Ausrichtung** pro Zeile: links, zentriert oder rechts für Text, Überschriften und Formeln auf eigener Zeile
  (Knöpfe in der Werkzeugleiste und in der Formel-/Matrix-Box); alles beginnt links
- **Tab** wie in Word: rückt in Listen und To-dos eine Ebene ein, sonst ein Tabulator; Shift+Tab macht es rückgängig
- **Kalender** mit Wochenansicht, ganztägigen Terminen und Wiederholung (täglich, wöchentlich, monatlich, jährlich)
- **Posteingang (Gmail)** ohne Google-Cloud-Projekt: mit einem App-Passwort (im System-Schlüsselbund gespeichert),
  nur der Tab „Allgemein" (keine Werbung, Newsletter oder Spam), Lesen, Antworten, Anhänge, Archivieren, Suche,
  „Erinnere mich" (To-do mit Fälligkeit) und „Termin daraus machen". Aria kann Mails vorlesen und beantworten.
- **Tägliches Backup** nach `~/.config/MyNotion/backups/` (die letzten 14 bleiben)
- **Kein Login**: eine App für eine Person auf dem eigenen Rechner
- **Zusammenarbeit mit [Aria](https://github.com/ibolawand/personal-ai)**, meiner Desktop-Assistentin: Aria liest und
  schreibt dieselbe Datenbank („schreib Eier auf die Einkaufsliste", „was habe ich morgen?"), MyNotion zeigt
  Änderungen sofort an, und `MyNotion --open=calendar` oder `--open=note:<id>` öffnet die passende Seite.

## Daten

Die Datenbank liegt in `~/.config/MyNotion/noted.db` (oder dort, wohin `MYNOTION_DB` zeigt).
Es läuft immer nur eine Instanz; ein zweiter Start holt das offene Fenster nach vorne.

## Als App installieren (Linux)

```bash
./build_app.sh          # baut das Frontend und packt die Electron-App
./install_desktop.sh    # Eintrag im Startmenü
```

Die fertige App liegt danach in `note/out/MyNotion-linux-x64/MyNotion`.

## Entwickeln

```bash
cd note-frontend && npm install && npm start     # Angular auf http://localhost:4200
cd note && npm install && npm start              # Electron, lädt das laufende Frontend
```
