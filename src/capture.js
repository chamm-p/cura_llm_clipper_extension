/**
 * Erfassung des aktiven Tabs: Screenshot des sichtbaren Bereichs + Volltext.
 *
 * Warum beides? Der Screenshot faengt das LAYOUT (Tabellen, Diagramme,
 * Hervorhebungen) — den kann nur ein Vision-Modell lesen. Der Text faengt
 * den GANZEN Artikel, auch was unterhalb des Viewports liegt. Zusammen
 * ergibt das einen brauchbaren Wiki-Eintrag auch bei langen Seiten, ohne
 * scrollende Stitching-Tricks, die an sticky Headern und Lazy-Loading
 * zerbrechen.
 */

import { t } from "./i18n.js";

/** Seiten, auf denen Extensions per Browser-Richtlinie nicht arbeiten duerfen. */
const GESPERRT = [
  /^chrome:\/\//i,
  /^chrome-extension:\/\//i,
  /^edge:\/\//i,
  /^brave:\/\//i,
  /^about:/i,
  /^devtools:\/\//i,
  /^view-source:/i,
  /^https:\/\/chromewebstore\.google\.com/i,
  /^https:\/\/chrome\.google\.com\/webstore/i,
  /^https:\/\/microsoftedge\.microsoft\.com\/addons/i,
];

export function seiteIstSperrgebiet(url) {
  return GESPERRT.some((re) => re.test(url || ""));
}

/** Aktiver Tab im aktuellen Fenster. */
export async function aktivenTabHolen() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error(t("fehlerKeinTab"));
  if (seiteIstSperrgebiet(tab.url)) {
    throw new Error(t("fehlerSperrgebiet"));
  }
  return tab;
}

/**
 * Screenshot des sichtbaren Bereichs als PNG-Blob.
 *
 * `captureVisibleTab` liefert eine data-URL; wir wandeln sie in einen Blob,
 * weil FormData sonst den base64-String als Textfeld verschicken wuerde.
 */
export async function screenshotHolen(windowId) {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
    format: "png",
  });
  const res = await fetch(dataUrl);
  return res.blob();
}

/**
 * Im Seitenkontext ausgefuehrt: Titel + lesbarer Volltext.
 *
 * Bewusst KEIN Readability-Import — eine Extension, die eine fremde Lib
 * mitschleppt, muss sie auch pflegen. Die Heuristik hier reicht: bevorzugt
 * <article>/<main>, sonst <body>; Navigation, Skripte und Rauschen fliegen
 * raus. Was die Heuristik verfehlt, faengt der Screenshot ab.
 */
export function textAusSeiteExtrahieren() {
  const WEG = "script,style,noscript,nav,header,footer,aside,iframe,svg,form,button,[aria-hidden='true']";

  const quelle =
    document.querySelector("article")
    || document.querySelector("main")
    || document.querySelector("[role='main']")
    || document.body;

  // Auf einer Kopie arbeiten, damit die echte Seite unveraendert bleibt.
  const klon = quelle.cloneNode(true);
  klon.querySelectorAll(WEG).forEach((el) => el.remove());

  const text = (klon.innerText || "")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const beschreibung =
    document.querySelector("meta[name='description']")?.content
    || document.querySelector("meta[property='og:description']")?.content
    || "";

  return {
    titel: (document.title || "").trim(),
    beschreibung: beschreibung.trim(),
    text,
  };
}

/** Maximaler Textumfang — darueber hinaus liest ohnehin kein Modell mehr mit. */
const MAX_TEXT = 40000;

/**
 * Volltext des Tabs holen. Schlaegt die Injektion fehl (CSP, PDF-Viewer,
 * gesperrter Frame), ist das NICHT fatal: der Screenshot allein traegt den
 * Eintrag weiterhin.
 */
export async function seitenTextHolen(tabId) {
  try {
    const [treffer] = await chrome.scripting.executeScript({
      target: { tabId },
      func: textAusSeiteExtrahieren,
    });
    const r = treffer?.result;
    if (!r) return { titel: "", beschreibung: "", text: "", gekuerzt: false };

    const gekuerzt = r.text.length > MAX_TEXT;
    return {
      titel: r.titel,
      beschreibung: r.beschreibung,
      text: gekuerzt ? `${r.text.slice(0, MAX_TEXT)}\n\n…[gekuerzt]` : r.text,
      gekuerzt,
    };
  } catch {
    return { titel: "", beschreibung: "", text: "", gekuerzt: false };
  }
}

/** Obergrenze fuer das MHTML-Archiv. Darueber wird es weggelassen. */
const MAX_MHTML_BYTES = 25 * 1024 * 1024;

/**
 * Vollstaendiges Seitenarchiv als MHTML (Seite samt Bildern, CSS, Fonts in
 * EINER Datei). Ergaenzt Screenshot und Text um das, was beide nicht koennen:
 * die Seite spaeter originalgetreu wieder anzeigen.
 *
 * `null`, wenn die Aufnahme scheitert oder zu gross ist — das Clipping soll
 * daran nicht scheitern, Screenshot und Text tragen den Eintrag weiterhin.
 */
export async function mhtmlHolen(tabId) {
  if (!chrome.pageCapture?.saveAsMHTML) return null; // z.B. Firefox
  try {
    const blob = await new Promise((auf, ab) => {
      chrome.pageCapture.saveAsMHTML({ tabId }, (ergebnis) => {
        const fehler = chrome.runtime.lastError;
        if (fehler) ab(new Error(fehler.message));
        else auf(ergebnis);
      });
    });
    if (!blob || blob.size > MAX_MHTML_BYTES) return null;
    return blob;
  } catch {
    return null;
  }
}

/** Alles in einem Rutsch: Tab, Screenshot, Text, MHTML-Archiv. */
export async function seiteErfassen() {
  const tab = await aktivenTabHolen();
  // MHTML bewusst NICHT parallel: `saveAsMHTML` haelt die Seite kurz an, und
  // ein gleichzeitiger `captureVisibleTab` liefert dann gern ein weisses Bild.
  const [screenshot, seite] = await Promise.all([
    screenshotHolen(tab.windowId),
    seitenTextHolen(tab.id),
  ]);
  const mhtml = await mhtmlHolen(tab.id);

  return {
    url: tab.url,
    titel: seite.titel || tab.title || tab.url,
    beschreibung: seite.beschreibung,
    text: seite.text,
    textGekuerzt: seite.gekuerzt,
    screenshot,
    mhtml,
  };
}
