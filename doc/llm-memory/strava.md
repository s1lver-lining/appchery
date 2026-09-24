# Strava

A finished run is sent to Strava as the same GPX the export button writes, so a run on Strava and a
run exported to a file are the same run worked out the same way.

The runner signs in once. Strava's access tokens last six hours and its refresh token does not
expire, so every send after the first renews the token silently and asks nothing.

## The secret ships with the app

Strava's token exchange needs the client secret, and it has no public client mode that would let the
app do without one. The secret is embedded in the build, through `PUBLIC_STRAVA_CLIENT_SECRET`.

This is a known trade, not an oversight. A phone cannot keep a secret: anybody can pull it out of
the package. What they get is the ability to act as this application, which costs us its rate limit
and, if it is abused, its registration. They do not get anybody's runs, because a runner's own token
is obtained by that runner signing in and never leaves their phone.

The way out, when the app is used by enough people for that to matter, is to move the exchange into
a function beside `functions/competitions-api` and keep the secret there. Only `src/lib/strava/`
would change: the two halves it reads would become one call to our own server.

Unset both halves and the app builds with no Strava at all, the way it builds without sync when
Supabase is unset.

Vite reads `.env` and then `.env.<mode>`, and the mode file wins. A release build therefore needs
the pair in `.env.production`, and must not carry it there empty: an empty value overrides the one
in `.env`, and the export would simply be missing with nothing on screen to say why.

## Signing in

The runner is sent to Strava in the phone's own browser rather than inside the app, because an app
asking for somebody's Strava password in its own screen is exactly what they are told to refuse.

Strava sends them back to `https://app.appchery.com/strava/callback`, and only there: it checks the
address against the callback domain registered with it and answers 400 to anything else, a custom
scheme included. So the trip back always lands in the phone's browser first.

It does not stay there. Chrome will hand an https link to the app that claims the domain when
somebody taps it, but not when it arrives as a redirect, which is what this is. The page therefore
forwards to `appchery://strava/callback` carrying the same query, and a scheme the browser cannot
open itself is one it has to pass on. The manifest and the Info.plist claim that scheme, and
`openHanded` in `src/routes/+layout.svelte` turns it back into a path.

The code is worth nothing to whichever copy of the app did not ask for it, so the page has to know
whose sign in it is finishing. Asking to connect leaves a marker in that client's storage, good for
half an hour. The app always finishes the job itself; a browser finishes it only if it holds that
marker, and otherwise hands it on.

This means **the web app has to be deployed for the phone to sign in**, because that published page
is the bridge. A phone build on its own is not enough.

The scope asked for is `activity:write` and nothing else. The app never reads anything back out of
Strava. Strava grants scopes one at a time, so the callback checks the one it needs was actually
given rather than assuming a sign in means yes.

## Sending a run

Strava takes the file and turns it into an activity afterwards, so an upload is not an activity yet:

1. `POST /uploads` with the GPX, which answers with an upload id.
2. The upload is read back every two seconds until it names an activity, reports an error, or a
   minute goes by.
3. The activity id is written onto the run, which is what makes the button say it is on Strava.

A minute passing is not a failure. The run will land; nothing is marked and nothing is claimed, and
pressing again is safe.

### Saying it is a run

Strava works the sport out from the file, and a GPX that does not say becomes a *workout*. That is
not only the wrong icon: Strava lays out an activity's headline figures by sport, and a workout gets
distance, time and climb where a run gets distance, **pace** and time. So a run that arrives unnamed
loses its pace on screen.

It is said twice, because neither place is sure on its own. `<type>running</type>` goes in the track,
which is also what makes the exported file right for anything else that reads it. Then the activity
itself is set to `sport_type: Run` once Strava has made one. The second is never worth failing a send
over, since the run is up either way and the sport can be changed on Strava.

### Sending the same run twice

Every upload carries `external_id: appchery-<activity id>`, which does not change. Strava recognises
a file it has taken before and answers `duplicate of activity <id>`. That is read as success and the
run is marked with the activity it already is, rather than shown as an error.

## Testing it

The sign in cannot be tested against a dev server: Strava only redirects to the registered callback
domain, so `localhost` gets nowhere. Both halves of the callback page can be, by opening it with a
made up code and with or without the marker set. It needs a build on a phone that has the app's domain
associated. Everything either side of the redirect is ordinary code and is unit tested in
`src/lib/strava/strava.test.ts`.
