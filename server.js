const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const WORD_DATA = require("./words");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // be tolerant of janky wifi / phones locking / tabs backgrounding
  pingInterval: 20000,
  pingTimeout: 30000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
});

app.use(express.static(path.join(__dirname, "public")));
app.get("/healthz", (_req, res) => res.send("ok"));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Guess Who running on port ${PORT}`));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const ROUND_SECONDS = Number(process.env.ROUND_SECONDS) || 120;
const CONTINUE_TIMEOUT_MS = Number(process.env.CONTINUE_TIMEOUT_MS) || 5000;
const START_SPLASH_MS = Number(process.env.START_SPLASH_MS) || 2500;
const GRACE_MS = Number(process.env.GRACE_MS) || 45000; // reconnect window before a game is abandoned

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
let queue = [];                 // [{ playerId, name, socket }]
const rooms = new Map();        // roomId  -> room
const playerRoom = new Map();   // playerId -> roomId

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
      if (nt.includes(tok)) return tok;              // "spider" inside "spiderman"
    } else if (spaced.includes(" " + tok + " ")) {
      return tok;                                    // short tokens (TV, DJ) as whole words only
    }
  }

  const joined = tokens.join("");
  if (joined.length >= 4 && nt.replace(/ /g, "").includes(joined)) return target; // "icecream"

  return null;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function sockOf(room, i) {
  return room.sockets[room.players[i].playerId] || null;
}
function otherIndex(i) {
  return 1 - i;
}
function bothConnected(room) {
  return room.players.every((p) => room.connected[p.playerId]);
}
function emitRoom(room, ev, data) {
  io.to(room.id).emit(ev, data);
}

// ---------------------------------------------------------------------------
// Matchmaking
// ---------------------------------------------------------------------------
function tryMatch() {
  queue = queue.filter((q) => q.socket.connected);
  while (queue.length >= 2) {
    createRoom(queue.shift(), queue.shift());
  }
}

function createRoom(a, b) {
  const id = makeRoomId();
  const room = {
    id,
    players: [
      { playerId: a.playerId, name: a.name },
      { playerId: b.playerId, name: b.name },
    ],
    sockets: { [a.playerId]: a.socket, [b.playerId]: b.socket },
    connected: { [a.playerId]: true, [b.playerId]: true },
    grace: {},
    round: 1,
    guesserIndex: Math.random() < 0.5 ? 0 : 1,
    phase: "starting",   // starting | transition | playing | review | done
    paused: false,
    remainingMs: 0,
    deck: [],
    current: null,
    score: 0,
    log: [],
    endsAt: 0,
    roundTimer: null,
    splashTimer: null,
    continueTimer: null,
    continueVotes: new Set(),
    results: {},
    winner: null,
  };
  rooms.set(id, room);
  room.players.forEach((p) => playerRoom.set(p.playerId, id));

  [a, b].forEach((c) => {
    c.socket.join(id);
    c.socket.data.roomId = id;
  });

  emitRoom(room, "gameStart", { players: room.players.map((p) => p.name) });
  announceRoundStart(room);
}

function announceRoundStart(room) {
  room.phase = "transition";
  emitRoom(room, "roundStarting", {
    round: room.round,
    guesserName: room.players[room.guesserIndex].name,
    explainerName: room.players[otherIndex(room.guesserIndex)].name,
  });
  clearTimeout(room.splashTimer);
  room.splashTimer = setTimeout(() => startRound(room), START_SPLASH_MS);
}

// ---------------------------------------------------------------------------
// Round lifecycle
// ---------------------------------------------------------------------------
function startRound(room) {
  if (!rooms.has(room.id)) return;
  room.phase = "playing";
  room.paused = false;
  room.deck = shuffledDeck();
  room.current = room.deck.pop();
  room.score = 0;
  room.log = [];
  room.continueVotes = new Set();
  room.endsAt = Date.now() + ROUND_SECONDS * 1000;

  clearTimeout(room.roundTimer);
  room.roundTimer = setTimeout(() => endRound(room), ROUND_SECONDS * 1000 + 150);

  room.players.forEach((p, i) => sendRoundState(room, i));

  // if one player is mid-reconnect when the round starts, freeze immediately
  if (!bothConnected(room)) pauseRoom(room);
}

function sendRoundState(room, i) {
  const s = sockOf(room, i);
  if (!s) return;
  const isGuesser = i === room.guesserIndex;
  s.emit("roundState", {
    round: room.round,
    role: isGuesser ? "guesser" : "explainer",
    guesserName: room.players[room.guesserIndex].name,
    explainerName: room.players[otherIndex(room.guesserIndex)].name,
    endsAt: room.endsAt,
    now: Date.now(),
    paused: room.paused,
    score: room.score,
    count: room.log.length,
    word: isGuesser ? null : room.current.word,
    category: room.current.category,
  });
}

function advance(room, result) {
  if (room.phase !== "playing" || room.paused) return;
  room.log.push({
    word: room.current.word,
    category: room.current.category,
    result,
  });
  if (result === "correct") room.score++;

  if (room.deck.length === 0) room.deck = shuffledDeck();
  room.current = room.deck.pop();

  emitRoom(room, "progress", { score: room.score, count: room.log.length });

  const es = sockOf(room, otherIndex(room.guesserIndex));
  if (es) es.emit("word", { word: room.current.word, category: room.current.category });
}

function endRound(room) {
  if (room.phase !== "playing") return;
  clearTimeout(room.roundTimer);

  // the word on screen when time ran out counts as a miss
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

  emitReview(room);
}

function emitReview(room) {
  const r = room.results[room.round];
  emitRoom(room, "review", {
    round: room.round,
    guesserName: r.guesser,
    score: r.score,
    log: r.log,
    autoMs: CONTINUE_TIMEOUT_MS,
  });
  room.continueVotes = new Set();
  clearTimeout(room.continueTimer);
  if (bothConnected(room)) {
    room.continueTimer = setTimeout(() => proceed(room), CONTINUE_TIMEOUT_MS);
  }
}

function proceed(room) {
  if (room.phase !== "review" || room.paused) return;
  clearTimeout(room.continueTimer);
  room.phase = "transition";

  if (room.round === 1) {
    room.round = 2;
    room.guesserIndex = otherIndex(room.guesserIndex); // swap roles
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
  room.winner = winner;

  emitRoom(room, "final", { round1: r1, round2: r2, winner });
  setTimeout(() => destroyRoom(room.id), 2 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Pause / resume (a player dropped, waiting for reconnect)
// ---------------------------------------------------------------------------
function pauseRoom(room) {
  if (room.paused) return;
  if (room.phase === "playing") {
    room.remainingMs = Math.max(1000, room.endsAt - Date.now());
    clearTimeout(room.roundTimer);
  } else if (room.phase === "review") {
    clearTimeout(room.continueTimer);
  } else {
    return; // starting / transition / done: nothing ticking to freeze
  }
  room.paused = true;
  emitRoom(room, "gamePaused");
}

function resumeRoom(room) {
  if (!room.paused) return;
  room.paused = false;

  if (room.phase === "playing") {
    room.endsAt = Date.now() + room.remainingMs;
    clearTimeout(room.roundTimer);
    room.roundTimer = setTimeout(() => endRound(room), room.remainingMs + 150);
    emitRoom(room, "gameResumed", { endsAt: room.endsAt, now: Date.now() });
  } else if (room.phase === "review") {
    emitReview(room); // re-sends the round + restarts the 5s auto-continue
  }
}

// ---------------------------------------------------------------------------
// Reconnect / teardown
// ---------------------------------------------------------------------------
function reattach(room, playerId, socket) {
  const idx = room.players.findIndex((p) => p.playerId === playerId);
  if (idx < 0) return;

  clearTimeout(room.grace[playerId]);
  room.grace[playerId] = null;

  room.sockets[playerId] = socket;
  room.connected[playerId] = true;
  socket.data.roomId = room.id;
  socket.join(room.id);

  sendSnapshot(room, playerId);

  const otherSock = sockOf(room, otherIndex(idx));
  if (otherSock) otherSock.emit("opponentBack");

  if (bothConnected(room)) resumeRoom(room);
}

function sendSnapshot(room, playerId) {
  const s = room.sockets[playerId];
  if (!s) return;
  const idx = room.players.findIndex((p) => p.playerId === playerId);
  const isGuesser = idx === room.guesserIndex;
  const base = {
    phase: room.phase,
    paused: room.paused,
    round: room.round,
    role: isGuesser ? "guesser" : "explainer",
    guesserName: room.players[room.guesserIndex].name,
    explainerName: room.players[otherIndex(room.guesserIndex)].name,
  };

  if (room.phase === "playing") {
    s.emit("resync", {
      ...base,
      endsAt: room.endsAt,
      now: Date.now(),
      score: room.score,
      count: room.log.length,
      word: isGuesser ? null : room.current.word,
      category: room.current.category,
    });
  } else if (room.phase === "review") {
    const r = room.results[room.round] || { guesser: base.guesserName, score: room.score, log: room.log };
    s.emit("resync", { ...base, score: r.score, log: r.log, autoMs: CONTINUE_TIMEOUT_MS });
  } else if (room.phase === "done") {
    s.emit("resync", { ...base, round1: room.results[1], round2: room.results[2], winner: room.winner });
  } else {
    s.emit("resync", base); // starting | transition -> show the splash
  }
}

function destroyRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  clearTimeout(room.roundTimer);
  clearTimeout(room.splashTimer);
  clearTimeout(room.continueTimer);
  Object.values(room.grace).forEach((t) => t && clearTimeout(t));
  room.players.forEach((p) => {
    playerRoom.delete(p.playerId);
    const s = room.sockets[p.playerId];
    if (s) {
      s.leave(roomId);
      s.data.roomId = null;
    }
  });
  rooms.delete(roomId);
}

// voluntary exit (Leave game / Play again / re-queue)
function leaveGame(playerId, notify) {
  const roomId = playerRoom.get(playerId);
  const room = roomId && rooms.get(roomId);
  if (!room) return;
  const idx = room.players.findIndex((p) => p.playerId === playerId);
  if (notify && idx >= 0) {
    const otherSock = sockOf(room, otherIndex(idx));
    if (otherSock) otherSock.emit("opponentLeft");
  }
  destroyRoom(roomId);
}

// ---------------------------------------------------------------------------
// Socket wiring
// ---------------------------------------------------------------------------
io.on("connection", (socket) => {
  socket.data.roomId = socket.data.roomId || null;

  // Sent by the client on every (re)connect. Carries a stable per-tab id so we
  // can glue a new socket back onto an in-progress game.
  socket.on("identify", ({ playerId, name } = {}) => {
    playerId = String(playerId || "").slice(0, 64);
    if (!playerId) return;
    socket.data.playerId = playerId;
    socket.data.name = String(name || "").trim().slice(0, 20) || socket.data.name || "Player";

    const roomId = playerRoom.get(playerId);
    const room = roomId && rooms.get(roomId);
    if (room) reattach(room, playerId, socket);
    else socket.emit("noSession");
  });

  socket.on("queue", ({ name } = {}) => {
    const playerId = socket.data.playerId;
    if (!playerId) return; // client must identify first
    socket.data.name = String(name || "").trim().slice(0, 20) || "Player";

    leaveGame(playerId, true); // in case they're coming from a finished/left game
    socket.data.roomId = null;

    queue = queue.filter((q) => q.playerId !== playerId && q.socket.connected);
    queue.push({ playerId, name: socket.data.name, socket });
    socket.emit("queued");
    tryMatch();
  });

  socket.on("cancelQueue", () => {
    queue = queue.filter((q) => q.playerId !== socket.data.playerId);
  });

  socket.on("chat", (payload) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.phase !== "playing" || room.paused) return;
    const idx = room.players.findIndex((p) => p.playerId === socket.data.playerId);
    if (idx < 0) return;

    const text = String((payload && payload.text) || "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!text) return;

    const isExplainer = idx !== room.guesserIndex;
    if (isExplainer) {
      const bad = violation(room.current.word, text);
      if (bad) {
        socket.emit("chatBlocked", { text, reason: bad });
        return;
      }
    }
    emitRoom(room, "chat", {
      name: room.players[idx].name,
      role: isExplainer ? "explainer" : "guesser",
      text,
    });
  });

  socket.on("gotit", () => guesserAction(socket, "correct"));
  socket.on("pass", () => guesserAction(socket, "pass"));

  function guesserAction(sock, result) {
    const room = rooms.get(sock.data.roomId);
    if (!room) return;
    if (room.players.findIndex((p) => p.playerId === sock.data.playerId) !== room.guesserIndex) return;
    advance(room, result);
  }

  socket.on("continueVote", () => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.phase !== "review" || room.paused) return;
    if (room.players.findIndex((p) => p.playerId === socket.data.playerId) < 0) return;
    room.continueVotes.add(socket.data.playerId);
    emitRoom(room, "continueCount", { votes: room.continueVotes.size, need: 2 });
    if (room.continueVotes.size >= 2) proceed(room);
  });

  socket.on("leaveGame", () => {
    queue = queue.filter((q) => q.playerId !== socket.data.playerId);
    leaveGame(socket.data.playerId, true);
    socket.data.roomId = null;
  });

  socket.on("disconnect", () => {
    const playerId = socket.data.playerId;
    queue = queue.filter((q) => q.playerId !== playerId);
    if (!playerId) return;

    const roomId = playerRoom.get(playerId);
    const room = roomId && rooms.get(roomId);
    if (!room) return;

    const idx = room.players.findIndex((p) => p.playerId === playerId);
    if (idx < 0) return;

    // ignore if this socket was already replaced by a newer one
    if (room.sockets[playerId] && room.sockets[playerId].id !== socket.id) return;

    room.connected[playerId] = false;
    room.sockets[playerId] = null;

    pauseRoom(room);

    const otherSock = sockOf(room, otherIndex(idx));
    if (otherSock) otherSock.emit("opponentDropped", { graceMs: GRACE_MS });

    clearTimeout(room.grace[playerId]);
    room.grace[playerId] = setTimeout(() => {
      const os = sockOf(room, otherIndex(idx));
      if (os) os.emit("opponentLeft");
      destroyRoom(room.id);
    }, GRACE_MS);
  });
});
