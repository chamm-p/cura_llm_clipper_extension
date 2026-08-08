# cura Clipper

Browser-Erweiterung, die die gerade geöffnete Webseite als **Screenshot + Text**
in ein **cura**-Wiki ablegt. Die Auswertung übernimmt cura mit dem bestehenden
Vision-Pfad — die Erweiterung selbst interpretiert nichts.

Läuft in **Chrome, Edge, Brave, Opera, Vivaldi** (Manifest V3, keine
Chrome-exklusiven APIs).

---

## Status

⚠️ **Noch nicht einsatzfähig.** Die Erweiterung ist fertig, aber der
Gegenpart im cura-Backend fehlt: `POST /api/wikis/{id}/capture` existiert dort
noch nicht. Die Spezifikation liegt als Entwicklungsauftrag bei:

→ [`docs/AUFTRAG-CURA-BACKEND.md`](docs/AUFTRAG-CURA-BACKEND.md) *(übergeben an Projekt „smart")*

Bis dahin meldet die Erweiterung beim Ablegen einen klaren Fehler statt still zu
scheitern. Verbindungstest, Wiki-Auswahl und Einstellungen funktionieren bereits.

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
  options.html/.css/.js Verbindung + Ablage-Ziel
  api.js              einzige Stelle, die cura kennt
  capture.js          Screenshot + Textextraktion
  settings.js         Speicherung (Ziel sync, Key lokal)
  background.js       Service Worker, Kontextmenü
docs/
  AUFTRAG-CURA-BACKEND.md   Spezifikation der Backend-Erweiterung
```

## Grenzen

- Browser-interne Seiten (`chrome://`, `edge://`, Web Store) sind für
  Erweiterungen gesperrt — die Erweiterung meldet das verständlich.
- Bei Seiten mit strenger CSP kann die Textextraktion fehlschlagen; der
  Screenshot wird trotzdem abgelegt.
