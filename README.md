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

## Notes / limits

- State is in memory. A server restart (Render redeploys, free-tier sleep) drops
  any game in progress — just re-queue.
- Refreshing the page mid-game leaves the match. Don't refresh.
- One game = one pair. Extra players wait in the queue until someone is free.
