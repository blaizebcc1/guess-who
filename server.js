const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const WORD_DATA = require("./words");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));
app.get("/healthz", (_req, res) => res.send("ok"));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Guess Who running on port ${PORT}`));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const ROUND_SECONDS = Number(process.env.ROUND_SECONDS) || 120;          // 2 minute rounds
const CONTINUE_TIMEOUT_MS = Number(process.env.CONTINUE_TIMEOUT_MS) || 5000; // auto "continue" after 5s
const START_SPLASH_MS = Number(process.env.START_SPLASH_MS) || 2500;     // "Round X - NAME is guessing" splash

// Flatten the word bank into a single pool of { word, category }.
const WORDS = [];
for (const [category, list] of Object.entries(WORD_DATA)) {
  for (const w of list) WORDS.push({ word: String(w), category });
}

function shuffledDeck() {
  const a = WORDS.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let queue = [];              // [{ id, name, socket }]
const rooms = new Map();     // roomId -> room

function makeRoomId() {
  return Math.random().toString(36).slice(2, 9);
}

// ---------------------------------------------------------------------------
// Chat filter
// ---------------------------------------------------------------------------
function normalize(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

// Returns the offending fragment if `text` gives away `target`, else null.
function violation(target, text) {
  const nt = normalize(text);
  if (!nt) return null;
  const spaced = " " + nt + " ";
  const tokens = normalize(target).split(" ").filter(Boolean);

  for (const tok of tokens) {
    if (tok.length >= 3) {
      // substring match: "spider" is caught inside "spiderman"
      if (nt.includes(tok)) return tok;
    } else {
      // very short tokens (TV, DJ) only match as whole words
      if (spaced.includes(" " + tok + " ")) return tok;
    }
  }

  // whole phrase with the spaces removed, e.g. "icecream"
  const joined = tokens.join("");
  if (joined.length >= 4 && nt.replace(/ /g, "").includes(joined)) return target;

  return null;
}

// ---------------------------------------------------------------------------
// Matchmaking
// ---------------------------------------------------------------------------
function tryMatch() {
  queue = queue.filter((q) => q.socket.connected);
  while (queue.length >= 2) {
    const a = queue.shift();
    const b = queue.shift();
    createRoom(a, b);
  }
}

function createRoom(a, b) {
  const id = makeRoomId();
  a.socket.join(id);
  b.socket.join(id);
  a.socket.data.roomId = id;
  b.socket.data.roomId = id;

  const room = {
    id,
    players: [
      { id: a.id, name: a.name },
      { id: b.id, name: b.name },
    ],
    sockets: { [a.id]: a.socket, [b.id]: b.socket },
    round: 1,
    guesserIndex: Math.random() < 0.5 ? 0 : 1,
    phase: "starting", // starting | playing | review | transition | done
    deck: [],
    current: null,
    score: 0,
    log: [],
    endsAt: 0,
    roundTimer: null,
    continueTimer: null,
    continueVotes: new Set(),
    results: {},
  };
  rooms.set(id, room);

  io.to(id).emit("gameStart", { players: room.players.map((p) => p.name) });
  announceRoundStart(room);
}

function announceRoundStart(room) {
  room.phase = "transition";
  io.to(room.id).emit("roundStarting", {
    round: room.round,
    guesserName: room.players[room.guesserIndex].name,
    explainerName: room.players[1 - room.guesserIndex].name,
  });
  setTimeout(() => startRound(room), START_SPLASH_MS);
}

// ---------------------------------------------------------------------------
// Round lifecycle
// ---------------------------------------------------------------------------
function startRound(room) {
  if (!rooms.has(room.id)) return;
  room.phase = "playing";
  room.deck = shuffledDeck();
  room.current = room.deck.pop();
  room.score = 0;
  room.log = [];
  room.continueVotes = new Set();
  room.endsAt = Date.now() + ROUND_SECONDS * 1000;

  clearTimeout(room.roundTimer);
  room.roundTimer = setTimeout(() => endRound(room), ROUND_SECONDS * 1000 + 150);

  const guesser = room.players[room.guesserIndex];
  const explainer = room.players[1 - room.guesserIndex];

  room.players.forEach((p, i) => {
    const s = room.sockets[p.id];
    if (!s) return;
    const isGuesser = i === room.guesserIndex;
    s.emit("roundState", {
      round: room.round,
      role: isGuesser ? "guesser" : "explainer",
      guesserName: guesser.name,
      explainerName: explainer.name,
      endsAt: room.endsAt,
      now: Date.now(),
      score: 0,
      count: 0,
      word: isGuesser ? null : room.current.word,
      category: room.current.category,
    });
  });
}

function advance(room, result) {
  if (room.phase !== "playing") return;
  room.log.push({
    word: room.current.word,
    category: room.current.category,
    result, // "correct" | "pass"
  });
  if (result === "correct") room.score++;

  if (room.deck.length === 0) room.deck = shuffledDeck();
  room.current = room.deck.pop();

  io.to(room.id).emit("progress", { score: room.score, count: room.log.length });

  const explainer = room.players[1 - room.guesserIndex];
  const es = room.sockets[explainer.id];
  if (es) es.emit("word", { word: room.current.word, category: room.current.category });
}

function endRound(room) {
  if (room.phase !== "playing") return;
  clearTimeout(room.roundTimer);

  // the word on screen when time ran out counts as a fail
  room.log.push({
    word: room.current.word,
    category: room.current.category,
    result: "timeout",
  });

  room.phase = "review";
  room.results[room.round] = {
    guesser: room.players[room.guesserIndex].name,
    score: room.score,
    log: room.log.slice(),
  };

  io.to(room.id).emit("review", {
    round: room.round,
    guesserName: room.players[room.guesserIndex].name,
    score: room.score,
    log: room.log,
    autoMs: CONTINUE_TIMEOUT_MS,
  });

  room.continueVotes = new Set();
  clearTimeout(room.continueTimer);
  room.continueTimer = setTimeout(() => proceed(room), CONTINUE_TIMEOUT_MS);
}

function proceed(room) {
  if (room.phase !== "review") return;
  clearTimeout(room.continueTimer);
  room.phase = "transition";

  if (room.round === 1) {
    room.round = 2;
    room.guesserIndex = 1 - room.guesserIndex; // swap roles
    announceRoundStart(room);
  } else {
    finish(room);
  }
}

function finish(room) {
  room.phase = "done";
  const r1 = room.results[1];
  const r2 = room.results[2];
  let winner = "Tie";
  if (r1.score > r2.score) winner = r1.guesser;
  else if (r2.score > r1.score) winner = r2.guesser;

  io.to(room.id).emit("final", { round1: r1, round2: r2, winner });
  setTimeout(() => destroyRoom(room.id, null), 90 * 1000);
}

function destroyRoom(roomId, exceptSocketId) {
  const room = rooms.get(roomId);
  if (!room) return;
  clearTimeout(room.roundTimer);
  clearTimeout(room.continueTimer);
  room.players.forEach((p) => {
    const s = room.sockets[p.id];
    if (s) {
      s.leave(roomId);
      s.data.roomId = null;
      if (p.id !== exceptSocketId) { /* opponent notified by caller */ }
    }
  });
  rooms.delete(roomId);
}

function leaveCurrentRoom(socket, notify) {
  const roomId = socket.data.roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) {
    socket.data.roomId = null;
    return;
  }
  if (notify) socket.to(roomId).emit("opponentLeft");
  destroyRoom(roomId, socket.id);
}

// ---------------------------------------------------------------------------
// Socket wiring
// ---------------------------------------------------------------------------
io.on("connection", (socket) => {
  socket.data.roomId = null;

  socket.on("queue", (payload) => {
    const name = String((payload && payload.name) || "").trim().slice(0, 20) || "Player";
    socket.data.name = name;

    leaveCurrentRoom(socket, true);
    queue = queue.filter((q) => q.id !== socket.id);
    queue.push({ id: socket.id, name, socket });
    socket.emit("queued");
    tryMatch();
  });

  socket.on("cancelQueue", () => {
    queue = queue.filter((q) => q.id !== socket.id);
  });

  socket.on("chat", (payload) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.phase !== "playing") return;
    const idx = room.players.findIndex((p) => p.id === socket.id);
    if (idx < 0) return;

    let text = String((payload && payload.text) || "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!text) return;

    const isExplainer = idx !== room.guesserIndex;
    if (isExplainer) {
      const bad = violation(room.current.word, text);
      if (bad) {
        socket.emit("chatBlocked", { text, reason: bad });
        return;
      }
    }
    io.to(room.id).emit("chat", {
      name: room.players[idx].name,
      role: isExplainer ? "explainer" : "guesser",
      text,
    });
  });

  socket.on("gotit", () => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return;
    if (room.players.findIndex((p) => p.id === socket.id) !== room.guesserIndex) return;
    advance(room, "correct");
  });

  socket.on("pass", () => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return;
    if (room.players.findIndex((p) => p.id === socket.id) !== room.guesserIndex) return;
    advance(room, "pass");
  });

  socket.on("continueVote", () => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.phase !== "review") return;
    if (room.players.findIndex((p) => p.id === socket.id) < 0) return;
    room.continueVotes.add(socket.id);
    io.to(room.id).emit("continueCount", { votes: room.continueVotes.size, need: 2 });
    if (room.continueVotes.size >= 2) proceed(room);
  });

  socket.on("leaveGame", () => {
    leaveCurrentRoom(socket, true);
  });

  socket.on("disconnect", () => {
    queue = queue.filter((q) => q.id !== socket.id);
    leaveCurrentRoom(socket, true);
  });
});
