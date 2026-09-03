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

### Asking whether a page has changed

Reading the tournament list is 6.2 MB, and an archer refreshing at a field pays for every byte of it.
So the app says what it already holds and is answered in a line where nothing has changed.

The obstacle is that **ianseo stamps nothing it builds itself**. Measured against the live site: its
PHP pages — the list, a competition, every result document — carry no `ETag`, no `Last-Modified` and
no `Cache-Control`, and an `If-Modified-Since` against one is answered with the whole page regardless.
Only the files it serves off disk, the PDFs, carry a validator of their own, and those honour a
conditional request properly.

So the proxy stamps the rest itself, in `proxied` in `src/lib/competitions/proxy.ts`: it hashes the
bytes it has just read and hands that back as the page's `ETag`. ianseo is still asked every time and
still sends the whole page every time. What this saves is the archer's own connection, which is the
one that costs; the proxy's link to ianseo is somebody else's problem and a cheap one.

Two details that are not obvious and cost an afternoon each:

- **The stamp is repeated on `X-Page-Tag`.** Cloudflare compresses a page on the way out and strips
  the `ETag` off what it compressed — weak or strong, it makes no difference. Our own headers survive;
  that one does not. The request side stays the ordinary `If-None-Match`, which arrives untouched.
  The app reads whichever of the two reaches it (`tagIn` in `fetch.ts`).
- **Test it cache-busted.** The proxy answers `Cache-Control: public, max-age=60`, so a plain repeat
  request is served by the edge and tells you nothing about the function. Add an ignored query
  parameter, and note that `targetOf` drops it before ianseo ever sees it.

Nothing depends on any of this working. A page that arrives with no stamp is read in full, which is
what happened everywhere before this existed, and what still happens on a phone: `CapacitorHttp` goes
straight to ianseo, so a native build gets a real `304` on the schedule PDF and reads the PHP pages in
full. A `304` costs no parse and no cache write either, only `touchCache` to move the hour.

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

### When a page changes anyway

ianseo will rearrange a page one day, and the app has to behave when it does. Two rules, in
`src/lib/ianseo/parse/reading.ts`:

**A line that cannot be read never takes the page with it.** Rows, documents and matches are read one
at a time, and one that throws is stepped over. Half a result list is worth far more than an error:
the archer is looking for a name, and the rest of the list still holds it. A table that came back
short says so at the top rather than quietly showing fewer archers, counted from the rows that
yielded no cells or fewer cells than the table has columns. That count is zero on every page saved
in `test/ianseo/`, so it means what it says.

**A page that plainly held something, out of which nothing could be read, says so in its own words.**
`looksLike` asks whether the page had the shape of the thing being looked for: a list links
competitions by `toId`, a competition links documents under `/TourData/{year}/`, a document is a
table. An empty parse of a page with that shape raises `unreadable`, which the screens report as "this
page of ianseo has changed" rather than "ianseo could not be reached". The two are not the same:
waiting fixes one and never fixes the other, and a competition that has simply published nothing yet
is neither. Whatever was read before the change stays on screen, dated, and the PDF on ianseo still
has everything.

## 4. The schedule, which is a PDF and nothing else

ianseo prints a competition's timetable as a report and never renders it as a page, so the one
document in the feature that cannot be read as HTML is the one an archer wants before the
competition rather than after it.

`src/lib/pdf/text.ts` reads a PDF far enough to answer where each run of words was printed, and no
further. It inflates the content streams through `DecompressionStream`, walks the text operators for
the matrices and the strings, and decodes WinAnsi. It lays nothing out, resolves no cross reference
table, and knows nothing of embedded fonts: the reports in question come out of one generator, in
the standard Latin faces, under one filter. Anything else comes back empty.

`src/lib/ianseo/schedule.ts` turns those runs into days and lines. The report is a table: a day
across the whole width, then a line a session with the times on the left. Three things about it are
worth knowing, because each of them lost a page before it was handled:

- **A page ends, and an HTML page does not.** A day split over two pages is headed again on the
  second by some competitions and simply continued by others. Both halves belong to the same day, so
  the day is matched on its printed date, and the top of the table is taken from where the headings
  sit rather than from the first one on each page.
- **The report signs every page.** The competition's name above the table and `AR_C08 … Page 1/2`
  below it are reprinted on each one, and neither is part of the schedule.
- **Columns are read by what they say.** The time and the duration are recognised as times, not as
  positions, so a report that moves them is still read.

A report this cannot find a single day in comes back as null, which the client raises as
`unreadable`. That is the whole point of the exercise: the screen keeps the PDF beside the search
box from the moment it opens, and hands it over whenever the reading fails.

The one document name the app reads is this one. `SCHEDULE.pdf` is ianseo's own, filed under a name
it chooses, while the title printed beside it is the organiser's words in the organiser's language.
Nothing depends on the guess being right: a competition whose schedule is filed elsewhere simply
opens the PDF, as it did before.

## 5. What the app keeps

Two tables, both local to the device and neither synced (`migration 0004`):

