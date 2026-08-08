# Entwicklungsauftrag 2 an „smart": Themen-Ziel, Clippings, MHTML

**Ergänzt** [`AUFTRAG-CURA-BACKEND.md`](AUFTRAG-CURA-BACKEND.md) — den bitte zuerst lesen.
**Datum:** 08.08.2026
**Auslöser:** Test des Clippers durch den Nutzer.

---

## 1. Zweites Ablageziel: Themen

**Befund aus dem Test:** Der Clipper bot nur manuelle Wikis an. Ursache ist
nicht die Extension, sondern das Datenmodell: `GET /api/wikis` liefert die
Tabelle `wikis` — das **LLM-Wiki eines Themas** besteht aber aus
`knowledge_pages` mit gesetzter `theme_id` und hat dort gar keine Zeile.

Die Extension holt Themen deshalb jetzt über
`GET /api/workspaces/{ws}/themes` (nur solche mit `wiki_enabled`) und bietet
sie gruppiert an.

**Benötigt: zweiter Endpoint** `POST /api/themes/{theme_id}/capture`
Gleicher Vertrag wie `/api/wikis/{id}/capture`, mit zwei Unterschieden:

- **kein** Feld `section` (Themen kennen keine Sections)
- Das Artefakt hängt am Thema: `theme_id = <theme_id>`, `wiki_id = NULL`

Damit greift der bestehende `wiki_ingest` (er selektiert genau auf
`Artifact.theme_id IS NOT NULL` + `Theme.wiki_enabled`) und die Seite landet
im themenbezogenen Wiki — ohne Sonderweg.

Rechte: `can_write_theme` prüfen (dasselbe wie in `themes.py:create_wiki_page`,
wo der Leak-Fix genau darauf achtet).

---

## 2. Trennung: manuelle Wikis ≠ Artefakte des Themas

**Ausdrückliche Nutzer-Vorgabe:**

> „Themenbezogene Wikis gibt es im Rahmen LLM Wiki. Zusätzlich gibt es noch das
> manuelle Wiki oder halt mehrere davon. Diese hängen in einem Thema, sind dort
> aber separiert zu betrachten. **Wichtig: Artefakte in die manuellen Wikis
> gehören nicht in die Artefakte eines Themas.**"

**Das ist heute nicht erfüllt** — und es ist der kritischste Punkt dieses
Auftrags.

Ein manuelles Wiki mit gesetzter `theme_id` erzeugt laut `create_wiki_page`
(`api/wikis.py`) Seiten mit `theme_id = w.theme_id` — „Themen-Bindung folgt dem
Wiki". Legt der Clipper dort ein Artefakt an, bekommt dieses ebenfalls die
`theme_id` des Wikis und taucht damit **in der Artefaktliste des Themas** auf.
Genau das soll nicht passieren.

**Zu klären und umzusetzen:**

- Artefakte, die zu einem **manuellen Wiki** gehören, dürfen **nicht** in der
  Themen-Artefaktliste erscheinen — auch wenn das Wiki an einem Thema hängt.
- Kandidat: Artefakt mit `wiki_id` markieren (bzw. `meta["wiki_id"]`) und die
  Artefakt-Abfragen des Themas entsprechend filtern. Betroffen ist mindestens
  `list_themes` in `api/themes.py` (dort wird `artifact_count` per
  `GROUP BY theme_id` gezählt) sowie die Artefakt-Listenabfrage der UI.
- **Achtung Regression:** `wiki_ingest` selektiert über `Artifact.theme_id`.
  Wird die `theme_id` bei Wiki-Artefakten einfach auf NULL gesetzt, fallen sie
  aus dem Ingest — dann landet nichts mehr im Wiki. Der Filter gehört auf die
  **Anzeige-Ebene**, nicht auf die Datenebene, oder der Ingest muss angepasst
  mitziehen. Bitte vor der Umsetzung entscheiden und im Code begründen.

Diese Trennung betrifft nicht nur den Clipper, sondern jedes Artefakt in einem
themengebundenen manuellen Wiki. Sie ist damit eine allgemeine Korrektur, kein
Clipper-Sonderfall.

---

## 3. Clippings als eigene Kategorie führen

**Nutzer-Vorgabe:**

