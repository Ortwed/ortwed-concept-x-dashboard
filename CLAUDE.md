# Concept X dashboard

Christian Ortweds personlige arbejdsdashboard hos Concept X, på
christiano@concept.dk. Bygget til ét menneske, ikke til et team.
Enkelhed slår fleksibilitet hver gang.

Søsterprojekt til `ortwed/co-consulting-crm` (det private). Stak og
konventioner er arvet derfra. Designet er Concept X' eget.

## Hvad det er

Et dashboard, **ikke et CRM**. Ingen kunder, ingen pipeline, ingen leads.
Det samler det Christian alligevel kigger på hver morgen:

- Todoist fra arbejdskontoen (forfaldent og i dag)
- Ulæst post og ugens kalender fra Concept X Workspace
- Nyheder (branchen, AI, fodbold), samme feeds som det private projekt
- Fødselsdage på kolleger, kunder og bureaufolk, lagt ind i hånden

Kun fødselsdagene gemmes. Alt andet hentes live og forsvinder igen.

Statisk website med en Supabase-database bagved. Ingen build, ingen
framework, ingen npm. Hele frontenden er **én fil**: `index.html`, med CSS
og JavaScript indlejret. Serverdelen er Cloudflare Pages Functions, én fil
per endpoint. **Foreslå ikke React, en bundler eller en opsplitning af
index.html** medmindre Christian selv beder om det.

## Stak

| Lag | Teknologi |
|---|---|
| Frontend | Én statisk `index.html`, vanilla JS, ingen build |
| Database | Supabase-projektet "Concept X dashboard" (`pjmcoegcccjkdzrqjbrr`), RLS |
| Auth | Supabase Auth, email + password, én bruger (christiano@conceptx.com) |
| Repo | `Ortwed/ortwed-concept-x-dashboard` |
| Hosting | Cloudflare Pages, projekt `concept-x-dashboard`, auto-deploy fra `main` |
| Serverkode | Cloudflare Pages Functions i `functions/api/` |
| Mail + kalender | Google Apps Script i christiano@concept.dk |

**Arbejdsdata må aldrig ligge i CO Consulting-databasen**
(`fjbrfkkcsszolbgrjdbj`), og private data aldrig her. To projekter, to
databaser, to sæt secrets. Kopiér kode mellem dem, aldrig data.

## Filer

```
index.html                    hele appen
billeder/concept-x.png        ordmærket, hvid tekst og gult X (til mørk bund)
billeder/x-sort.png           X-mærket alene, sort, i den gule kerne
functions/api/_middleware.js  vagt: afviser alt under /api/ uden gyldigt Supabase-login
functions/api/todoist.js      Todoist, forfaldent + i dag
functions/api/indbakke.js     proxy til Apps Script (mail + kalender)
functions/api/nyheder.js      mediernes RSS, kopi fra co-consulting-crm
apps-script/indbakke.gs       reference. Den kørende kopi bor på script.google.com
CLAUDE.md                     denne fil
```

Logoerne kommer fra skillen `concept-x-brand-guidelines`. Brug dem derfra,
tegn dem aldrig om som tekst.

## Datamodellen

```
foedselsdage     navn, foedselsdag, relation (kollega/kunde/bureau/andet),
                 firma, note, ejer. År 1900 betyder "året kendes ikke".
v_foedselsdage   + naeste_dato, dage_til, fylder. security_invoker = on.
                 Regner i dansk tid, ikke UTC. 29. februar falder på
                 den 28. i ikke-skudår.
```

RLS: kun rækker hvor `ejer = auth.uid()`. anon har ingen adgang.

SQL-ændringer køres som migrationer gennem Supabase MCP eller i SQL Editor.

## Konventioner

- **Alt på dansk**: UI-tekst, variabelnavne, tabelnavne, kommentarer.
  Ingen æøå i SQL-identifikatorer (`foedselsdag`, `naeste_dato`).
- **Ingen em-dashes med mellemrum omkring.** Gælder også UI-tekst.
- Tone i UI-tekst: tør og konkret. "Indbakken er tom. Nyd det."
  Ikke udråbstegn, ikke emoji, ikke opmuntring.
- Funktionsnavne på dansk: `visForside`, `hentTodoist`, `gemFoedselsdag`.
- `sikker()` om ALT brugerinput og alt fra API'erne der sættes i HTML.
  Ingen undtagelser.

## Design

Efter Christians canvas "Concept X dashboard" (oktober 2026). Concept X'
farver og skrifter, bygget op som HUD'en i det private projekt: tre
kolonner, hilsen og en ring med en lysende kerne i midten.

