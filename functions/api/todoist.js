/**
 * /api/todoist (Cloudflare Pages Function)
 *
 * Henter Todoist-opgaver der er forfaldne eller skal klares i dag, til
 * kortet "Kræver handling". Det går gennem serveren, fordi tokenet
 * giver fuld adgang til hele din Todoist og ikke må stå i index.html.
 *
 * Kræver én environment variable i Cloudflare, type Secret:
 *   TODOIST_TOKEN   fra ARBEJDS-Todoist, ikke den private.
 *                   Todoist → Indstillinger → Integrationer → Udvikler
 *
 * GET → { opgaver: [{ id, titel, dato, forfalden, prioritet, link }] }
 */

// API v1. Den gamle REST v2 er lukket.
const URL_FILTER = "https://api.todoist.com/api/v1/tasks/filter";

export async function onRequestGet({ env }) {
  const svar = (o) => new Response(JSON.stringify(o), {
    headers: { "content-type": "application/json; charset=utf-8" }
  });

  // Tåler små stavefejl i navnet (mellemrum, små bogstaver), fordi
  // Cloudflares formular gør dem nemme at lave og svære at se.
  const noegle = Object.keys(env).find(k => k.trim().toUpperCase() === "TODOIST_TOKEN")
              || Object.keys(env).find(k => /todoist/i.test(k));
  const token = noegle ? String(env[noegle]).trim() : "";

  if (!token){
    // Fejlen vises i kortets fod, så den skal sige præcis hvad der er galt.
    // Kun NAVNE, aldrig værdier.
    const fejl = noegle
      ? `${noegle.trim()} findes men er tom`
      : `ingen TODOIST_TOKEN (ser ${Object.keys(env).filter(k => /^[A-Z_]+$/.test(k) && k !== "ASSETS").join(", ") || "ingen"})`;
    return svar({ fejl, opgaver: [] });
  }

  try {
    // "overdue | today" er Todoists egen filtersyntaks, så Todoist
    // afgør selv hvad i dag er i din tidszone.
    const r = await fetch(`${URL_FILTER}?query=${encodeURIComponent("overdue | today")}&limit=50`, {
      headers: { authorization: `Bearer ${token}` }
    });
    if (r.status === 401 || r.status === 403) return svar({ fejl: "tokenet virker ikke", opgaver: [] });
    // Statuskoden med i fejlen, så et browserkald viser hvad Todoist sagde.
    if (!r.ok) return svar({ fejl: `Todoist svarede ${r.status}`, opgaver: [] });

    const data = await r.json();
    const idag = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });

    const opgaver = (data.results || []).map(t => {
      const dato = (t.due?.date || "").slice(0, 10);
      return {
        id: t.id,
        // Opgaver lavet fra Gmail er markdown-links: "[Følg op](https://mail...)".
        titel: String(t.content || "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").trim(),
        dato,
        forfalden: dato !== "" && dato < idag,
        // Todoist vender det om: 4 er højest i API'et, vist som P1 i appen.
        prioritet: 5 - (t.priority || 1),
        link: `https://app.todoist.com/app/task/${t.id}`
      };
    })
    // Dagens først, så de nyeste forfaldne. Gamle glemte opgaver fra
    // for måneder siden skal ikke skubbe det aktuelle ud af kortet.
    .sort((a, b) => (a.forfalden - b.forfalden) || b.dato.localeCompare(a.dato) || a.prioritet - b.prioritet);

    return svar({ opgaver, antal: opgaver.length });
  } catch {
    return svar({ fejl: "kunne ikke hente", opgaver: [] });
  }
}
