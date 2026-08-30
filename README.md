# Guess Who

A real-time 2-player word-explaining party game (Taboo style). Built for playing
with a friend over a voice call.

## How it works

1. Each player enters a name and hits **Queue**.
2. When two people are queued, they're paired into a game.
3. A **guesser** is picked at random. The other player is the **explainer**.
4. The explainer sees a secret word + category and describes it — by voice and/or
   the built-in chat.
5. The chat **blocks any message that contains the word or a part of it**. If the
   word is `spider web`, you can't send "spider", "web", "spiderman", "webbing", etc.
6. The guesser has two buttons:
   - **Got it** → +1 point, next word.
   - **Pass** → skip, counts as a miss, next word.
7. Rounds are **2 minutes**. When time runs out, the word on screen is a miss.
8. Both players see a **review** of the round, then press **Continue**. If someone
   doesn't press it within **5 seconds** it auto-continues.
9. Roles swap for round 2. Highest score across the two rounds wins.

## Run locally

```bash
npm install
npm start
```

Open <http://localhost:3000> in two browser tabs (or two devices) to test.

## Deploy

### GitHub

```bash
git init
git add .
git commit -m "Guess Who"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

### Render

1. New → **Web Service**, connect the repo.
2. Render reads `render.yaml` automatically. If setting it up manually:
   - Runtime: **Node**
   - Build command: `npm install`
   - Start command: `npm start`
   - Instance type: Free is fine for 2 players.
3. Deploy. The app listens on `process.env.PORT`, which Render sets for you.

## Customising the words

Edit [`words.js`](words.js). It's grouped by category; add as many entries as you
like. Multi-word entries work — every significant part is blocked in chat.

## Reconnecting

Brief drops are handled. If a player's connection blips (wifi, phone locking, tab
backgrounded), the round **pauses** and both players see a "waiting to reconnect"
overlay. The client auto-reconnects and the game resumes with the clock where it
left off. If the player doesn't come back within ~45 seconds (`GRACE_MS`), the
game is abandoned and both return to the lobby.

Refreshing the page is fine too — the tab keeps its identity for the session and
rejoins the game in progress.

## Config (env vars)

| Var | Default | Meaning |
|-----|---------|---------|
| `PORT` | `3000` | HTTP port (Render sets this) |
| `ROUND_SECONDS` | `120` | Length of each round |
| `CONTINUE_TIMEOUT_MS` | `5000` | Auto-continue delay on the review screen |
| `START_SPLASH_MS` | `2500` | "Round X" splash duration |
| `GRACE_MS` | `45000` | Reconnect window before a game is abandoned |

## Notes / limits

- State is in memory. A full server restart (Render redeploy, free-tier sleep
  after 15 min idle) drops any game in progress — just re-queue.
- Closing the tab entirely (not just refreshing) ends your session.
- One game = one pair. Extra players wait in the queue until someone is free.
