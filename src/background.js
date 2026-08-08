/**
 * Service Worker.
 *
 * Haelt sich bewusst kurz: das Ablegen laeuft im Popup, weil es dort einen
 * sichtbaren Fortschritt und eine Fehlermeldung geben kann. Der Worker
 * uebernimmt nur, was ohne offenes Popup passieren muss — das Kontextmenue
 * und den Erst-Setup-Hinweis nach der Installation.
 *
 * MV3-Regel: der Worker schlaeft jederzeit ein. Deshalb wird das Menue bei
 * JEDEM Start neu registriert (`onInstalled` allein reicht nicht, wenn der
 * Browser den Worker zwischendurch verwirft).
 */

const MENUE_ID = "cura-clipper-ablegen";

const MENUE_TITEL = {
  de: "Seite in cura-Wiki ablegen",
  en: "Save page to cura wiki",
};

/**
 * Menue anlegen. Die Sprache kommt direkt aus dem Speicher statt ueber
 * ``i18n.js``: der Worker laeuft ohne DOM und wird staendig beendet — ein
 * Modul-Import fuer einen einzigen Text lohnt hier nicht.
 */
function menueAnlegen() {
  chrome.storage.sync.get("cura_clipper_settings", (daten) => {
    const sprache = daten?.cura_clipper_settings?.sprache === "en" ? "en" : "de";
    // `removeAll` zuerst: ein zweites `create` mit gleicher ID wuerde sonst
    // "duplicate id" werfen und die Registrierung abbrechen.
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: MENUE_ID,
        title: MENUE_TITEL[sprache],
        contexts: ["page", "selection", "image", "link"],
      });
    });
  });
}

// Sprache umgestellt → Menuetitel nachziehen.
chrome.storage.onChanged.addListener((aenderungen, bereich) => {
  if (bereich === "sync" && aenderungen.cura_clipper_settings) menueAnlegen();
});

chrome.runtime.onInstalled.addListener((details) => {
  menueAnlegen();
  // Beim ersten Installieren direkt in die Einstellungen — ohne URL und Key
  // kann die Extension ohnehin nichts tun.
  if (details.reason === "install") chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup?.addListener(menueAnlegen);

/**
 * Kontextmenue oeffnet das Popup. Absicht: die Ablage soll dieselbe
 * Rueckmeldung geben wie ueber den Symbolklick — ein stilles Ablegen ohne
 * Fenster liesse den Nutzer im Unklaren, ob es geklappt hat.
 *
 * `openPopup` gibt es erst ab Chrome 127 und nicht in jedem Chromium-Derivat;
 * schlaegt es fehl, oeffnen wir die Einstellungen als sichtbaren Anker.
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENUE_ID) return;
  try {
    await chrome.action.openPopup({ windowId: tab?.windowId });
  } catch {
    chrome.runtime.openOptionsPage();
  }
});
