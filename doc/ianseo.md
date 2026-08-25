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

## 7. What is not built

- **No push.** A followed competition is compared against the list when the list is read. Notifying a
  closed app would need a scheduled poller, a subscription table and store credentials on both
  platforms, and none of that exists in this repo.
- **No region filter.** ianseo rows carry a country and a town and nothing between them.
- **No writing.** The app never sends a score to ianseo. It is a reader.