- `ianseo_favourite` — what the archer follows: a competition, a country, or an archer or a club
  **inside a competition**. Nothing is ever searched for across the whole of ianseo, which would mean
  reading every competition it hosts.
- `ianseo_cache` — pages as they were last read, so a followed competition opens at a range with no
  signal. Capped at 200 rows, oldest dropped: none of it is a record, and all of it can be read again.

Favourites are deliberately not pushed to the sync server. They are a reading list, not shooting, and
they carry other people's names.

## 6. When a result is new

One clock, and only one: the tournament list's own "Updated" column.

- Reading the list notes that stamp on every followed competition (`publishedAt`).
- The first time it is noted for a competition, it is also marked seen. Nothing can have happened
  since a moment the app had not read yet.
- Opening a competition marks it seen up to whatever was last noted.
- New means `publishedAt > seenAt`, which lights a chip in the list and a dot on the home page tile.

The documents carry stamps of their own, and they are close to the list's but not the same. A badge
that noted one and cleared the other would light on nothing having happened and never go out again.
`scripts/check-ianseo.mjs` drives the whole cycle through the real screens for that reason.

`src/lib/ianseo/published.ts` runs the same rule one level down, for which of a competition's own
documents are the ones that changed: one stamp a competition rather than one a document, the newest
of its documents seen last time, so anything stamped later is new. A competition this device has no
record for (opened for the first time, or followed since before this shipped) falls back to the
newest stamp already sitting in its cached copy, so a follower does not go one whole round of
publishing with nothing marked.

## 7. What is shown

Everything read from ianseo says when it was read. It is somebody else's server, the app is used at a
shooting line, and a result from an hour ago clearly dated is worth more than a spinner. Cache first,
then the network, and what is on the device is kept if ianseo cannot be reached.

A schedule is drawn as the report prints it, a block a day. The blocks fold away and stay folded,
because a five day championship is read one day at a time, and a competition being shot opens at
today with a few pixels of the day before still showing: the archer is at the shooting line looking
for the next session, not reading the week from the beginning. Which day is today is worked out from
the number the report heads it with, that being the one part of the heading that is not in the
organiser's language, and only for a competition the list says is running.

The result tables are redrawn rather than embedded. ianseo's own stylesheet marks the columns it
drops on a narrow screen, and the app folds away exactly those, giving them back when a row is
opened. The brackets are drawn a round at a time: the wall chart ianseo prints is unreadable on a
phone at any zoom, and what is wanted from it is who beat whom.

Who beat whom, `winnerOf` in `src/lib/ianseo/brackets.ts`, is decided by comparing the two scores
directly rather than by looking at who is drawn again in a later round. The round after a semi-final
often holds two matches at once, the real final and the bronze one, and both the semi's winner and
its loser can reappear there, one in each: nothing in the draw itself says which is which. Score
comparison needs no such lookup and no knowledge of the format either, since ianseo prints the same
two things in this cell for every discipline: a target and a time before the match is shot, a plain
number once it is, on whatever scale that format keeps, from set points to a raw arrow total in the
hundreds. Higher wins, whatever the number.

The round of cards and the wall chart, `src/lib/ui/ianseo/BracketBoard.svelte`, ride on one track
that works the way the main pager's swipe does: the round follows the finger, the one being swiped
to rides in beside it on a gutter of its own width (the two are only as wide as their own column,
so without a gap they would ride touching), and letting go carries it the rest of the way or puts it
back. The whole draw is one more stop on that same track, past the final. Leaving the chart happens
only at its own left edge: dragging further right there hands the same gesture to the track, decided
once at the moment a touch begins rather than re-read as the finger moves, because reading the
chart's own scroll position again mid-gesture races the browser's own scrolling of it. A few pixels
of dead zone keep a drag that only meant to nudge the chart back to its edge from being read as
leaving it.

## 8. Distance

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

## 9. The FFTA, and why it is not wired up

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

## 10. Entering a competition

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

## 11. Handing a competition over

The code button on a competition draws `https://app.appchery.com/ianseo/{toId}` as a QR code, so an
archer beside you can point a phone at it and land on the same page.

The address is the app's own rather than ianseo's, which is what makes it open in the app where the
app is installed. On Android the manifest claims that host with `autoVerify`, and the layout routes
an `appUrlOpen` for it to the matching page. **The last step is not done and cannot be from here:**
Android only hands the link over once `https://app.appchery.com/.well-known/assetlinks.json` names
this app's signing certificate, and iOS needs an `apple-app-site-association` file and the associated
domains entitlement. Until then a scan opens the web app, which is the same page and the right answer
for anybody who has not installed anything.

## 12. What is not built

- **No push.** A followed competition is compared against the list when the list is read. Notifying a
  closed app would need a scheduled poller, a subscription table and store credentials on both
  platforms, and none of that exists in this repo.
- **No region filter.** ianseo rows carry a country and a town and nothing between them, so distance
  from where the archer is standing does the work a region would.
- **No writing.** The app never sends a score to ianseo. It is a reader.
