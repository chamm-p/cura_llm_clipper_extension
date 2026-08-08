# Entwicklungsauftrag an Projekt „smart": Web-Capture in cura

**Auftraggeber-Kontext:** Browser-Extension `cura-clipper` (eigenes Repo).
**Betroffenes System:** cura (`curai`) — Backend.
**Datum:** 08.08.2026
**Status:** offen — ohne diese Erweiterung kann die Extension nicht ablegen.

---

## 0. Warum das auch euch betrifft

Dieser Auftrag beschreibt eine **Screenshot-Aufnahme-Strecke**, die zwei
Abnehmer hat:

1. **cura-clipper** (Browser-Extension) — Webseite als Screenshot + Text ins Wiki.
2. **Verlinkung von Webseiten in Notizen** (euer laufendes Thema) — dieselbe
   Aufnahme-Logik, anderer Ablageort.

Der Auftrag ist deshalb bewusst so geschnitten, dass der **Aufnahme- und
Auswertungsteil wiederverwendbar** bleibt und der Ablageort ein Parameter ist,
kein fest verdrahteter Pfad. Wer zuerst baut, sollte Abschnitt 3 (Service) so
anlegen, dass der jeweils andere Anwendungsfall nur einen anderen Aufrufer
braucht.

---

## 1. Leitplanke: KEINE neue Kuratierungs-Logik

Ausdrückliche Vorgabe des Auftraggebers:

> „es soll keine neue logik entstehen. wenn ich heute ein bild poste, dann hat
> es bereits eine logik, die vision startet und der eintrag interpretiert wird.
> neu ist lediglich die URL, welche mitgegeben werden muss."

Der bestehende Pfad ist verifiziert und sieht heute so aus:

| # | Was passiert | Wo |
|---|---|---|
| 1 | Artefakt mit `type=IMAGE` wird angelegt | `api/artifacts.py` |
| 2 | `describe_artifact` als Background-Task | `api/artifacts.py:901–907` |
| 3 | Vision-LLM mit `requires_vision=True`, Ergebnis nach `body_text` | `services/artifact_describer.py:115` |
| 4 | `wiki_ingest` greift `ArtifactType.IMAGE` ab | `services/wiki_ingest.py:48` |
| 5 | `mirror_artifact_page` + `curate_from_digest` schreiben die Wiki-Seite | `services/wiki_ingest.py` |

**Die Schritte 2–5 sind NICHT nachzubauen.** Der neue Endpoint erzeugt lediglich
das Artefakt aus Schritt 1 und lässt den Rest wie gehabt laufen.

---

## 2. Änderung A — URL als Vision-Kontext

**Datei:** `backend/app/services/artifact_describer.py`, Funktion `_build_prompt`

Dort existiert bereits ein Hint-Block, in den `user_note` (Zeile ~327) und
`tags` (~336) einfließen. **In genau diesen Block** kommt eine weitere Zeile,
wenn `artifact.meta["source_url"]` gesetzt ist — sinngemäß:

> „Dies ist ein Screenshot der Webseite `<URL>`. Berücksichtige die Quelle,
> beschreibe aber nur, was tatsächlich sichtbar ist — nicht über nicht
> abgebildete Teile der Seite spekulieren."

**Randbedingungen:**

- Nur EIN zusätzlicher Block im bestehenden `user_note_block`. Der übrige
  Describer, die Prompt-Konstanten und das `TITEL:`-Format bleiben unangetastet.
- Kein neuer Parameter an `describe_artifact` — die URL kommt aus `meta`, das
  ohnehin geladen wird.
- Der Zusatz greift für **jedes** Artefakt mit `meta["source_url"]`. Das ist
  gewollt: `ingest_url` (`api/ingest.py`, `extra_meta={"source_url": …}`) setzt
  dieses Feld heute schon, profitiert also mit.
- Der „nicht spekulieren"-Halbsatz ist nicht kosmetisch: ohne ihn erfindet ein
  Vision-Modell aus Domain plus sichtbarem Ausschnitt gerne Seiteninhalte, die
  im Screenshot gar nicht vorkommen — und die landen dann als Fakt im Wiki.

---

## 3. Änderung B — Aufnahme-Endpoint

**Neu:** `POST /api/wikis/{wiki_id}/capture`
**Datei:** `backend/app/api/wikis.py` (oder eigener Router, wenn euch das für
den Notizen-Anwendungsfall lieber ist — siehe Abschnitt 0).

### Request (`multipart/form-data`)

