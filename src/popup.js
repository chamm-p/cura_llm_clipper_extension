/**
 * Popup-Ablauf.
 *
 * Vier Ansichten, genau eine sichtbar:
 *   setup  → URL/Key fehlen
 *   ziel   → erstes Mal (oder "aendern"): Wiki + Section waehlen
 *   ablage → Normalfall: ein Klick legt ab
 *   status → laeuft / fertig / Fehler
 */

import { einstellungenLaden, istEingerichtet, zielMerken } from "./settings.js";
import { zieleLaden, sectionsLaden, seiteAblegen, CuraFehler } from "./api.js";
import { seiteErfassen, aktivenTabHolen } from "./capture.js";

const $ = (id) => document.getElementById(id);
const ANSICHTEN = ["ansicht-setup", "ansicht-ziel", "ansicht-ablage", "ansicht-status"];

function zeige(id) {
  for (const a of ANSICHTEN) {
    const el = $(a);
    if (el) el.hidden = a !== id;
  }
}

/**
 * Handler nur setzen, wenn es das Element gibt.
 *
 * Grund: Chrome laedt bei "unpacked" HTML und JS nicht immer synchron neu.
 * Nach einem Update lief neues JS gegen altes HTML, ein ``null.onclick``
 * warf, und weil die Verdrahtung auf MODULEBENE steht, brach damit das
 * ganze Skript ab — sichtbar blieb nur die Kopfzeile. Ein fehlendes
 * Element darf hoechstens seine eigene Funktion kosten, nie die App.
 */
function anKlick(id, fn) {
  const el = $(id);
  if (el) el.onclick = fn;
}

function status(text, art = "", { spinner = false, zurueck = false } = {}) {
  zeige("ansicht-status");
  $("status-spinner").hidden = !spinner;
  $("status-text").textContent = text;
  $("status-text").className = `status-text ${art}`;
  $("btn-status-zurueck").hidden = !zurueck;
}

/**
 * Macht eine moeglicherweise relative Backend-Angabe zu einer absoluten URL.
 *
 * Muss sein: `chrome.tabs.create` loest relative Pfade gegen die EXTENSION
 * auf, nicht gegen cura. Ein vom Backend geliefertes `/wiki?wiki=…` landete
 * so auf `chrome-extension://<id>/wiki?wiki=…` — eine tote Adresse.
 */
