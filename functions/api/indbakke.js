/**
 * /api/indbakke (Cloudflare Pages Function)
 *
 * Henter ulæste mails og ugens kalender fra Apps Script i Concept X-
 * kontoen. Det går gennem serveren, fordi nøglen ellers ville stå i
 * index.html, hvor enhver kunne læse den.
 *
 * Kræver to environment variables i Cloudflare, type Secret:
 *   GMAIL_URL     Apps Script-adressen, den der ender på /exec
 *   GMAIL_NOEGLE  samme streng som NOEGLE i scriptets Script Properties
 *
 * GET → { poster: [...], aftaler: [...] }  eller  { fejl, ... }
 */

// Tåler små stavefejl i navnet (mellemrum, små bogstaver), fordi
// Cloudflares formular gør dem nemme at lave og svære at se.
const find = (env, navn) => {
  const k = Object.keys(env).find(k => k.trim().toUpperCase() === navn);
  return k ? String(env[k]).trim() : "";
};

export async function onRequestGet({ env }) {
  const svar = (o) => new Response(JSON.stringify(o), {
    headers: { "content-type": "application/json; charset=utf-8" }
  });

  const url = find(env, "GMAIL_URL");
  const noegle = find(env, "GMAIL_NOEGLE");

  // Fejlen vises i kortet, så den skal sige præcis hvilket navn der
  // mangler. Kun navne, aldrig værdier.
  const mangler = [!url && "GMAIL_URL", !noegle && "GMAIL_NOEGLE"].filter(Boolean);
  if (mangler.length) {
    return svar({ fejl: `mangler ${mangler.join(" og ")} i Cloudflare`, poster: [], aftaler: [] });
  }

  try {
    // Apps Script svarer med et redirect til googleusercontent, så
    // redirects skal følges.
    const r = await fetch(`${url}?n=${encodeURIComponent(noegle)}`, { redirect: "follow" });
    if (!r.ok) return svar({ fejl: `Apps Script svarede ${r.status}`, poster: [], aftaler: [] });

    // Kræver Workspace login for at åbne scriptet, får vi en HTML-
    // loginside i stedet for JSON. Det er den fejl der er sværest at se.
    const tekst = await r.text();
    let data;
    try { data = JSON.parse(tekst); }
    catch { return svar({ fejl: "Apps Script svarer ikke med data. Er adgang sat til Alle?", poster: [], aftaler: [] }); }

    if (data.fejl) return svar({ fejl: "GMAIL_NOEGLE passer ikke med NOEGLE i scriptet", poster: [], aftaler: [] });
    return svar({ poster: data.poster || [], aftaler: data.aftaler || [] });
  } catch {
    return svar({ fejl: "kunne ikke hente", poster: [], aftaler: [] });
  }
}
