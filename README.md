# cura Clipper

Browser-Erweiterung, die die gerade geöffnete Webseite als **Screenshot + Text
+ MHTML-Archiv** in ein **cura**-Wiki oder -Thema ablegt. Die Auswertung
übernimmt cura mit dem bestehenden Vision-Pfad — die Erweiterung selbst
interpretiert nichts.

Läuft in **Chrome, Edge, Brave, Opera, Vivaldi** (Manifest V3, keine
Chrome-exklusiven APIs).

---

## Status

**Einsatzbereit.** Die Gegenstücke im cura-Backend sind eingespielt:

| Route | Zweck |
|---|---|
| `POST /api/wikis/{id}/capture` | Ablage in ein manuelles Wiki (mit Section) |
| `POST /api/workspaces/{ws}/themes/{id}/capture` | Ablage in ein Thema (ohne Section) |

Die Aufträge, aus denen sie entstanden sind, liegen zur Nachvollziehbarkeit bei:
[`docs/AUFTRAG-CURA-BACKEND.md`](docs/AUFTRAG-CURA-BACKEND.md) und
[`docs/AUFTRAG-CURA-BACKEND-2.md`](docs/AUFTRAG-CURA-BACKEND-2.md)
*(umgesetzt im Projekt „smart")*.

Offen aus Auftrag 2 (Backend-seitig, betrifft die Darstellung in cura):
Führung der Clippings als eigene Kategorie statt als „Bild", und die Trennung
von Artefakten manueller Wikis gegenüber Themen-Artefakten.

---

## Installation (unpacked)

1. `chrome://extensions` öffnen (Edge: `edge://extensions`, Brave: `brave://extensions`)
2. **Entwicklermodus** einschalten
3. **Entpackte Erweiterung laden** → dieses Verzeichnis wählen
4. Die Einstellungsseite öffnet sich automatisch

## Einrichtung

| Feld | Wert |
|---|---|
| cura-Adresse | Basis-URL ohne Pfad, z. B. `https://cura.example.com` |
| API-Key | cura → **Einstellungen → API & Gateway** → persönlichen Key erzeugen (`sk-gw-…`) |
| Workspace-ID | nur bei mehreren Workspaces nötig |
| Sprache | Deutsch oder English — wirkt sofort |

**Warum ein API-Key und kein Login?** cura authentifiziert ausschließlich per
Bearer-Token (JWT der Web-App oder API-Key) — es gibt **kein Session-Cookie**,
das eine Erweiterung mitschicken könnte. Der Key ist damit der einzige Weg, der
ohne eigenes Login-Formular auskommt und auch mit OIDC-/Keycloak-Konten
funktioniert. Er wird **nur lokal** gespeichert, nie im Browser-Sync.

## Benutzung

Beim **ersten Mal** fragt die Erweiterung nach **Wiki** und **Bereich (Section)**
und merkt sich beides. Danach genügt ein Klick auf **In cura ablegen**.

Ziel ändern: im Popup auf *ändern* — oder jederzeit über ⚙ Einstellungen.

Alternativ per **Rechtsklick** auf die Seite → *Seite in cura-Wiki ablegen*.

**Direkt zu cura:** Klick auf Logo/Name in der Kopfzeile öffnet die Plattform.
Ist cura bereits in einem Tab offen, wird dieser aktiviert statt ein zweiter
geöffnet.

## Ablage-Ziele

| Art | Bedeutung |
|---|---|
| **Manuelles Wiki** | Eigene Sammlung mit frei benennbaren Bereichen (Sections) |
| **Thema** | Ablage im themenbezogenen LLM-Wiki; keine Sections |

## Was erfasst wird

- **Screenshot** des sichtbaren Bereichs (`captureVisibleTab`) — trägt das Layout
- **Seitentext** der ganzen Seite (bis 40 000 Zeichen) — trägt den Inhalt auch
  unterhalb des Viewports
- **MHTML-Vollarchiv** (`pageCapture`) — die komplette Seite mit Bildern, CSS und
  Fonts in einer Datei; entfällt bei > 25 MB oder gesperrten Seiten
- **URL** — geht als `meta.source_url` mit und dient dem Vision-Modell als Kontext

Kein scrollendes Stitching: das bricht an sticky Headern und Lazy-Loading. Der
Volltext deckt ab, was der Screenshot nicht zeigt.

## Aufbau

```
manifest.json         MV3-Manifest
icons/                cura-Mini-Logo (aus curai/frontend/public/logo)
src/
  popup.html/.css/.js Ablage-UI + Erstauswahl des Ziels
  options.html/.css/.js Verbindung, Sprache, Ablage-Ziel
  api.js              einzige Stelle, die cura kennt
  capture.js          Screenshot + Text + MHTML
  settings.js         Speicherung (Ziel sync, Key lokal)
  i18n.js             Texte DE/EN
  background.js       Service Worker, Kontextmenü
tools/
  pruefen.sh          Vorab-Prüfung — vor jedem Commit laufen lassen
docs/
  AUFTRAG-CURA-BACKEND.md    Backend-Erweiterung (umgesetzt)
  AUFTRAG-CURA-BACKEND-2.md  Themen-Ziel, Clippings, MHTML
```

## Entwicklung

```bash
./tools/pruefen.sh
```

Prüft Syntax (**als ES-Modul** — `node --check` allein übersieht Fehler in
Strings), Manifest-Pfade, DOM-IDs und Übersetzungslücken.

```bash
./tools/bauen.sh
```

Baut `dist/cura-clipper-<version>.zip` zum Verteilen (~84 KB; nur `manifest.json`,
`src/`, `icons/`). Läuft vorher `pruefen.sh` — ein ZIP mit kaputtem Modul soll
gar nicht erst entstehen.

**Zum Verteilen:** Das ZIP muss beim Empfänger **entpackt** werden — Chrome
verlangt bei „Entpackte Erweiterung laden" einen Ordner, kein Archiv. Ein
`.crx` per Klick zu installieren geht seit Jahren nicht mehr.

## Browser

| Browser | Status |
|---|---|
| Chrome, Edge, Brave, Opera, Vivaldi | läuft unverändert |
| Firefox | **nicht ohne Anpassung** — braucht `background.scripts` statt `service_worker`, eine Add-on-ID unter `browser_specific_settings`, und kennt `chrome.pageCapture` nicht (MHTML entfiele) |

## Grenzen

- Browser-interne Seiten (`chrome://`, `edge://`, Web Store) sind für
  Erweiterungen gesperrt — die Erweiterung meldet das verständlich.
- Bei Seiten mit strenger CSP kann die Textextraktion fehlschlagen; der
  Screenshot wird trotzdem abgelegt.