| Feld | Typ | Pflicht | Bedeutung |
|---|---|---|---|
| `screenshot` | Datei (PNG) | ja | Sichtbarer Bereich des Tabs |
| `source_url` | Text | ja | URL der erfassten Seite |
| `title` | Text | nein | `document.title` — Vorschlag, kein Zwang |
| `section` | Text | nein | Wiki-Bereich; leer/fehlend = „Allgemein" |
| `page_text` | Text | nein | Extrahierter Seitentext (bis ~40 000 Zeichen) |

### Erwartetes Verhalten

1. Wiki laden und Schreibrecht prüfen — die vorhandenen Helfer `_laden` und
   `_darf_seiten_aendern` (`api/wikis.py`) leisten das bereits.
2. Screenshot in `outputs_dir` ablegen, Muster wie bei `document_images.py`
   (deterministischer Dateiname, erreichbar über `/api/images/proxy/{filename}`).
3. Artefakt anlegen:
   - `type = ArtifactType.IMAGE`
   - `workspace_id = wiki.workspace_id`
   - `theme_id = wiki.theme_id` — **Themenbindung folgt dem Wiki**, exakt wie in
     `create_wiki_page`
   - `content = {"image_url": "/api/images/proxy/<datei>", "filename": …, "source_type": "web_clip"}`
   - `body_text = page_text` (der Describer stellt seine Beschreibung voran und
     hängt das Original unter dem `--- (originaler Inhalt) ---`-Marker an — das
     ist bestehendes Verhalten, nichts Neues)
   - `meta = {"source": "web_clip", "source_url": <URL>, "wiki_id": …, "section": …}`
4. `describe_artifact` als Background-Task anstoßen — **derselbe Aufruf wie in
   `artifacts.py:906`**, kein Sonderweg.
5. `wiki_ingest.ingest_anstossen()` rufen, damit der Nutzer nicht bis zu
   10 Minuten auf den Ruhe-Takt wartet. Die Funktion ist genau dafür da.

### Response

```json
{ "artifact_id": "…", "status": "processing", "page_url": "…" }
```

`page_url` optional — die Extension blendet den „Im Wiki öffnen"-Knopf nur ein,
wenn das Feld kommt.

### Fehlerfälle

| Lage | Status |
|---|---|
| Wiki unbekannt / kein Zugriff | 404 bzw. 403 (wie bei den bestehenden Wiki-Routen) |
| Kein Schreibrecht auf Seiten | 403 |
| Screenshot fehlt oder ist leer | 400 |
| Screenshot über Größengrenze | 413 |

---

## 4. Offener Punkt zur Entscheidung durch „smart"

**Wie kommt die `section` an die erzeugte Wiki-Seite?**

`wiki_ingest` erzeugt die Seite heute selbst (`mirror_artifact_page`), und der
Aufnahme-Endpoint legt nur das Artefakt an — die gewünschte Section muss also
den Umweg über das Artefakt nehmen. Zwei Wege:

- **(a)** `meta["section"]` am Artefakt setzen, und `mirror_artifact_page` liest
  es beim Anlegen aus. Kleiner Eingriff, wirkt aber im gemeinsamen Ingest-Pfad.
- **(b)** Der Aufnahme-Endpoint legt die Wiki-Seite direkt mit an (Section
  gesetzt, `origin='user'`) und verknüpft das Artefakt. Lässt `wiki_ingest`
  unberührt, erzeugt aber potenziell eine zweite Seite, wenn der Ingest später
  ebenfalls spiegelt — das wäre vorher zu prüfen.

Auftraggeber hat hier **keine Präferenz geäußert**; Entscheidung liegt bei euch.
Aus Sicht der Extension ist beides gleichwertig — sie schickt `section` und
erwartet, dass die Seite dort landet.

---

## 5. Abnahme

- [ ] Screenshot per Extension abgelegt → Artefakt entsteht mit `meta.source_url`
- [ ] Vision-Beschreibung landet in `body_text`, Titel wird aus `TITEL:` abgeleitet
- [ ] Wiki-Seite erscheint im gewählten Wiki **und** in der gewählten Section
- [ ] Seite ist auch im LLM-Wiki sichtbar (ergibt sich automatisch: manuelle
      Wiki-Seiten sind normale `knowledge_pages`)
- [ ] `ingest_url`-Artefakte funktionieren unverändert (Regressionsprobe für 2.)
- [ ] Ohne `source_url` verhält sich der Describer exakt wie vorher
