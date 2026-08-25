# Appchery — ianseo

How the app reads competition results from [ianseo.net](https://www.ianseo.net), as built. Companion
to [architecture.md](./architecture.md) and [data-model.md](./data-model.md).

ianseo is the software most of world archery runs its competitions on, and it publishes what it
records. The app reads what is published. It never writes anything, never signs in, and never sends
anything about the archer anywhere.

## 1. What is there to read

There is no interface to ask, and no JSON of any kind. Everything is a server rendered page:

| Page | What it holds |
| --- | --- |
| `/TourList.php` | Every competition ianseo has ever hosted, about four thousand of them, on one page |
| `/Details.php?toId=N` | One competition: its heading, and every document it has published |
| `/TourData/{year}/{toId}/{DOC}.php` | One document: a result list, an entry list, or an elimination bracket |
| `/TourData/{year}/{toId}/{DOC}.pdf` | The same document as ianseo prints it for the notice board |

Three things about those pages shape everything below.

**The list takes no parameters.** There is no filtering it server side: it is six megabytes of HTML,
or about 470 KB over the wire, every time. So it is read rarely, kept, and filtered on the device.

**A document's name means nothing to us.** `IQRM` is Individual Qualification Recurve Men at one
federation and `IQS1FCL` is a senior class at another. ianseo titles every document in the
organiser's own words, so the app reads the titles and never decodes the codes. A federation the app
has never seen reads exactly as its own archers expect it to.

**Nothing carries an access control header.** ianseo sends no `Access-Control-Allow-Origin`, so a
browser cannot read any of it directly. That is the one hard constraint on the shape of the feature.

## 2. Getting the pages

Two paths to the same HTML, chosen in `src/lib/ianseo/fetch.ts`:

- **On a phone**, `CapacitorHttp` asks ianseo itself. Native HTTP has no origin to be blocked from.
- **In a browser**, the app asks `/ianseo-api/...` and that asks ianseo. In production it is a
  Cloudflare Pages function, `functions/ianseo-api/[[path]].ts`; in development it is a middleware in
  `vite.config.ts`. Both are a few lines around one `fetch`.

`wrangler pages deploy build` picks the function up from `functions/` in the repository root, which
is where wrangler looks regardless of the directory being uploaded. `npx wrangler pages functions
build` compiles it without deploying, which is the cheap way to check it still does.

The proxy passes the page through untouched rather than parsing it. That is deliberate: one set of
parsers runs everywhere, so a page ianseo changes breaks in one place rather than differently on each
platform, and a parser fixed for the web is fixed for the phone in the same commit.

What may be proxied is a named list, not a pass through: `src/lib/ianseo/proxy.ts` matches the four
kinds of path above and refuses everything else, and carries over only `toId`. An open proxy is a
gift to whoever finds it.

The service worker skips `/ianseo-api` entirely. It caches every other same origin GET, and a cached
result would freeze at whatever was read first while the app went on dating it as fresh.

## 3. Reading them

`src/lib/ianseo/parse/` turns HTML into the types in `types.ts`. It is string work rather than
`DOMParser`, because the same code runs under vitest in node and inside a webview.

- `list.ts` reads the tournament list. Cells are found by the class on them, never by position: the
  list prints several columns twice, once for a wide screen and once for a narrow one. The printed
  dates (`25-28 Aug`, `11 Jul - 11 Nov`, `31 Oct 2026 - 20 Feb 2027`) are resolved to a span, and a
  date with no year printed takes the nearest one.
- `details.ts` reads a competition's documents out of its panels. The `?time=` on each PDF link is a
  full timestamp, which is a cheaper change detector than the page's own "Updated 23 Feb 15:07".
- `document.ts` reads either of the two shapes anything is published in:
  - a **table**, walking `<thead>` and `<tbody>` in order, because a `<thead>` opens a section and
    the `<tbody>` after it holds that section's rows. A section may relabel some columns and leave
    the rest to the ones at the top of the table, so the two are merged.
  - a **bracket**, which ianseo draws as a grid. An athlete is a run of cells side by side, and the
    round is the column that run starts at. The round titles in the header row cannot be used for
    this: their spans do not add up to the width of the grid below them.

Two details of ianseo's HTML that the parsers exist to survive: a cell may hold a whole table of its
own (a bracket puts the set scores of a match in one), and entities arrive unclosed (`&nbsp` with no
semicolon) and accented (`rue de l&eacute;glise`). Both have their own tests.

Every parser is tested against real pages saved in `test/ianseo/`. When ianseo changes its markup,
those tests fail rather than a screen going blank.

## 4. What the app keeps

Two tables, both local to the device and neither synced (`migration 0004`):

- `ianseo_favourite` — what the archer follows: a competition, a country, or an archer or a club
  **inside a competition**. Nothing is ever searched for across the whole of ianseo, which would mean
  reading every competition it hosts.
- `ianseo_cache` — pages as they were last read, so a followed competition opens at a range with no
  signal. Capped at 200 rows, oldest dropped: none of it is a record, and all of it can be read again.

Favourites are deliberately not pushed to the sync server. They are a reading list, not shooting, and
they carry other people's names.

## 5. When a result is new

One clock, and only one: the tournament list's own "Updated" column.

- Reading the list notes that stamp on every followed competition (`publishedAt`).
- The first time it is noted for a competition, it is also marked seen. Nothing can have happened
  since a moment the app had not read yet.
- Opening a competition marks it seen up to whatever was last noted.
- New means `publishedAt > seenAt`, which lights a chip in the list and a dot on the home page tile.

The documents carry stamps of their own, and they are close to the list's but not the same. A badge
that noted one and cleared the other would light on nothing having happened and never go out again.
`scripts/check-ianseo.mjs` drives the whole cycle through the real screens for that reason.

## 6. What is shown

Everything read from ianseo says when it was read. It is somebody else's server, the app is used at a
shooting line, and a result from an hour ago clearly dated is worth more than a spinner. Cache first,
then the network, and what is on the device is kept if ianseo cannot be reached.

The result tables are redrawn rather than embedded. ianseo's own stylesheet marks the columns it
drops on a narrow screen, and the app folds away exactly those, giving them back when a row is
opened. The brackets are drawn a round at a time: the wall chart ianseo prints is unreadable on a
phone at any zoom, and what is wanted from it is who beat whom.

## 7. Distance

Neither source publishes coordinates: ianseo prints a town, the FFTA prints a town and a postcode.
Towns are turned into points through Open-Meteo's geocoder, which needs no key and no account, the
same service the app already asks for the weather, and every answer is kept in `competition_place`
for good because towns do not move. A town that cannot be found is remembered as not found, or it
would be asked about again on every refresh.

Nothing is looked up until the archer turns a distance filter on, and only a town name ever leaves
the device: their own position is read by the browser, kept in local storage, and sent nowhere.

A competition whose town has not been located yet is **kept** in the list rather than hidden. The
list narrows as the answers arrive, which is the honest behaviour for a filter waiting on knowledge
it has not got yet.

## 8. The FFTA, and why it is not wired up

The French federation runs the half of French archery ianseo never sees: club, departmental and
regional shoots, published at `www.ffta.fr/competitions` with a town, a discipline, the organising
club, and links to the results and the announcement as PDFs.

`src/lib/ffta/` reads all of that, and is tested against saved pages in `test/ffta/`. It is not
wired into any screen, because the app cannot legitimately fetch those pages:

- `www.ffta.fr` sits behind a Cloudflare JavaScript challenge. A browser passes it; anything else
  gets "Just a moment…" and a 403, including `fetch` from Node and, in all likelihood, from a
  Cloudflare Pages function. Their robots.txt permits the path, but the challenge is a deliberate
  technical control over automated access, and getting around it is not something this app does.
- `extranet.ffta.fr`, which holds the calendar and the results, is behind a login and is marked
  `NoIndex, NoFollow`.

The results PDFs themselves are public and fetch cleanly, so a link to one always works.

What would unblock it is permission rather than cleverness: an interface the federation offers, or
an agreement to let a named client through. The parsers are ready for the day there is one.

## 9. Entering a competition

ianseo publishes what was shot; it says nothing about how to enter anything. Most French clubs take
their entries through **Inscript'Arc**, which lists every competition in the country currently open
for entry on one page of about thirty, at `/competitions/resultats`. It answers a plain GET, needs no
session, and its robots.txt permits everything.

What it carries that nothing else does is the way in: the club's announcement, the entry form, and
the list of who has entered already. It carries no town and no results, so it is never a source of
competitions on its own.

Matching an entry form to a competition is done on the days and the town together, in
`src/lib/inscriptarc/match.ts`, and deliberately refuses more often than it guesses: handing an
archer the entry form for the wrong competition is worse than handing them none. The town has to
appear as a whole word in the entry's own name or its club's, the dates have to overlap, and two
entries answering the same competition are an ambiguity rather than a match.

The entry forms nothing on screen accounts for are listed on their own at the foot of the page,
because those are the local shoots ianseo never hears about and they are most of them.

Only the one listing page is proxied. The rest of the platform is where archers' own details are.

## 10. What is not built

- **No push.** A followed competition is compared against the list when the list is read. Notifying a
  closed app would need a scheduled poller, a subscription table and store credentials on both
  platforms, and none of that exists in this repo.
- **No region filter.** ianseo rows carry a country and a town and nothing between them, so distance
  from where the archer is standing does the work a region would.
- **No writing.** The app never sends a score to ianseo. It is a reader.
