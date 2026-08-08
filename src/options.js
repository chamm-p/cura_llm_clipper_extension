/**
 * Einstellungsseite: Verbindung (URL/Key/Workspace) und Ablage-Ziel.
 *
 * Der Verbindungstest speichert BEWUSST vorher — sonst testete er die alten
 * Werte, waehrend im Feld schon die neuen stehen, und meldete Erfolg fuer
 * etwas, das der Nutzer gar nicht mehr eingetragen hat.
 */

import { einstellungenLaden, einstellungenSpeichern } from "./settings.js";
import { michAbrufen, zieleLaden, sectionsLaden, CuraFehler } from "./api.js";
import { t, spracheSetzen, seiteBeschriften } from "./i18n.js";

const $ = (id) => document.getElementById(id);

function melde(el, text, art = "") {
  el.textContent = text;
  el.className = `ergebnis ${art}`;
}

/** Nur die Verbindungsfelder — vor Test und Wiki-Abruf noetig. */
async function verbindungSpeichern() {
  await einstellungenSpeichern({
    baseUrl: $("f-url").value.trim(),
    apiKey: $("f-key").value.trim(),
    workspaceId: $("f-ws").value.trim(),
  });
}

async function wikisFuellen({ still = false } = {}) {
  const auswahl = $("f-wiki");
  const ziel = $("test-ergebnis");
  try {
    const { wikis, themen } = await zieleLaden();
    const cfg = await einstellungenLaden();

    auswahl.innerHTML = "";
    if (!wikis.length && !themen.length) {
      auswahl.innerHTML = `<option value="">${t("optKeineZiele")}</option>`;
      return;
    }

    // Wert traegt die Zielart mit: "wiki:<id>" bzw. "thema:<id>". Ohne diese
    // Unterscheidung liesse sich beim Speichern nicht sagen, welche Route
    // die Ablage spaeter nehmen muss.
    const aktuell = `${cfg.zielArt || "wiki"}:${cfg.wikiId}`;
    for (const [beschriftung, eintraege] of [[t("gruppeWikis"), wikis], [t("gruppeThemen"), themen]]) {
      if (!eintraege.length) continue;
      const grp = document.createElement("optgroup");
      grp.label = beschriftung;
      for (const z of eintraege) {
        const o = document.createElement("option");
        o.value = `${z.art}:${z.id}`;
        o.textContent = z.art === "wiki" && z.istThemenGebunden ? t("anThema", { name: z.name }) : z.name;
        o.dataset.name = z.name;
        o.dataset.art = z.art;
        o.dataset.id = z.id;
        // Nur Themen tragen sie — ihre Capture-Route braucht die ID im Pfad.
        if (z.workspaceId) o.dataset.ws = z.workspaceId;
        if (o.value === aktuell) o.selected = true;
        grp.appendChild(o);
      }
      auswahl.appendChild(grp);
    }
    await sectionsUmschalten();
  } catch (e) {
    auswahl.innerHTML = `<option value="">${t("optAbrufFehler")}</option>`;
    if (!still) melde(ziel, e.message, "fehler");
  }
}

/** Section-Feld nur bei manuellen Wikis — Themen kennen keine Sections. */
async function sectionsUmschalten() {
  const gewaehlt = $("f-wiki").selectedOptions[0];
  const istWiki = gewaehlt?.dataset.art === "wiki";
  $("f-feld-section").hidden = !istWiki;
  if (istWiki && gewaehlt?.dataset.id) await sectionsFuellen(gewaehlt.dataset.id);
}

async function sectionsFuellen(wikiId) {
  const liste = $("f-section-liste");
  liste.innerHTML = "";
  try {
    for (const s of await sectionsLaden(wikiId)) {
      const o = document.createElement("option");
      o.value = s;
      liste.appendChild(o);
    }
  } catch {
    /* Vorschlaege sind optional. */
  }
}

// ── Verdrahtung ───────────────────────────────────────────────────

$("btn-test").onclick = async () => {
  const ziel = $("test-ergebnis");
  melde(ziel, t("optTestet"));
  await verbindungSpeichern();
  try {
    const ich = await michAbrufen();
    const name = ich?.username || ich?.email || t("optUnbekannt");
    melde(ziel, t("optVerbundenAls", { name }), "erfolg");
    await wikisFuellen({ still: true });
  } catch (e) {
    melde(ziel, e instanceof CuraFehler ? e.message : t("optFehler", { fehler: e.message }), "fehler");
  }
};

$("btn-wikis-laden").onclick = async () => {
  await verbindungSpeichern();
  melde($("test-ergebnis"), t("optLaedtZiele"));
  await wikisFuellen();
  if ($("test-ergebnis").textContent === t("optLaedtZiele")) melde($("test-ergebnis"), "");
};

$("f-wiki").onchange = () => sectionsUmschalten();

/**
 * Sprache wirkt SOFORT, nicht erst beim Speichern: sonst waehlt man "English"
 * und die Seite bleibt deutsch, bis irgendwann gespeichert wird — das liest
 * sich wie ein Fehler. Der Wert wird dabei gleich mitgesichert.
 */
$("f-sprache").onchange = async (e) => {
  spracheSetzen(e.target.value);
  await einstellungenSpeichern({ sprache: e.target.value });
  seiteBeschriften();
  // Die Ziel-Liste traegt uebersetzte Gruppentitel — neu aufbauen.
  const cfg = await einstellungenLaden();
  if (cfg.baseUrl && cfg.apiKey) await wikisFuellen({ still: true });
};

$("btn-speichern").onclick = async () => {
  const gewaehlt = $("f-wiki").selectedOptions[0];
  const art = gewaehlt?.dataset.art || "wiki";

  await einstellungenSpeichern({
    baseUrl: $("f-url").value.trim(),
    apiKey: $("f-key").value.trim(),
    workspaceId: $("f-ws").value.trim(),
    sprache: $("f-sprache").value,
    zielArt: art,
    // BEWUSST ``dataset.id`` und nicht ``value``: letzteres traegt das
    // Praefix ("wiki:<uuid>") und waere als ID unbrauchbar.
    wikiId: gewaehlt?.dataset.id || "",
    wikiName: gewaehlt?.dataset.name || "",
    zielWorkspaceId: gewaehlt?.dataset.ws || "",
    section: art === "wiki" ? $("f-section").value.trim() || t("allgemein") : "",
  });

  melde($("speicher-ergebnis"), t("optGespeichert"), "erfolg");
  setTimeout(() => melde($("speicher-ergebnis"), ""), 2500);
};

// ── Start ─────────────────────────────────────────────────────────

(async function start() {
  const cfg = await einstellungenLaden();

  // Sprache VOR dem Beschriften setzen — jedes t() danach haengt daran.
  spracheSetzen(cfg.sprache);
  seiteBeschriften();

  $("f-sprache").value = cfg.sprache || "de";
  $("f-url").value = cfg.baseUrl;
  $("f-key").value = cfg.apiKey;
  $("f-ws").value = cfg.workspaceId;
  $("f-section").value = cfg.section || t("allgemein");

  if (cfg.baseUrl && cfg.apiKey) await wikisFuellen({ still: true });
})();
