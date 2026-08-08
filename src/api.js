/**
 * cura-API — die EINZIGE Stelle, die weiss, wie cura angesprochen wird.
 *
 * Auth: persoenlicher API-Key (`sk-gw-…`) als Bearer-Header. cura hat KEIN
 * Session-Cookie — `get_current_user` akzeptiert ausschliesslich Bearer
 * (JWT der Web-App oder API-Key). Eine Extension kann sich deshalb nicht
 * auf eine "eingeloggte Browsersession" stuetzen; der Key ist der einzige
 * Weg, der ohne Login-Formular und auch mit OIDC-Nutzern funktioniert.
 */

import { einstellungenLaden } from "./settings.js";
import { t } from "./i18n.js";

/** Fehler mit auswertbarem Status — das UI unterscheidet 401 von "Server weg". */
export class CuraFehler extends Error {
  constructor(nachricht, status = 0) {
    super(nachricht);
    this.name = "CuraFehler";
    this.status = status;
  }
}

function basisUrlNormalisieren(url) {
  return (url || "").trim().replace(/\/+$/, "");
}

/**
 * Request gegen cura. Wirft CuraFehler mit sprechender Meldung.
 *
 * `istFormData`: bei Multipart darf KEIN Content-Type gesetzt werden —
 * der Browser muss die multipart-Boundary selbst anhaengen.
 */
async function anfrage(pfad, { methode = "GET", koerper = null, istFormData = false } = {}) {
  const cfg = await einstellungenLaden();
  const basis = basisUrlNormalisieren(cfg.baseUrl);

  if (!basis) throw new CuraFehler(t("fehlerKeineUrl"), 0);
  if (!cfg.apiKey) throw new CuraFehler(t("fehlerKeinKey"), 0);

  const headers = { Authorization: `Bearer ${cfg.apiKey}` };
  if (!istFormData && koerper != null) headers["Content-Type"] = "application/json";
  // Workspace-Kontext wie im Web-Frontend (api.ts setzt denselben Header).
  if (cfg.workspaceId) headers["X-Workspace-Id"] = cfg.workspaceId;

  let res;
  try {
    res = await fetch(`${basis}${pfad}`, {
      method: methode,
      headers,
      body: istFormData ? koerper : koerper != null ? JSON.stringify(koerper) : null,
    });
  } catch (e) {
    // Netzwerkebene: falsche URL, Server aus, TLS-Problem, CORS-Preflight tot.
    throw new CuraFehler(t("fehlerNichtErreichbar", { basis }), 0);
  }

  if (res.status === 401 || res.status === 403) {
    throw new CuraFehler(t("fehlerAuth"), res.status);
  }
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j?.detail ? ` — ${typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail)}` : "";
    } catch {
      /* Antwort war kein JSON — Status allein muss reichen. */
    }
    throw new CuraFehler(t("fehlerHttp", { status: res.status, detail }), res.status);
  }

  if (res.status === 204) return null;
  return res.json();
}

/** Verbindungstest fuer die Einstellungsseite: wer bin ich? */
export async function michAbrufen() {
  return anfrage("/api/users/me");
}

/**
 * Sichtbare MANUELLE Wikis (Tabelle ``wikis``).
 *
 * Wichtig zur Abgrenzung: das LLM-Wiki eines THEMAS steht hier NICHT drin —
 * es besteht aus ``knowledge_pages`` mit gesetzter ``theme_id`` und hat gar
 * keine Zeile in ``wikis``. Themen kommen deshalb aus ``themenLaden``.
 */
export async function wikisLaden() {
  const liste = await anfrage("/api/wikis");
  return (Array.isArray(liste) ? liste : []).map((w) => ({
    art: "wiki",
    id: w.id,
    name: w.name,
    themeId: w.theme_id ?? null,
    istThemenGebunden: Boolean(w.theme_id),
    darfSchreiben: w.ist_eigenes !== false || w.member_can_edit !== false,
  }));
}

/** Workspaces des Nutzers — Einstieg fuer die Themen-Abfrage. */
export async function workspacesLaden() {
  const liste = await anfrage("/api/workspaces");
  return (Array.isArray(liste) ? liste : []).map((w) => ({ id: w.id, name: w.name }));
}

/**
 * Themen mit aktiviertem LLM-Wiki. Ziel "Thema" bedeutet: das Clipping
 * landet im themenbezogenen Wiki bzw. bei den Artefakten des Themas.
 *
 * Ohne konfigurierten Workspace werden alle zugaenglichen abgeklappert —
 * bei einem einzelnen Workspace ist das genau eine Zusatzabfrage.
 */
