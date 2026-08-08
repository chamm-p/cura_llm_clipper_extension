/**
 * Zweisprachigkeit (DE/EN) mit eigenem Schalter.
 *
 * BEWUSST NICHT Chromes ``_locales``/``chrome.i18n``: das richtet sich nach
 * der Browsersprache und laesst sich nicht per Einstellung umschalten — genau
 * das war aber die Anforderung. Ausserdem waere fuer jede Sprache ein eigenes
 * Verzeichnis noetig, was bei zwei Sprachen und ~60 Texten mehr Aufwand als
 * Nutzen bringt.
 *
 * Aufbau: ein Schluessel pro Text, beide Sprachen nebeneinander — so faellt
 * beim Bearbeiten sofort auf, wenn eine Seite fehlt.
 *
 * Platzhalter ``{name}`` werden von ``t()`` ersetzt.
 */

const TEXTE = {
  // ── Kopf / allgemein ──
  marke:                 { de: "cura Clipper",            en: "cura Clipper" },
  curaOeffnen:           { de: "{basis} oeffnen",         en: "Open {basis}" },
  curaOhneAdresse:       { de: "Noch keine cura-Adresse hinterlegt",
                           en: "No cura address configured yet" },
  einstellungen:         { de: "Einstellungen",           en: "Settings" },

  // ── Setup ──
  setupHinweis:          { de: "Noch nicht eingerichtet. cura-Adresse und persoenlicher API-Key fehlen.",
                           en: "Not set up yet. The cura address and your personal API key are missing." },
  setupKnopf:            { de: "Einstellungen oeffnen",   en: "Open settings" },

  // ── Ziel-Auswahl ──
  zielFrageErst:         { de: "Wohin sollen die Seiten abgelegt werden? Die Auswahl wird gemerkt.",
                           en: "Where should pages be filed? Your choice is remembered." },
  zielFrageAendern:      { de: "Neues Ziel fuer kuenftige Ablagen waehlen.",
                           en: "Choose a new destination for future clippings." },
  zielLabel:             { de: "Ziel",                    en: "Destination" },
  sectionLabel:          { de: "Bereich (Section)",       en: "Section" },
  gruppeWikis:           { de: "Manuelle Wikis",          en: "Manual wikis" },
  gruppeThemen:          { de: "Themen",                  en: "Topics" },
  anThema:               { de: "{name} (an Thema)",       en: "{name} (attached to topic)" },
  merkenWeiter:          { de: "Merken & weiter",         en: "Remember & continue" },
  abbrechen:             { de: "Abbrechen",               en: "Cancel" },
  laedt:                 { de: "lade…",                   en: "loading…" },
  allgemein:             { de: "Allgemein",               en: "General" },
  keineZiele:            { de: "Keine Ablage-Ziele gefunden. In cura zuerst ein Wiki oder ein Thema anlegen — oder pruefen, ob der API-Key zum richtigen Konto gehoert.",
                           en: "No destinations found. Create a wiki or topic in cura first — or check that the API key belongs to the right account." },

  // ── Ablage ──
  zielAendern:           { de: "aendern",                 en: "change" },
  ablegenKnopf:          { de: "In cura ablegen",         en: "Save to cura" },
  erfassungsInfo:        { de: "Erfasst wird der sichtbare Bereich als Bild plus der Seitentext.",
                           en: "Captures the visible area as an image plus the page text." },

  // ── Status ──
  wirdErfasst:           { de: "Seite wird erfasst…",     en: "Capturing page…" },
  wirdUebergeben:        { de: "Wird an cura uebergeben…", en: "Sending to cura…" },
  abgelegtIn:            { de: "Abgelegt in {wohin}.",    en: "Saved to {wohin}." },
  auswertungLaeuft:      { de: "cura wertet den Screenshot jetzt aus — bis der Eintrag im Wiki sichtbar ist, dauert es meist ein bis zwei Minuten.",
                           en: "cura is analysing the screenshot — it usually takes one to two minutes before the entry appears in the wiki." },
  themaWohin:            { de: "Thema '{name}'",          en: "topic '{name}'" },
  wikiWohin:             { de: "'{name}' · {section}",    en: "'{name}' · {section}" },
  textGekuerzt:          { de: "(Seitentext war sehr lang und wurde gekuerzt.)",
                           en: "(The page text was very long and has been truncated.)" },
  ohneArchiv:            { de: "(Vollarchiv der Seite nicht moeglich — Bild und Text wurden abgelegt.)",
                           en: "(Full page archive not possible — image and text were saved.)" },
  imZielOeffnen:         { de: "In {name} oeffnen",       en: "Open in {name}" },
  zurueck:               { de: "Zurueck",                 en: "Back" },
  startFehler:           { de: "Start fehlgeschlagen: {fehler}\n\nAuf chrome://extensions das Neu-laden-Symbol druecken. Bleibt es dabei, die Erweiterung entfernen und erneut laden.",
                           en: "Startup failed: {fehler}\n\nPress the reload icon on chrome://extensions. If it persists, remove the extension and load it again." },

  // ── Fehler (api.js) ──
  fehlerKeineUrl:        { de: "Keine cura-URL hinterlegt — bitte in den Einstellungen setzen.",
                           en: "No cura URL configured — please set it in the settings." },
  fehlerKeinKey:         { de: "Kein API-Key hinterlegt — bitte in den Einstellungen setzen.",
                           en: "No API key configured — please set it in the settings." },
  fehlerNichtErreichbar: { de: "cura ist unter {basis} nicht erreichbar. URL und Erreichbarkeit pruefen.",
                           en: "cura is unreachable at {basis}. Check the URL and whether the server is up." },
  fehlerAuth:            { de: "Anmeldung abgelehnt (401/403). API-Key pruefen — er muss ein persoenlicher Key aus cura → Einstellungen → API & Gateway sein.",
                           en: "Authentication rejected (401/403). Check the API key — it must be a personal key from cura → Settings → API & Gateway." },
  fehlerHttp:            { de: "cura antwortete mit HTTP {status}{detail}",
                           en: "cura responded with HTTP {status}{detail}" },
  fehlerZielWeg:         { de: "Ziel nicht gefunden (404). Das gemerkte Wiki bzw. Thema gibt es in cura nicht mehr — bitte im Popup auf 'aendern' ein neues Ziel waehlen.",
                           en: "Destination not found (404). The remembered wiki or topic no longer exists in cura — pick a new one via 'change' in the popup." },
  fehlerWsFehlt:         { de: "Zum gemerkten Thema fehlt die Workspace-Zuordnung. Bitte das Ziel einmal neu auswaehlen (im Popup auf 'aendern').",
                           en: "The remembered topic is missing its workspace reference. Please select the destination again (via 'change' in the popup)." },

  // ── Erfassung (capture.js) ──
  fehlerKeinTab:         { de: "Kein aktiver Tab gefunden.", en: "No active tab found." },
  fehlerSperrgebiet:     { de: "Diese Seite ist fuer Erweiterungen gesperrt (Browser-interne Seite oder Web Store). Auf einer normalen Webseite erneut versuchen.",
                           en: "Extensions are blocked on this page (browser-internal page or web store). Try again on a regular website." },

  // ── Einstellungsseite ──
  optUnterzeile:         { de: "Webseiten als Screenshot + Text ins cura-Wiki ablegen.",
                           en: "File web pages into the cura wiki as screenshot + text." },
  optVerbindung:         { de: "Verbindung",              en: "Connection" },
  optAdresse:            { de: "cura-Adresse",            en: "cura address" },
  optAdresseHilfe:       { de: "Basis-URL ohne Pfad — dieselbe, unter der du cura im Browser aufrufst.",
                           en: "Base URL without a path — the same one you use to open cura in the browser." },
  optKey:                { de: "Persoenlicher API-Key",   en: "Personal API key" },
  optKeyHilfe:           { de: "In cura unter Einstellungen → API & Gateway erzeugen. Der Key wird nur auf diesem Geraet gespeichert, nicht im Browser-Sync.",
                           en: "Create it in cura under Settings → API & Gateway. The key is stored on this device only, never in browser sync." },
  optWorkspace:          { de: "Workspace-ID (optional)", en: "Workspace ID (optional)" },
  optWorkspaceHilfe:     { de: "Nur noetig, wenn dein Konto mehrere Workspaces hat.",
                           en: "Only needed if your account has multiple workspaces." },
  optTesten:             { de: "Verbindung testen",       en: "Test connection" },
  optTestet:             { de: "teste…",                  en: "testing…" },
  optVerbundenAls:       { de: "Verbunden als {name}.",   en: "Connected as {name}." },
  optZiel:               { de: "Ablage-Ziel",             en: "Destination" },
  optZielHinweis:        { de: "Wird beim ersten Ablegen abgefragt und dann gemerkt. Hier aenderbar.",
                           en: "Asked the first time you file a page, then remembered. Changeable here." },
  optZielHilfe:          { de: "Manuelles Wiki = eigene Sammlung mit Bereichen. Thema = Ablage im themenbezogenen Wiki.",
                           en: "Manual wiki = your own collection with sections. Topic = filed into the topic's wiki." },
  optSectionHilfe:       { de: "Leer = Allgemein. Nur bei manuellen Wikis.",
                           en: "Empty = General. Manual wikis only." },
  optZieleLaden:         { de: "Ziele neu laden",         en: "Reload destinations" },
  optLaedtZiele:         { de: "lade Ziele…",             en: "loading destinations…" },
  optSprache:            { de: "Sprache",                 en: "Language" },
  optSpracheHilfe:       { de: "Sprache der Erweiterung. Wirkt sofort.",
                           en: "Language of the extension. Takes effect immediately." },
  optSpeichern:          { de: "Speichern",               en: "Save" },
  optGespeichert:        { de: "Gespeichert.",            en: "Saved." },
  optKeineZiele:         { de: "— keine Ziele gefunden —", en: "— no destinations found —" },
  optAbrufFehler:        { de: "— Abruf fehlgeschlagen —", en: "— fetch failed —" },
  optNochNicht:          { de: "— noch nicht geladen —",  en: "— not loaded yet —" },
  optUnbekannt:          { de: "unbekannt",               en: "unknown" },
  optFehler:             { de: "Fehler: {fehler}",        en: "Error: {fehler}" },
};