function absolutMachen(pfadOderUrl, basisUrl) {
  const wert = (pfadOderUrl || "").trim();
  if (!wert) return "";
  if (/^https?:\/\//i.test(wert)) return wert;
  const basis = (basisUrl || "").trim().replace(/\/+$/, "");
  if (!basis) return "";
  return `${basis}/${wert.replace(/^\/+/, "")}`;
}

/**
 * Beschrifteten Link auf cura anbieten.
 *
 * Bewusst der WIKI-NAME als Text, nie die URL: eine Adresse mit UUID
 * (`/wiki?wiki=a4873c6c-…`) ist zwar korrekt, sagt dem Leser aber nichts.
 * `chrome.tabs.create` statt <a href>, weil ein Klick im Popup dieses
 * sonst schliesst, bevor die Navigation startet.
 */
function linkAnbieten(url, beschriftung) {
  const btn = $("btn-seite-oeffnen");
  if (!url) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  btn.textContent = `In ${beschriftung} oeffnen`;
  btn.title = url;
  btn.onclick = () => chrome.tabs.create({ url });
}

/** Zustand dieses Popup-Durchlaufs — alle waehlbaren Ziele, flach. */
let zielListe = [];

/** Ziel anhand des Auswahlwerts ("wiki:<id>" / "thema:<id>") finden. */
function zielFinden(wert) {
  return zielListe.find((z) => `${z.art}:${z.id}` === wert) || null;
}

/** Section-Feld nur bei manuellen Wikis — Themen kennen keine Sections. */
function sectionFeldZeigen(zeigen) {
  $("feld-section").hidden = !zeigen;
}

// ── Ziel-Auswahl ──────────────────────────────────────────────────

async function zielAnsichtOeffnen({ istAenderung = false } = {}) {
  zeige("ansicht-ziel");
  $("btn-ziel-abbrechen").hidden = !istAenderung;
  $("ziel-einleitung").textContent = istAenderung
    ? "Neues Ziel fuer kuenftige Ablagen waehlen."
    : "Wohin sollen die Seiten abgelegt werden? Die Auswahl wird gemerkt.";

  const auswahl = $("wahl-wiki");
  auswahl.innerHTML = "<option>lade…</option>";
  auswahl.disabled = true;

  let wikis;
  let themen;
  try {
    ({ wikis, themen } = await zieleLaden());
  } catch (e) {
    status(e.message, "fehler", { zurueck: false });
    return;
  }

  zielListe = [...wikis, ...themen];
  if (!zielListe.length) {
    status(
      "Keine Ablage-Ziele gefunden. In cura zuerst ein Wiki oder ein Thema "
        + "anlegen — oder pruefen, ob der API-Key zum richtigen Konto gehoert.",
      "fehler",
    );
    return;
  }

  const cfg = await einstellungenLaden();
  const aktuell = `${cfg.zielArt || "wiki"}:${cfg.wikiId}`;
  auswahl.innerHTML = "";

  // Gruppiert, weil beides fachlich verschieden ist: ein manuelles Wiki ist
  // eine eigene Sammlung, ein Thema fuehrt ins themenbezogene LLM-Wiki.
  const gruppen = [
    ["Manuelle Wikis", wikis],
    ["Themen", themen],
  ];
  for (const [beschriftung, eintraege] of gruppen) {
    if (!eintraege.length) continue;
    const grp = document.createElement("optgroup");
    grp.label = beschriftung;
    for (const z of eintraege) {
      const o = document.createElement("option");
      o.value = `${z.art}:${z.id}`;
      o.textContent = z.art === "wiki" && z.istThemenGebunden ? `${z.name} (an Thema)` : z.name;
      if (o.value === aktuell) o.selected = true;
      grp.appendChild(o);
    }
    auswahl.appendChild(grp);
  }
  auswahl.disabled = false;

  $("wahl-section").value = cfg.section || "Allgemein";
  await zielWechselBehandeln(auswahl.value);
}

/** Auswahl gewechselt: Section-Feld ein-/ausblenden und Vorschlaege laden. */
async function zielWechselBehandeln(wert) {
  const ziel = zielFinden(wert);
  const istWiki = ziel?.art === "wiki";
  sectionFeldZeigen(istWiki);
  if (istWiki) await sectionVorschlaegeLaden(ziel.id);
}

/** Bereits benutzte Sections als Vorschlaege — Tippfehler-Bremse. */
async function sectionVorschlaegeLaden(wikiId) {
  const liste = $("section-vorschlaege");
  liste.innerHTML = "";
  try {
    for (const s of await sectionsLaden(wikiId)) {
      const o = document.createElement("option");
      o.value = s;
      liste.appendChild(o);
    }
  } catch {
    // Vorschlaege sind Komfort, kein Muss — Freitext geht weiterhin.
  }
}

// ── Ablage-Ansicht ────────────────────────────────────────────────

async function ablageAnsichtOeffnen() {
  const cfg = await einstellungenLaden();

  // Ziel anklickbar: oeffnet cura an genau dieser Stelle. Der NAME steht da,
  // nicht die UUID-URL — die liegt nur im Tooltip.
  const istThema = cfg.zielArt === "thema";
  const anzeige = $("ziel-anzeige");
  anzeige.textContent = istThema
    ? cfg.wikiName || "Thema"
    : `${cfg.wikiName || "Wiki"} · ${cfg.section || "Allgemein"}`;

  const zielUrl = absolutMachen(
    istThema ? `/themes?theme=${cfg.wikiId}` : `/wiki?wiki=${cfg.wikiId}`,
    cfg.baseUrl,
  );
  if (zielUrl) {
    anzeige.classList.add("anklickbar");
    anzeige.title = zielUrl;
    anzeige.onclick = () => chrome.tabs.create({ url: zielUrl });
  }

  try {
    const tab = await aktivenTabHolen();
    $("seite-titel").textContent = tab.title || tab.url;
    $("seite-url").textContent = tab.url;
    $("btn-ablegen").disabled = false;
  } catch (e) {
    $("seite-titel").textContent = "—";
    $("seite-url").textContent = "";
    $("btn-ablegen").disabled = true;
    zeige("ansicht-ablage");
    $("erfassungs-info").textContent = e.message;
    return;
  }

  $("erfassungs-info").textContent = "Erfasst wird der sichtbare Bereich als Bild plus der Seitentext.";
  zeige("ansicht-ablage");
}

async function ablegen() {
  status("Seite wird erfasst…", "", { spinner: true });

  let erfasst;
  try {
    erfasst = await seiteErfassen();
  } catch (e) {
    status(e.message, "fehler", { zurueck: true });
    return;
  }

  const cfg = await einstellungenLaden();
  status("Wird an cura uebergeben…", "", { spinner: true });

  const istThema = cfg.zielArt === "thema";

  try {
    const ergebnis = await seiteAblegen({
      zielArt: cfg.zielArt || "wiki",
      zielId: cfg.wikiId,
      zielWorkspaceId: cfg.zielWorkspaceId,
      section: cfg.section,
      url: erfasst.url,
      titel: erfasst.titel,
      seitenText: erfasst.text,
      screenshotBlob: erfasst.screenshot,
      mhtmlBlob: erfasst.mhtml,
    });

    let zusatz = erfasst.textGekuerzt ? "\n(Seitentext war sehr lang und wurde gekuerzt.)" : "";
    if (!erfasst.mhtml) zusatz += "\n(Vollarchiv der Seite nicht moeglich — Bild und Text wurden abgelegt.)";
    const wohin = istThema ? `Thema „${cfg.wikiName}"` : `„${cfg.wikiName}" · ${cfg.section}`;
    status(
      `Abgelegt in ${wohin}.\n`
        + `Die Auswertung des Screenshots laeuft in cura im Hintergrund.${zusatz}`,
      "erfolg",
      { zurueck: true },
    );

    // Ziel als benannter Link statt roher URL: eine UUID-Adresse sagt dem
    // Leser nichts. Bevorzugt der vom Backend gelieferte Direktlink auf die
    // Seite, sonst selbst gebaut — beides oeffnet cura an der richtigen Stelle.
    const ziel = absolutMachen(
      ergebnis?.page_url
        || ergebnis?.url
        || (istThema ? `/themes?theme=${cfg.wikiId}` : `/wiki?wiki=${cfg.wikiId}`),
      cfg.baseUrl,
    );
    linkAnbieten(ziel, cfg.wikiName || "cura");
  } catch (e) {
    const text = e instanceof CuraFehler ? e.message : `Unerwarteter Fehler: ${e.message}`;
    status(text, "fehler", { zurueck: true });
  }
}

// ── Verdrahtung ───────────────────────────────────────────────────

anKlick("btn-einstellungen", () => chrome.runtime.openOptionsPage());
anKlick("btn-zu-einstellungen", () => chrome.runtime.openOptionsPage());

/**
 * Kopfzeile oeffnet cura — der Absprung in die Plattform, ohne vorher
 * clippen zu muessen. Bereits offenen cura-Tab wiederverwenden statt einen
 * zweiten aufzumachen: wer das oefter klickt, saemmelt sonst Tabs.
 *
 * Das Wiederverwenden ist Komfort, kein Muss: fehlt das Tabs-Recht, faellt
 * es auf "neuer Tab" zurueck, statt den Klick ins Leere laufen zu lassen.
 */
anKlick("btn-cura-oeffnen", async () => {
  const cfg = await einstellungenLaden();
  const basis = (cfg.baseUrl || "").trim().replace(/\/+$/, "");
  if (!basis) {
    chrome.runtime.openOptionsPage(); // ohne URL gibt es nichts zu oeffnen
    return;
  }
  try {
    const vorhandene = await chrome.tabs.query({ url: `${basis}/*` });
    if (vorhandene.length) {
      await chrome.tabs.update(vorhandene[0].id, { active: true });
      await chrome.windows.update(vorhandene[0].windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url: basis });
    }
  } catch {
    await chrome.tabs.create({ url: basis });
  }
  window.close();
});

