/**
 * Apps Script til Concept X-dashboardet.
 *
 * Kopien her er en reference. Den kørende udgave bor i
 * christiano@concept.dk på script.google.com. Ret begge steder.
 *
 * Opsætning:
 *   1. Nyt projekt på script.google.com, logget ind med arbejdskontoen.
 *   2. Indsæt denne fil.
 *   3. Projektindstillinger → Script Properties → tilføj NOEGLE med en
 *      lang tilfældig streng. Samme streng skal i Cloudflare som
 *      GMAIL_NOEGLE. Nøglen står med vilje ikke i koden.
 *   4. Implementer → Ny implementering → Webapp.
 *      Kør som: Mig. Adgang: Alle.
 *      Adressen der ender på /exec skal i Cloudflare som GMAIL_URL.
 *
 * "Alle" er nødvendigt, fordi Cloudflare ikke er logget ind hos Google.
 * Nøglen er det der beskytter. Tilbyder Workspace kun "Alle i
 * concept.dk", har IT spærret for det, og så virker indbakken ikke.
 */

function doGet(e) {
  const noegle = PropertiesService.getScriptProperties().getProperty("NOEGLE");
  if (!noegle || !e || e.parameter.n !== noegle) return json({ fejl: "nøgle" });
  return json({ poster: ulaeste(), aftaler: ugensAftaler() });
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

// Ulæste tråde i indbakken. Kun overskrift og et kort uddrag forlader
// Google, ikke hele mailen.
function ulaeste() {
  return GmailApp.search("is:unread in:inbox", 0, 15).map(function (t) {
    const beskeder = t.getMessages();
    const sidste = beskeder[beskeder.length - 1];
    const fra = sidste.getFrom();                    // "Navn <mail@x.dk>"
    const m = fra.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
    return {
      navn: m ? m[1].trim() : "",
      email: m ? m[2].trim() : fra,
      emne: t.getFirstMessageSubject(),
      uddrag: sidste.getPlainBody().replace(/\s+/g, " ").slice(0, 140),
      dato: t.getLastMessageDate().toISOString(),
      link: "https://mail.google.com/mail/u/0/#inbox/" + t.getId(),
      antal: t.getMessageCount()
    };
  });
}

// Mandag til og med søndag i denne uge, fra standardkalenderen.
function ugensAftaler() {
  const nu = new Date();
  const mandag = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - ((nu.getDay() + 6) % 7));
  const slut = new Date(mandag.getFullYear(), mandag.getMonth(), mandag.getDate() + 7);
  const zone = Session.getScriptTimeZone();

  return CalendarApp.getDefaultCalendar().getEvents(mandag, slut)
    // Aftaler man har sagt nej til hører ikke til i ugen.
    .filter(function (a) { return a.getMyStatus() !== CalendarApp.GuestStatus.NO; })
    .map(function (a) {
      const heldags = a.isAllDayEvent();
      return {
        titel: a.getTitle(),
        // Heldagsaftaler sendes som ren dato. Som tidspunkt ville
        // midnat i København blive dagen før i UTC.
        start: heldags ? Utilities.formatDate(a.getAllDayStartDate(), zone, "yyyy-MM-dd")
                       : a.getStartTime().toISOString(),
        slut: a.getEndTime().toISOString(),
        heldags: heldags,
        sted: a.getLocation() || ""
      };
    });
}
