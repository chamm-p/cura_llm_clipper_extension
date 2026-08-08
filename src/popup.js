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
import { wikisLaden, sectionsLaden, seiteAblegen, CuraFehler } from "./api.js";
import { seiteErfassen, aktivenTabHolen } from "./capture.js";

const $ = (id) => document.getElementById(id);
const ANSICHTEN = ["ansicht-setup", "ansicht-ziel", "ansicht-ablage", "ansicht-status"];

function zeige(id) {
  for (const a of ANSICHTEN) $(a).hidden = a !== id;
}

function status(text, art = "", { spinner = false, zurueck = false } = {}) {
  zeige("ansicht-status");
  $("status-spinner").hidden = !spinner;
  $("status-text").textContent = text;
  $("status-text").className = `status-text ${art}`;
  $("btn-status-zurueck").hidden = !zurueck;
}

/** Zustand dieses Popup-Durchlaufs. */
let wikiListe = [];
let zielWirdGeaendert = false;

// ── Ziel-Auswahl ──────────────────────────────────────────────────

async function zielAnsichtOeffnen({ istAenderung = false } = {}) {
  zielWirdGeaendert = istAenderung;
  zeige("ansicht-ziel");
  $("btn-ziel-abbrechen").hidden = !istAenderung;
  $("ziel-einleitung").textContent = istAenderung
    ? "Neues Ziel fuer kuenftige Ablagen waehlen."
    : "Wohin sollen die Seiten abgelegt werden? Die Auswahl wird gemerkt.";

  const auswahl = $("wahl-wiki");
  auswahl.innerHTML = "<option>lade…</option>";
  auswahl.disabled = true;

  try {
    wikiListe = await wikisLaden();
  } catch (e) {
    status(e.message, "fehler", { zurueck: false });
    return;
  }

  if (!wikiListe.length) {
    status(
      "Keine Wikis gefunden. In cura zuerst ein Wiki anlegen — oder pruefen, "
        + "ob der API-Key zum richtigen Konto gehoert.",
      "fehler",
    );
    return;
  }

  const cfg = await einstellungenLaden();
  auswahl.innerHTML = "";
  for (const w of wikiListe) {
    const o = document.createElement("option");
    o.value = w.id;
    // Themenbindung sichtbar machen — zwei Wikis koennen gleich heissen.
    o.textContent = w.istThemenGebunden ? `${w.name} (Thema)` : w.name;
    if (w.id === cfg.wikiId) o.selected = true;
    auswahl.appendChild(o);
  }
  auswahl.disabled = false;

  $("wahl-section").value = cfg.section || "Allgemein";
  await sectionVorschlaegeLaden(auswahl.value);
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
  $("ziel-anzeige").textContent = `${cfg.wikiName || "Wiki"} · ${cfg.section || "Allgemein"}`;

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

  try {
    const ergebnis = await seiteAblegen({
      wikiId: cfg.wikiId,
      section: cfg.section,
      url: erfasst.url,
      titel: erfasst.titel,
      seitenText: erfasst.text,
      screenshotBlob: erfasst.screenshot,
    });

    const zusatz = erfasst.textGekuerzt ? "\n(Seitentext war sehr lang und wurde gekuerzt.)" : "";
    status(
      `Abgelegt in „${cfg.wikiName}" · ${cfg.section}.\n`
        + `Die Auswertung des Screenshots laeuft in cura im Hintergrund.${zusatz}`,
      "erfolg",
      { zurueck: true },
    );

    // Direktlink nur anbieten, wenn das Backend einen mitgeschickt hat.
    const url = ergebnis?.page_url || ergebnis?.url;
    if (url) {
      const btn = $("btn-seite-oeffnen");
      btn.hidden = false;
      btn.onclick = () => chrome.tabs.create({ url });
    }
  } catch (e) {
    const text = e instanceof CuraFehler ? e.message : `Unerwarteter Fehler: ${e.message}`;
    status(text, "fehler", { zurueck: true });
  }
}

// ── Verdrahtung ───────────────────────────────────────────────────

$("btn-einstellungen").onclick = () => chrome.runtime.openOptionsPage();
$("btn-zu-einstellungen").onclick = () => chrome.runtime.openOptionsPage();

$("wahl-wiki").onchange = (e) => sectionVorschlaegeLaden(e.target.value);

$("btn-ziel-speichern").onclick = async () => {
  const id = $("wahl-wiki").value;
  const treffer = wikiListe.find((w) => w.id === id);
  if (!treffer) return;

  await zielMerken({
    wikiId: id,
    wikiName: treffer.name,
    section: $("wahl-section").value.trim() || "Allgemein",
  });
  await ablageAnsichtOeffnen();
};

$("btn-ziel-abbrechen").onclick = () => ablageAnsichtOeffnen();
$("btn-ziel-aendern").onclick = () => zielAnsichtOeffnen({ istAenderung: true });
$("btn-ablegen").onclick = ablegen;
$("btn-status-zurueck").onclick = () => {
  $("btn-seite-oeffnen").hidden = true;
  ablageAnsichtOeffnen();
};

// ── Start ─────────────────────────────────────────────────────────

(async function start() {
  if (!(await istEingerichtet())) {
    zeige("ansicht-setup");
    return;
  }
  const cfg = await einstellungenLaden();
  if (!cfg.wikiId) {
    await zielAnsichtOeffnen({ istAenderung: false });
    return;
  }
  await ablageAnsichtOeffnen();
})();