const wahlWiki = $("wahl-wiki");
if (wahlWiki) wahlWiki.onchange = (e) => zielWechselBehandeln(e.target.value);

anKlick("btn-ziel-speichern", async () => {
  const treffer = zielFinden($("wahl-wiki").value);
  if (!treffer) return;

  await zielMerken({
    zielArt: treffer.art,
    wikiId: treffer.id,
    wikiName: treffer.name,
    zielWorkspaceId: treffer.workspaceId || "",
    // Themen kennen keine Sections — dort waere der Wert irrefuehrend.
    section: treffer.art === "wiki" ? $("wahl-section").value.trim() || "Allgemein" : "",
  });
  await ablageAnsichtOeffnen();
});

anKlick("btn-ziel-abbrechen", () => ablageAnsichtOeffnen());
anKlick("btn-ziel-aendern", () => zielAnsichtOeffnen({ istAenderung: true }));
anKlick("btn-ablegen", ablegen);
anKlick("btn-status-zurueck", () => {
  const btn = $("btn-seite-oeffnen");
  if (btn) btn.hidden = true;
  ablageAnsichtOeffnen();
});

// ── Start ─────────────────────────────────────────────────────────

(async function start() {
  try {
    const cfg = await einstellungenLaden();

    // Kopfzeile nur anbieten, wenn es ein Ziel gibt. Ohne hinterlegte URL
    // wuerde der Klick nur in die Einstellungen umleiten — dann lieber gleich
    // sichtbar machen, dass hier nichts zu holen ist.
    const basis = (cfg.baseUrl || "").trim();
    const curaKnopf = $("btn-cura-oeffnen");
    if (curaKnopf) {
      curaKnopf.disabled = !basis;
      curaKnopf.title = basis ? `${basis} oeffnen` : "Noch keine cura-Adresse hinterlegt";
    }

    if (!(await istEingerichtet())) {
      zeige("ansicht-setup");
      return;
    }
    if (!cfg.wikiId) {
      await zielAnsichtOeffnen({ istAenderung: false });
      return;
    }
    await ablageAnsichtOeffnen();
  } catch (e) {
    // Ohne diesen Fang bliebe bei einem Startfehler nur die Kopfzeile stehen
    // und der Grund staende ausschliesslich in der Popup-Konsole, die kaum
    // jemand oeffnet. Lieber die Meldung dort zeigen, wo der Nutzer sie sieht.
    status(
      `Start fehlgeschlagen: ${e?.message || e}\n\n`
        + "Auf chrome://extensions das Neu-laden-Symbol (↻) druecken. "
        + "Bleibt es dabei, die Erweiterung entfernen und erneut laden.",
      "fehler",
    );
  }
})();