> „Artefakte aus dem Clipping sind zwar Bilder, sollten aber als **links** in
> Cura_llm als **Clippings** geführt werden."

Heute entsteht ein `ArtifactType.IMAGE` — fachlich ist es aber ein
**Web-Clipping**: eine verlinkte Quelle, deren Screenshot nur das Beiwerk ist.
In der Artefaktliste erscheint es dadurch zwischen generierten Bildern und
Diagrammen, und der eigentliche Wert (die URL) ist nicht sichtbar.

**Gewünscht:**

- Clippings in der UI als eigene Kategorie/Filter erkennbar, nicht als „Bild".
- Darstellung als **Link auf die Quell-URL** (`meta["source_url"]`), mit dem
  Screenshot als Vorschaubild — nicht umgekehrt.
- Titel: der vom Vision-Modell abgeleitete `TITEL:` bzw. der Seitentitel.

**Umsetzungsweg ist eure Entscheidung.** Zwei Optionen mit unterschiedlichem
Gewicht:

- **(a)** Bestehenden Typ behalten und über `meta["source"] == "web_clip"`
  filtern/darstellen. Keine Migration, rein in der UI. Aber: der Typ bleibt
  „Bild", und jede Liste, die nach Typ gruppiert, zeigt es weiter falsch.
- **(b)** Neuer `ArtifactType.WEB_CLIP`. Fachlich sauber, erfordert aber
  Migration und Prüfung aller Stellen, die auf `ArtifactType.IMAGE` verzweigen
  — u. a. `artifact_describer` (Vision-Trigger), `wiki_ingest._INGEST_TYPES`,
  `artifact_persister`, `artifact_files`. Wird `WEB_CLIP` dort vergessen,
  **läuft kein Vision mehr und nichts landet im Wiki**.

Bei (b) unbedingt beachten: der gesamte in Auftrag 1 beschriebene Pfad hängt
daran, dass der Typ als bild-artig erkannt wird.

---

## 4. MHTML-Vollarchiv (neu ab Clipper-Version 0.2)

Der Clipper legt ab sofort zusätzlich ein **MHTML-Archiv** der Seite bei —
die vollständige Seite samt Bildern, CSS und Fonts in einer Datei. Grund
(Nutzer): „dann haben wir es vollständig. heute habe ich nur den Picturetext".

**Request-Feld:** `mhtml` (Datei, `message/rfc822`, Dateiname `seite.mhtml`)

**Eigenschaften, auf die ihr euch verlassen könnt:**

- **Optional.** Fehlt bei gesperrten Seiten, in Browsern ohne `pageCapture`
  und bei Archiven > 25 MB. Der Endpoint muss ohne auskommen.
- Kann **mehrere MB** groß sein — Upload-Limit und Ablage entsprechend
  auslegen. Das bestehende `_MAX_UPLOAD_BYTES` in `api/ingest.py` als
  Orientierung prüfen.

**Vorschlag zur Ablage:** Datei wie den Screenshot in `outputs_dir`
persistieren und am Artefakt referenzieren (z. B.
`content["mhtml_filename"]`), damit die Seite später originalgetreu
wieder angezeigt oder heruntergeladen werden kann. **Nicht** in `body_text`
inlinen — das würde RAG und den Vision-Prompt mit Markup fluten.

Ob ihr das Archiv darüber hinaus auswertet (z. B. sauberere Textextraktion als
die Heuristik der Extension), ist eure Entscheidung — die Extension liefert
den Seitentext weiterhin separat in `page_text`.

---

## 5. Abnahme (ergänzend zu Auftrag 1)

- [ ] Clipping auf ein **Thema** landet im themenbezogenen Wiki
- [ ] Clipping in ein **manuelles Wiki an einem Thema** erscheint **nicht** in
      der Artefaktliste dieses Themas
- [ ] …und landet trotzdem im Wiki (kein Ingest-Regress, siehe Warnung in 2.)
- [ ] Clippings sind in der UI als Clipping erkennbar und als Link auf die
      Quelle dargestellt
- [ ] MHTML wird gespeichert und ist abrufbar
- [ ] Clipping ohne MHTML (großes/gesperrtes Ziel) funktioniert unverändert
