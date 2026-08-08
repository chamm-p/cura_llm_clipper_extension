/**
 * Einstellungen + gemerktes Ziel.
 *
 * `chrome.storage.sync` statt `local`: das Ziel-Wiki soll auf allen Rechnern
 * gleich sein, an denen derselbe Browser-Account haengt. Faellt der Browser
 * ohne sync-Backend aus (manche Chromium-Builds), springt `local` ein.
 *
 * Der API-Key liegt bewusst NICHT im Sync-Bereich: ein Zugangsschluessel
 * gehoert nicht in ein Cloud-Profil, das man beim Einrichten eines fremden
 * Rechners nebenbei mitzieht. Er bleibt geraetelokal.
 */

const SYNC_SCHLUESSEL = "cura_clipper_settings";
const LOCAL_SCHLUESSEL = "cura_clipper_secret";

const STANDARD = {
  baseUrl: "",
  workspaceId: "",
  // Gemerktes Ziel — leer bedeutet "beim ersten Mal fragen".
  // ``zielArt``: "wiki" = manuelles Wiki, "thema" = themenbezogenes LLM-Wiki.
  // ``wikiId`` traegt in beiden Faellen die ID des Ziels.
  zielArt: "wiki",
  wikiId: "",
  wikiName: "",
  section: "Allgemein",
  // Nach dem Ablegen die erzeugte Seite oeffnen?
  nachAblageOeffnen: false,
};

function speicherHolen(bereich) {
  // Firefox/Brave liefern chrome.storage ebenfalls — der Fallback greift nur,
  // wenn ein Bereich wirklich fehlt.
  return chrome.storage?.[bereich] ?? chrome.storage.local;
}

export async function einstellungenLaden() {
  const [sync, local] = await Promise.all([
    speicherHolen("sync").get(SYNC_SCHLUESSEL),
    speicherHolen("local").get(LOCAL_SCHLUESSEL),
  ]);
  return {
    ...STANDARD,
    ...(sync?.[SYNC_SCHLUESSEL] || {}),
    apiKey: local?.[LOCAL_SCHLUESSEL]?.apiKey || "",
  };
}

/**
 * Speichert. `apiKey` wird herausgeloest und geraetelokal abgelegt,
 * alles andere wandert in den Sync-Bereich.
 */
export async function einstellungenSpeichern(teil) {
  const { apiKey, ...rest } = teil;

  if (Object.keys(rest).length) {
    const aktuell = await speicherHolen("sync").get(SYNC_SCHLUESSEL);
    await speicherHolen("sync").set({
      [SYNC_SCHLUESSEL]: { ...STANDARD, ...(aktuell?.[SYNC_SCHLUESSEL] || {}), ...rest },
    });
  }

  if (apiKey !== undefined) {
    await speicherHolen("local").set({ [LOCAL_SCHLUESSEL]: { apiKey } });
  }
}

/** Ist die Extension grundsaetzlich einsatzbereit (URL + Key gesetzt)? */
export async function istEingerichtet() {
  const c = await einstellungenLaden();
  return Boolean(c.baseUrl && c.apiKey);
}

/** Steht ein Ziel fest, oder muss beim ersten Mal gefragt werden? */
export async function hatZiel() {
  const c = await einstellungenLaden();
  return Boolean(c.wikiId);
}

/** Ziel merken — genau das, was beim ersten Mal abgefragt wurde. */
export async function zielMerken({ zielArt, wikiId, wikiName, section }) {
  await einstellungenSpeichern({
    zielArt: zielArt || "wiki",
    wikiId,
    wikiName,
    // Beim Thema bleibt die Section bewusst leer statt "Allgemein" —
    // sonst suggeriert die Anzeige einen Bereich, den es dort nicht gibt.
    section: zielArt === "thema" ? "" : section || "Allgemein",
  });
}
