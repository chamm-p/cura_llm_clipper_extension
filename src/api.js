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

  if (!basis) throw new CuraFehler("Keine cura-URL hinterlegt — bitte in den Einstellungen setzen.", 0);
  if (!cfg.apiKey) throw new CuraFehler("Kein API-Key hinterlegt — bitte in den Einstellungen setzen.", 0);

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
    throw new CuraFehler(
      `cura ist unter ${basis} nicht erreichbar. URL und Erreichbarkeit pruefen.`,
      0,
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new CuraFehler(
      "Anmeldung abgelehnt (401/403). API-Key pruefen — er muss ein persoenlicher "
        + "Key aus cura → Einstellungen → API & Gateway sein.",
      res.status,
    );
  }
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j?.detail ? ` — ${typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail)}` : "";
    } catch {
      /* Antwort war kein JSON — Status allein muss reichen. */
    }
    throw new CuraFehler(`cura antwortete mit HTTP ${res.status}${detail}`, res.status);
  }

  if (res.status === 204) return null;
  return res.json();
}

/** Verbindungstest fuer die Einstellungsseite: wer bin ich? */
export async function michAbrufen() {
  return anfrage("/api/users/me");
}

/**
 * Sichtbare Wikis. Themenlose und themengebundene zusammen — das Backend
 * filtert bereits auf das, was der Nutzer sehen darf.
 */
export async function wikisLaden() {
  const liste = await anfrage("/api/wikis");
  return (Array.isArray(liste) ? liste : []).map((w) => ({
    id: w.id,
    name: w.name,
    themeId: w.theme_id ?? null,
    istThemenGebunden: Boolean(w.theme_id),
    darfSchreiben: w.ist_eigenes !== false || w.member_can_edit !== false,
  }));
}

/**
 * Bereits vergebene Sections eines Wikis — als Vorschlagsliste.
 * Seiten ohne Section zaehlen als "Allgemein" (Backend: NULL/leer = Allgemein).
 */
export async function sectionsLaden(wikiId) {
  const seiten = await anfrage(`/api/wikis/${wikiId}/pages`);
  const namen = new Set();
  for (const s of Array.isArray(seiten) ? seiten : []) {
    const sec = (s.section || "").trim();
    namen.add(sec || "Allgemein");
  }
  namen.add("Allgemein"); // immer anbieten, auch im leeren Wiki
  return [...namen].sort((a, b) =>
    a === "Allgemein" ? -1 : b === "Allgemein" ? 1 : a.localeCompare(b, "de"),
  );
}

/**
 * Die eigentliche Ablage: Screenshot + URL + Seitentext an cura geben.
 *
 * ACHTUNG — dieser Endpoint existiert im Backend NOCH NICHT. Er ist als
 * Entwicklungsauftrag an das Projekt "smart" uebergeben (docs/AUFTRAG-CURA-BACKEND.md).
 * Erwarteter Vertrag: multipart/form-data, Felder wie unten; Antwort
 * {artifact_id, page_slug?, status}. Bis dahin meldet die Extension einen
 * klaren 404 statt still zu scheitern.
 */
export async function seiteAblegen({ wikiId, section, url, titel, seitenText, screenshotBlob }) {
  const fd = new FormData();
  fd.append("source_url", url);
  fd.append("title", titel || "");
  fd.append("section", section || "Allgemein");
  if (seitenText) fd.append("page_text", seitenText);
  fd.append("screenshot", screenshotBlob, "screenshot.png");

  try {
    return await anfrage(`/api/wikis/${wikiId}/capture`, {
      methode: "POST",
      koerper: fd,
      istFormData: true,
    });
  } catch (e) {
    if (e instanceof CuraFehler && e.status === 404) {
      throw new CuraFehler(
        "Der Capture-Endpoint fehlt im cura-Backend (404). Die Backend-Erweiterung "
          + "aus docs/AUFTRAG-CURA-BACKEND.md ist dort noch nicht eingespielt.",
        404,
      );
    }
    throw e;
  }
}