/** Aktive Sprache dieses Fensters. Wird von ``spracheSetzen`` gefuellt. */
let aktuelleSprache = "de";

/** Sprache festlegen (aus den Einstellungen). */
export function spracheSetzen(code) {
  aktuelleSprache = code === "en" ? "en" : "de";
}

export function spracheHolen() {
  return aktuelleSprache;
}

/**
 * Text holen. ``{platzhalter}`` werden aus ``werte`` ersetzt.
 *
 * Fehlt ein Schluessel, wird er selbst zurueckgegeben — das faellt in der
 * Oberflaeche sofort auf, statt eine leere Stelle zu hinterlassen.
 */
export function t(schluessel, werte = {}) {
  const eintrag = TEXTE[schluessel];
  if (!eintrag) return schluessel;
  let text = eintrag[aktuelleSprache] ?? eintrag.de ?? schluessel;
  for (const [k, v] of Object.entries(werte)) {
    text = text.replaceAll(`{${k}}`, String(v));
  }
  return text;
}

/**
 * Alle Elemente mit ``data-t="schluessel"`` im Dokument beschriften.
 * Spart es, jede Beschriftung einzeln im Code anzufassen.
 */
export function seiteBeschriften(wurzel = document) {
  for (const el of wurzel.querySelectorAll("[data-t]")) {
    el.textContent = t(el.dataset.t);
  }
  for (const el of wurzel.querySelectorAll("[data-t-title]")) {
    el.title = t(el.dataset.tTitle);
  }
  for (const el of wurzel.querySelectorAll("[data-t-platzhalter]")) {
    el.placeholder = t(el.dataset.tPlatzhalter);
  }
}
