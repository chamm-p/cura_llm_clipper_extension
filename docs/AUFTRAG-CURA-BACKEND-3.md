# Entwicklungsauftrag 3 an „smart": Extension aus cura verteilen

**Ergänzt** [`AUFTRAG-CURA-BACKEND.md`](AUFTRAG-CURA-BACKEND.md) und
[`AUFTRAG-CURA-BACKEND-2.md`](AUFTRAG-CURA-BACKEND-2.md).
**Datum:** 08.08.2026
**Zweck:** Kleiner SPOC — Teilnehmer sollen den Clipper aus cura heraus
beziehen können, ohne Repo-Zugriff und ohne GitHub.

---

## 1. Was gebraucht wird

Ein **dedizierter Aufruf in cura**, über den das ZIP der Extension
heruntergeladen werden kann, plus eine kurze Installationsanleitung auf
derselben Seite.

Vorschlag: Route `/extension` (bzw. eine Kachel „Browser-Erweiterung"), die
liefert:

- Download-Knopf → `GET /api/extension/download` → ZIP
- Kurzanleitung (siehe Abschnitt 3 — der Wortlaut ist der wichtige Teil)
- Die **eigene cura-Adresse**, sichtbar zum Kopieren
- Link zu **Einstellungen → API & Gateway** zum Erzeugen des Keys

---

## 2. Wichtige Einschränkung vorab

**Ein Ein-Klick-Install ist nicht möglich.** Chrome blockt seit Jahren jede
Installation, die nicht aus dem Web Store kommt oder per Policy erzwungen ist.
Ein `.crx` zum Download bringt nichts — Chrome verwirft es, auch per
Drag-and-Drop.

Der einzige Weg ohne Store/Policy ist: **ZIP herunterladen → entpacken →
„Entpackte Erweiterung laden" → Ordner wählen.** Das Entpacken lässt sich
nicht abkürzen; Chrome verlangt dort einen **Ordner**, kein Archiv.

Die Downloadseite muss das offen sagen, sonst versucht es jeder Teilnehmer
zuerst mit einem Doppelklick auf das ZIP.

Ebenso wichtig: **der entpackte Ordner muss liegen bleiben.** Chrome speichert
bei „unpacked" nur den Pfad, nicht die Dateien — wird der Ordner verschoben
oder gelöscht (z. B. weil er in `Downloads` lag), ist die Extension beim
nächsten Browserstart defekt. Die Anleitung sollte einen dauerhaften Ablageort
empfehlen.

---

## 3. Vorschlag für den Anleitungstext

> **cura Clipper installieren**
>
> 1. ZIP herunterladen und **entpacken**. Den entpackten Ordner an einen Ort
>    legen, an dem er bleiben kann — nicht in „Downloads".
> 2. Im Browser `chrome://extensions` öffnen
>    (Edge: `edge://extensions`, Brave: `brave://extensions`).
> 3. Oben rechts **Entwicklermodus** einschalten.
> 4. **Entpackte Erweiterung laden** anklicken und den entpackten Ordner
>    auswählen (der Ordner, in dem `manifest.json` liegt).
> 5. Die Einstellungsseite öffnet sich automatisch. Dort eintragen:
>    - cura-Adresse: `<eigene URL, vorbelegt anzeigen>`
>    - Persönlicher API-Key: unter **Einstellungen → API & Gateway** erzeugen
>
> Beim Start fragt Chrome einmal pro Sitzung, ob Erweiterungen im
> Entwicklermodus deaktiviert werden sollen — das Fenster einfach schließen.

---

## 4. Woher kommt das ZIP?

Gebaut wird es im Clipper-Repo mit `tools/bauen.sh` (erzeugt
`dist/cura-clipper-<version>.zip`, ~84 KB, enthält nur `manifest.json`,
`src/`, `icons/`).

**Entscheidung liegt bei euch**, wie es nach cura kommt:

- **(a) Statische Datei im Deployment.** ZIP liegt im Image/Volume, die Route
  liefert es aus. Einfachster Weg, aber bei jeder neuen Clipper-Version muss
  die Datei ausgetauscht werden.
- **(b) Upload über die Admin-Oberfläche.** Ein Admin lädt das ZIP hoch, cura
  speichert es und liefert es aus. Mehr Aufwand, dafür kein Deployment-Schritt
  pro Version.

Bei beiden: **die Version im Dateinamen mitliefern** und auf der Seite
anzeigen. Sonst weiß im SPOC niemand, ob der eigene Stand aktuell ist —
und bei „unpacked" gibt es **keine automatischen Updates**, jeder Teilnehmer
muss bei einer neuen Version erneut herunterladen, entpacken und in
`chrome://extensions` neu laden.

---

## 5. Was NICHT hineingehört

**Kein API-Key im ZIP.** Das Archiv ist für alle Teilnehmer identisch, ein Key
ist personengebunden — sonst clippen alle unter demselben Konto, und in der
Herkunft jedes Eintrags steht der falsche Nutzer.

Die cura-Adresse vorzubelegen wäre technisch möglich (Manifest/Datei im ZIP
anpassen), lohnt aber den Build-Aufwand nicht: sie ist einmal einzutragen und
steht auf der Downloadseite zum Kopieren.

---

## 6. Zugriffsrechte

Die Downloadseite sollte **angemeldeten Nutzern** offenstehen — wer clippen
darf, darf auch die Extension holen. Kein Admin-Recht nötig; das würde den
SPOC unnötig ausbremsen.

Ob die Seite zusätzlich anonym erreichbar sein soll (z. B. zur Verteilung an
neue Teilnehmer vor dem ersten Login), ist eure Entscheidung — nötig ist es
nicht, weil ohne Login ohnehin kein API-Key erzeugt werden kann.

---

## 7. Abnahme

- [ ] Downloadseite ist aus cura heraus erreichbar
- [ ] ZIP lädt herunter und entpackt sich flach (`manifest.json` direkt im Ordner)
- [ ] Entpackter Ordner lässt sich in Chrome als „Entpackte Erweiterung" laden
- [ ] Anleitung nennt Entwicklermodus, dauerhaften Ablageort und den
      Entwicklermodus-Dialog beim Browserstart
- [ ] cura-Adresse steht zum Kopieren auf der Seite
- [ ] Version ist auf der Seite sichtbar
- [ ] Kein API-Key im ZIP

---

## 8. Ausblick (nicht Teil dieses Auftrags)

Für den breiten Rollout ist **Intune** vorgesehen (Force-Install per Policy).
Dann entfallen Downloadseite, Entwicklermodus und manuelle Updates komplett —
die Extension erscheint automatisch und aktualisiert sich selbst. Dieser
Auftrag ist ausdrücklich die SPOC-Zwischenlösung, kein Endzustand.

Offen bleibt für den Intune-Weg die Frage der **Mehrbenutzer-Authentifizierung**:
ein per Policy verteilter API-Key wäre für alle derselbe. Sauber wäre ein Token
gegen euren OIDC/Keycloak (`chrome.identity`). Das ist eigene Arbeit und sollte
vor dem breiten Rollout entschieden werden.
