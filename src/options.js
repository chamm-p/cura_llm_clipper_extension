/**
 * Einstellungsseite: Verbindung (URL/Key/Workspace) und Ablage-Ziel.
 *
 * Der Verbindungstest speichert BEWUSST vorher — sonst testete er die alten
 * Werte, waehrend im Feld schon die neuen stehen, und meldete Erfolg fuer
 * etwas, das der Nutzer gar nicht mehr eingetragen hat.
 */

import { einstellungenLaden, einstellungenSpeichern } from "./settings.js";
import { michAbrufen, wikisLaden, sectionsLaden, CuraFehler } from "./api.js";

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
    const liste = await wikisLaden();
    const cfg = await einstellungenLaden();

    auswahl.innerHTML = "";
    if (!liste.length) {
      auswahl.innerHTML = "<option value=''>— keine Wikis gefunden —</option>";
      return;
    }
    for (const w of liste) {
      const o = document.createElement("option");
      o.value = w.id;
      o.textContent = w.istThemenGebunden ? `${w.name} (Thema)` : w.name;
      o.dataset.name = w.name;
      if (w.id === cfg.wikiId) o.selected = true;
      auswahl.appendChild(o);
    }
    if (auswahl.value) await sectionsFuellen(auswahl.value);
  } catch (e) {
    auswahl.innerHTML = "<option value=''>— Abruf fehlgeschlagen —</option>";
    if (!still) melde(ziel, e.message, "fehler");
  }
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
  melde(ziel, "teste…");
  await verbindungSpeichern();
  try {
    const ich = await michAbrufen();
    const name = ich?.username || ich?.email || "unbekannt";
    melde(ziel, `Verbunden als ${name}.`, "erfolg");
    await wikisFuellen({ still: true });
  } catch (e) {
    melde(ziel, e instanceof CuraFehler ? e.message : `Fehler: ${e.message}`, "fehler");
  }
};

$("btn-wikis-laden").onclick = async () => {
  await verbindungSpeichern();
  melde($("test-ergebnis"), "lade Wikis…");
  await wikisFuellen();
  if ($("test-ergebnis").textContent === "lade Wikis…") melde($("test-ergebnis"), "");
};

$("f-wiki").onchange = (e) => sectionsFuellen(e.target.value);

$("btn-speichern").onclick = async () => {
  const auswahl = $("f-wiki");
  const gewaehlt = auswahl.selectedOptions[0];

  await einstellungenSpeichern({
    baseUrl: $("f-url").value.trim(),
    apiKey: $("f-key").value.trim(),
    workspaceId: $("f-ws").value.trim(),
    wikiId: auswahl.value || "",
    wikiName: gewaehlt?.dataset.name || "",
    section: $("f-section").value.trim() || "Allgemein",
  });

  melde($("speicher-ergebnis"), "Gespeichert.", "erfolg");
  setTimeout(() => melde($("speicher-ergebnis"), ""), 2500);
};

// ── Start ─────────────────────────────────────────────────────────

(async function start() {
  const cfg = await einstellungenLaden();
  $("f-url").value = cfg.baseUrl;
  $("f-key").value = cfg.apiKey;
  $("f-ws").value = cfg.workspaceId;
  $("f-section").value = cfg.section || "Allgemein";

  if (cfg.baseUrl && cfg.apiKey) await wikisFuellen({ still: true });
})();
