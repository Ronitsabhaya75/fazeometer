# FaZe Odyssey

A video and live-stream platform for FaZe fans. Streamers post videos and go live. Fans watch on the platform, get a personalized feed, and earn the 30 relics of a 3D Odyssey hero by finishing videos and live streams. The hero and every achievement live on the fan's profile. A finished hero earns a live call with a partner streamer, and a second hero costs $5.

Architecture page: https://claude.ai/artifact/C4qpdtruij6CfY95UNtfnR (written before the video and feed pivot, so it still describes live streams only)

## What is in it

- **Feed (home):** live now, coming up, events with "Remind me", a "For you" row ranked by Gemini from interests and watch history, continue watching, and browse with filters. Real video thumbnails and titles from the YouTube Data API.
- **Videos:** streamers post a YouTube link, and title, thumbnail and length are fetched automatically. Fans watch in an embedded player. Finishing a video earns a relic.
- **Live streams:** streamers go live from the studio. Fans watch to the end and enter the secret code the streamer says to earn a relic.
- **Profile:** the 3D hero, the 30 relic slots, achievements (each relic shows which video or stream earned it), stats, watch history, interests, and the "Legend: Agamemnon" view.
- **Also:** $5 second hero (Stripe or a local mock), ad-free for premium, call booking by nation, two-year ticket progress, Odyssey landing page with a 3D ship.

## Stack

| Layer | What |
| --- | --- |
| Web | React 18, TypeScript, Vite, React Three Fiber (Three.js), YouTube IFrame API, Socket.io client |
| API | Node, Express 5, Socket.io, zod |
| SQL | Tiger Data (Postgres + TimescaleDB): users, videos, progress, drops, relics, payments, events, `heartbeats` hypertable |
| NoSQL | MongoDB: part metadata, streamer profiles, surveys, recommendation log, audit events |
| Cache | Redis: session locks, coverage bitmaps, cached feed picks |
| AI | Gemini API with JSON schema output, model fallback, and a SQL fallback |
| Video data | YouTube Data API v3 |

## Run it

Needs Node 20+ and Docker.

```bash
npm install
npm run db:up        # Tiger Data :55432, MongoDB :47017, Redis :56379
cp .env.example server/.env
npm run dev          # API on :4000, web on :5173
```

Add your keys to `server/.env` (never commit it, it is git-ignored):

```
YOUTUBE_API_KEY=...   # fills the video catalog on first start
GEMINI_API_KEY=...    # also accepts GOOGLE_API_KEY
```

On the first start with a YouTube key, the server pulls about 50 FaZe videos from YouTube. Without a key the catalog stays empty and streamers cannot post links. Without a Gemini key the feed is ranked by rules instead.

If Docker restarts and the containers are gone, run `npm run db:up` again. Data lives in named volumes and survives that.

## Two-minute demo

1. Sign up on the landing page (or use "Continue the voyage" to sign in with an email). Pick interests on the home page.
2. Open a video from "For you". Press play. The relic meter fills as the video really plays, and a relic unlocks at 85%.
3. Open **Profile** to see the hero, the new relic on it, and the achievement that names the video.
4. In a second window sign in as **NovaStrike** (demo button on the landing page). In **Studio** go live, wait a minute, press **Drop the code**.
5. Back in the first window, open the live stream under "Live now". After watching long enough, a drop banner appears. Type the code to earn a relic.

`MINUTE_MS=10000` in `.env` makes a stream "minute" 10 seconds for demos. Set `60000` for real time.

## How watching is verified

- **Videos:** the YouTube player reports its position every 5 seconds. The server credits a 5-second bucket only when the position moved forward about as fast as the clock did, so seeking ahead earns nothing. At 85% of buckets the video is complete. A viewer can earn at most 3 relics a day from videos, and each video awards once.
- **Live streams:** heartbeats set a bit per stream minute in Redis, batched into the Tiger Data hypertable. A viewer qualifies with 80% of the completed minutes and presence in the last 5. The streamer's secret code, which only the live stream contains, is the final gate.

## Tests

```bash
MINUTE_MS=1000 VIDEO_HB_MS=1000 DEMO_MODE=1 PORT=4001 npm run start -w server   # fast clocks
API=http://localhost:4001 npm run e2e                                          # in another terminal
```

33 checks cover the live-stream spine, premium, the video watch proof (an honest viewer completes, a seek-skipper does not, no double award), achievements on the profile, the feed and interests.

## What is real and what is a stand-in

| Piece | State |
| --- | --- |
| Feed, YouTube catalog, video playback, watch proof, relics, achievements, profile | Real. Watch proof is tested on a fake video, and real playback was checked up to the first seconds |
| Gemini ranking | Real, with a fallback chain of models and SQL |
| Stripe | Code path is real, but only the mock checkout was tested |
| Sign-in | Email only, no password. Replace with Google or Twitch OAuth before going public |
| Live streams | Demo streams are simulated. A streamer can also attach a YouTube live id. There is no RTMP ingest, so the platform does not host live video itself |
| Posting videos | Posts a YouTube link. There is no file upload or video hosting |
| Events | Seeded sample events. Streamers can post more in the Studio |
| 3D | Built from primitives. Swap in `.glb` models at `parts.glb_key` |
| Video call | Booking and join tokens are real. The room is a local camera preview until `livekit-client` is wired in |
| Not built | Web push and email reminders, parental consent for under-18 users, anti-farming checks, content moderation of catalog videos |

## Layout

```
server/src
  index.ts            app, routes, startup (seeds, first YouTube sync)
  youtube.ts          YouTube Data API wrapper, video classification, catalog sync
  recommend.ts        SQL scoring + Gemini re-rank for the feed
  gemini.ts           JSON-schema Gemini call, model fallback, circuit breaker
  videoWatch.ts       video watch proof and relic award
  watch.ts            live-stream heartbeats, coverage, eligibility
  routes/             auth, feed, videos, profile, stream, streamer (studio), billing, call, recs
web/src
  pages/              Landing, Home, Profile, WatchVideo, WatchStream, Premium, Call, Streamer
  components/cards.tsx   video, stream and event cards
  Character3D.tsx, three/OdysseyScene.tsx   the hero, the ship and Agamemnon
```