export async function themenLaden() {
  const cfg = await einstellungenLaden();
  const wsIds = cfg.workspaceId
    ? [cfg.workspaceId]
    : (await workspacesLaden()).map((w) => w.id);

  const treffer = [];
  for (const wsId of wsIds) {
    let themen;
    try {
      themen = await anfrage(`/api/workspaces/${wsId}/themes`);
    } catch {
      continue; // ein unzugaenglicher Workspace darf den Rest nicht kippen
    }
    // NICHT ``t`` als Laufvariable: das verdeckt die Uebersetzungsfunktion.
    for (const thema of Array.isArray(themen) ? themen : []) {
      if (thema.wiki_enabled === false) continue; // ohne Wiki kein sinnvolles Ziel
      treffer.push({ art: "thema", id: thema.id, name: thema.name, workspaceId: wsId });
    }
  }
  return treffer;
}

/**
 * Alle Ablage-Ziele in einer Liste: manuelle Wikis + Themen.
 *
 * Schlaegt ein Zweig fehl, wird der andere trotzdem geliefert — sonst
 * blockiert ein fehlendes Recht auf Themen die gesamte Auswahl.
 */
export async function zieleLaden() {
  const [wikis, themen] = await Promise.all([
    wikisLaden().catch(() => []),
    themenLaden().catch(() => []),
  ]);
  return { wikis, themen };
}

/**
 * Bereits vergebene Sections eines Wikis — als Vorschlagsliste.
 * Seiten ohne Section zaehlen als "Allgemein" (Backend: NULL/leer = Allgemein).
 */
export async function sectionsLaden(wikiId) {
  const seiten = await anfrage(`/api/wikis/${wikiId}/pages`);
  const allg = t("allgemein");
  const namen = new Set();
  for (const s of Array.isArray(seiten) ? seiten : []) {
    const sec = (s.section || "").trim();
    namen.add(sec || allg);
  }
  namen.add(allg); // immer anbieten, auch im leeren Wiki
  return [...namen].sort((a, b) =>
    a === allg ? -1 : b === allg ? 1 : a.localeCompare(b),
  );
}

/**
 * Die eigentliche Ablage: Screenshot + URL + Seitentext an cura geben.
 *
 * Zwei Routen im Backend (beide vorhanden):
 *   manuelles Wiki → POST /api/wikis/{id}/capture                      (mit section)
 *   Thema          → POST /api/workspaces/{ws}/themes/{id}/capture     (ohne section)
 *
 * multipart/form-data; Antwort {artifact_id, status, page_url?}.
 */
export async function seiteAblegen({
  zielArt, zielId, zielWorkspaceId, section, url, titel,
  seitenText, screenshotBlob, mhtmlBlob,
}) {
  const fd = new FormData();
  fd.append("source_url", url);
  fd.append("title", titel || "");
  if (seitenText) fd.append("page_text", seitenText);
  fd.append("screenshot", screenshotBlob, "screenshot.png");
  // Vollarchiv der Seite — optional, fehlt bei zu grossen oder gesperrten
  // Seiten. Das Backend muss ohne auskommen.
  if (mhtmlBlob) fd.append("mhtml", mhtmlBlob, "seite.mhtml");

  // Zwei Zielarten, zwei Routen — die Section gibt es nur im manuellen Wiki.
  // Die Themen-Route haengt am Workspace-Router (``/api/workspaces/…``), nicht
  // unter ``/api/themes``: dort liegt nur der Papierkorb-Router.
  let pfad;
  if (zielArt === "thema") {
    if (!zielWorkspaceId) {
      throw new CuraFehler(t("fehlerWsFehlt"), 0);
    }
    pfad = `/api/workspaces/${zielWorkspaceId}/themes/${zielId}/capture`;
  } else {
    pfad = `/api/wikis/${zielId}/capture`;
    fd.append("section", section || t("allgemein"));
  }

  try {
    return await anfrage(pfad, {
      methode: "POST",
      koerper: fd,
      istFormData: true,
    });
  } catch (e) {
    if (e instanceof CuraFehler && e.status === 404) {
      // 404 heisst hier NICHT mehr "Endpoint fehlt" — beide Capture-Routen
      // sind im Backend vorhanden. Viel wahrscheinlicher: das gemerkte Ziel
      // wurde in cura geloescht oder umgehaengt.
      throw new CuraFehler(t("fehlerZielWeg"), 404);
    }
    throw e;
  }
}