```css
--gradient: #005169 → #223535 → #1F2C2C → #191919   /* lodret, hele siden */
--gul:    #E3FF00   /* overskrifter, i dag, kernen, aktive faner */
--alarm:  #ff6a3d   /* kun forsinket eller fejl */
--flade:  rgba(255,255,255,.05)   /* kort */
--kant:   rgba(255,255,255,.12)
```

Skrift: Outfit til tal og overskrifter, Poppins til resten.

Gul er Concept X' farve til mørk bund. Brandets orange (`#FF4500`) bruges
ikke på mørk bund i decket, så alarmfarven er en lysere udgave af den.
Brug den kun når noget er galt eller forsinket.

Kernen i midten er gul med det sorte X-mærke. Den viser hvor mange
opgaver der kræver handling, og den yderste prikkede bue skifter til
alarmfarve når noget er forsinket. Klik på kernen åbner Todoist.
Animationer slås fra ved `prefers-reduced-motion`.

## Forsiden

- Venstre: Nøgletal (møder i ugen, forfaldne, opgaver i dag), Fødselsdage
- Midte: hilsen, antal møder i dag, ringen
- Højre: Kræver handling (Todoist)
- Denne uge, mandag til fredag, fra Google-kalenderen
- Ulæst post og Nyheder side om side

På telefonen kommer hilsen og ring først, og ugen står lodret.

Alt der kræver et netværkskald tegnes efter den første rendering, så siden
ikke venter. Mønsteret er: tegn tomt kort → hent → tegn igen.

Stemmehilsenen (britisk mandestemme, browserens egen) venter på både
Todoist og kalenderen, så den siger de rigtige tal. Én gang om dagen ved
login. "Lyd til" siger den med det samme.

## Fejl skal sige hvad der mangler

Fejler et kald, viser kortet hvilket variabelnavn i Cloudflare der
mangler eller er forkert, aldrig bare "fejl". Kun navne, aldrig værdier.
Navnene matches tolerant (mellemrum, små bogstaver), fordi Cloudflares
formular gør den slags fejl nemme at lave.

## Hemmeligheder

Environment variables i Cloudflare-projektet `concept-x-dashboard`, alle
som type **Secret**:

```
TODOIST_TOKEN   fra ARBEJDS-Todoist, ikke den private
GMAIL_URL       Apps Script /exec-adressen fra christiano@concept.dk
GMAIL_NOEGLE    samme streng som NOEGLE i scriptets Script Properties
```

Supabase publishable key står i klartekst i `index.html` og i
`_middleware.js`. Det er med vilje, den er designet til det, og RLS er
det der beskytter data.

Alt under `/api/` kræver login. index.html sender Supabase-tokenet med
via `apiHent()`, og `_middleware.js` tjekker det hos Supabase. Nye kald
til `/api/` skal gå gennem `apiHent()`, ellers får de 401.

**Læg aldrig en secret i repoet.** Hverken i kode, kommentarer eller
commit-beskeder. Hvis du har brug for en værdi, så bed Christian sætte den
i Cloudflare og referér til den ved navn.

Tilmelding skal være slået fra i Supabase (Authentication → Sign In /
Providers → Allow new users to sign up). Ellers kan enhver med adressen
oprette en bruger og komme forbi `/api/`-vagten.

## Deploy

Push til `main` udløser deploy automatisk. Tager cirka tredive sekunder.

Variabler sat **efter** et deploy er ikke med i det kørende build. Sætter
Christian en ny secret, skal der et nyt deploy til. Claude pusher en lille
commit til `main` i stedet for at sende ham efter Retry deployment-knappen.

Pages Functions bygges kun hvis `functions/` ligger i roden af repoet.
Det skal være et **Pages**-projekt, ikke et Worker. Det private projekt
lærte det på den hårde måde.

## Apps Script

Kører som christiano@concept.dk, deployet som webapp med adgang "Alle".
Nøglen i Script Properties er det der beskytter den. Tilbyder Workspace
kun "Alle i concept.dk", har IT spærret for anonym adgang, og så kan
Cloudflare ikke nå scriptet. Fejlen i kortet siger det.

**Foreslå ikke at gøre arbejdskalenderen offentlig** eller at bruge den
hemmelige iCal-adresse. Concept X har slået den fra med vilje.

## Når du arbejder her

- Lav små, læsbare ændringer. Christian læser koden.
- Kommentér **hvorfor**, ikke hvad.
- Test at JavaScript parser inden du pusher: `node --check` på det
  udtrukne script og på hver fil i `functions/api/`.
- Spørg ikke om lov til små ting. Lav dem, og sig hvad du lavede.
- Sig fra hvis han beder om noget der er en dårlig idé. Han foretrækker
  et modargument frem for en ja-hat.
- Hold denne fil opdateret når noget ændrer sig.
