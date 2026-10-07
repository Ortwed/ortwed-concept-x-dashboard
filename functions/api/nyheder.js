/**
 * /api/nyheder (Cloudflare Pages Function)
 *
 * Browseren må ikke hente RSS fra andre domæner (CORS), så den del
 * sker her på serveren. Ingen nøgler, ingen hemmeligheder.
 *
 * Branchen og fodbolden hentes direkte fra mediernes egne RSS-feeds,
 * alle artikler, nyeste først. Google News bruges kun som reserve,
 * fordi dens site:-søgning gav tomme lister for de her medier.
 *
 * POST { virksomheder: ["Matas", "Salling Group"] }   (valgfrit)
 * GET  virker også, så man kan teste i browseren.
 * →    { ai, marked, fodbold, kunder, antal, kilder }
 */

const GNEWS = "https://news.google.com/rss/search";

// Hvor længe Cloudflare må genbruge et svar. Nyheder haster ikke så meget.
const CACHE_SEK = 1800;

function feed(q, { hl = "da", gl = "DK", ceid = "DK:da" } = {}){
  return `${GNEWS}?q=${encodeURIComponent(q)}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
}

/* Medierne. Feed-adresserne er ikke dokumenteret ens nogen steder, så
   hvert medie har en liste at prøve i rækkefølge. Den første der giver
   artikler vinder. "kilder" i svaret viser hvilken, så en død adresse
   kan fjernes. */
const MEDIER = {
  marked: [
    { navn: "Markedsføring", site: "markedsforing.dk", feeds: [
      "https://markedsforing.dk/rss",
      "https://markedsforing.dk/feed",
      "https://markedsforing.dk/rss.xml",
      "https://www.markedsforing.dk/rss" ] },
    { navn: "Bureaubiz", site: "bureaubiz.dk", feeds: [
      "https://bureaubiz.dk/feed/",
      "https://bureaubiz.dk/rss",
      "https://www.bureaubiz.dk/feed/" ] }
  ],
  fodbold: [
    { navn: "bold.dk", site: "bold.dk", feeds: [
      "https://www.bold.dk/feed/rss",
      "https://www.bold.dk/rss",
      "https://www.bold.dk/feed/",
      "https://bold.dk/rss" ] },
    { navn: "Tipsbladet", site: "tipsbladet.dk", feeds: [
      "https://www.tipsbladet.dk/rss",
      "https://www.tipsbladet.dk/feed",
      "https://www.tipsbladet.dk/rss.xml",
      "https://www.tipsbladet.dk/nyheder/rss" ] }
  ]
};

/* ---------- RSS- og Atom-parsing ----------
   Workers har ingen DOMParser, så vi klarer os med regex. Det holder til
   RSS 2.0 og Atom, som er det medierne bruger. */

function rens(s){
  if (!s) return "";
  return s
    .replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    // WordPress-feeds skriver tegn som tal: &#038; er &, &#8217; er ’.
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .trim();
}

function felt(blok, navn){
  const m = blok.match(new RegExp(`<${navn}(?:\\s[^>]*)?>([\\s\\S]*?)</${navn}>`));
  return m ? rens(m[1]) : "";
}

// Atom har linket som attribut: <link href="..."/>
function link(blok){
  return felt(blok, "link") || (blok.match(/<link[^>]*href="([^"]+)"/) || [])[1] || "";
}

/* kilde sat = mediets eget feed, hvor titlen er ren.
   kilde tom = Google News, der skriver "Overskrift - Medie". */
function parse(xml, kilde = "", maks = 12){
  const poster = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(m => m[2]);
  return poster.slice(0, maks).map(p => {
    const raa = felt(p, "title");
    const dato = felt(p, "pubDate") || felt(p, "published") || felt(p, "updated") || felt(p, "dc:date");
    if (kilde) return { titel: raa, link: link(p), kilde, dato };

    // Står mediet i <source>, skæres det af uanset længde. Ellers kun
    // når overskriften er lang nok til at " - " næppe er en del af den.
    const skil = raa.lastIndexOf(" - ");
    const kendt = felt(p, "source");
    const kilde2 = kendt || (skil > 30 ? raa.slice(skil + 3) : "");
    const harHale = kendt ? raa.endsWith(" - " + kendt) : skil > 30;
    return { titel: harHale ? raa.slice(0, skil) : raa, link: link(p), kilde: kilde2, dato };
  }).filter(x => x.titel && x.link);
}

// Nyeste først. Både RSS' og Atoms datoformat kan Date() læse.
const nyesteFoerst = (a, b) => (Date.parse(b.dato) || 0) - (Date.parse(a.dato) || 0);

// Samme historie kan stå i begge medier med næsten samme overskrift.
function udenDubletter(liste){
  const set = new Set();
  return liste.filter(a => {
    const k = a.titel.toLowerCase().slice(0, 50);
    return set.has(k) ? false : set.add(k);
  });
}

async function hent(url, kilde = ""){
  try {
    const r = await fetch(url, {
      cf: { cacheTtl: CACHE_SEK, cacheEverything: true },
      // Nogle medier afviser ukendte klienter, så vi siger hvad vi er.
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CO-Consulting-CRM/1.0; RSS-læser)",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml"
      }
    });
    if (!r.ok) return [];
    return parse(await r.text(), kilde);
  } catch {
    return [];
  }
}

// Mediets egne feeds først, så Google News som reserve.
async function hentMedie(m){
  for (const url of m.feeds){
    const p = await hent(url, m.navn);
    if (p.length) return { poster: p, via: url };
  }
  const g = await hent(feed(`site:${m.site}`));
  if (g.length) return { poster: g, via: "google site:" + m.site };
  const g2 = await hent(feed(m.site));
  return { poster: g2, via: g2.length ? "google søgning " + m.site : "intet fundet" };
}

async function hentSpor(medier){
  const svar = await Promise.all(medier.map(hentMedie));
  const kilder = Object.fromEntries(medier.map((m, i) => [m.navn, svar[i].via]));
  const poster = udenDubletter(svar.flatMap(s => s.poster).sort(nyesteFoerst));
  return { poster, kilder };
}

export async function onRequest({ request }){
  let krop = {};
  if (request.method === "POST"){
    try { krop = await request.json(); } catch {}
  }

  const navne = Array.isArray(krop.virksomheder)
    ? krop.virksomheder.filter(n => typeof n === "string" && n.trim().length > 2).slice(0, 12)
    : [];

  // AI og marketing: den interessante udvikling sker på engelsk.
  const qAi = '("artificial intelligence" OR "AI") (marketing OR advertising OR "media buying")';

  // Kunderne (fanen er på pause): ét opslag med alle navne.
  const qKunder = navne.length
    ? navne.map(n => `"${n.replace(/"/g, "")}"`).join(" OR ")
    : null;

  const [ai, kunderRaa, branche, bold] = await Promise.all([
    hent(feed(qAi, { hl: "en-US", gl: "US", ceid: "US:en" })),
    qKunder ? hent(feed(qKunder)) : Promise.resolve([]),
    hentSpor(MEDIER.marked),
    hentSpor(MEDIER.fodbold)
  ]);

  // Alle fodboldnyheder, men holdene får et mærkat når de nævnes.
  const fodbold = bold.poster.map(a => {
    const t = a.titel.toLowerCase();
    const hold = t.includes("brøndby") ? "Brøndby" : t.includes("real madrid") ? "Real Madrid" : "";
    return hold ? { ...a, hold } : a;
  });

  // Brede OR-søgninger driver. Behold kun artikler hvor kundens navn
  // faktisk står i overskriften, og markér hvem den handler om.
  const kunder = kunderRaa
    .map(a => {
      const t = a.titel.toLowerCase();
      const traf = navne.find(n => t.includes(n.toLowerCase()));
      return traf ? { ...a, omtaler: traf } : null;
    })
    .filter(Boolean);

  // antal og kilder er der så et browserkald viser hvad der virker.
  return new Response(JSON.stringify({
    ai, marked: branche.poster, kunder, fodbold,
    antal: { ai: ai.length, marked: branche.poster.length, kunder: kunder.length,
             fodbold: fodbold.length, navne: navne.length },
    kilder: { ...branche.kilder, ...bold.kilder }
  }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${CACHE_SEK}`
    }
  });
}
