/* global io */
(function () {
  "use strict";

  const socket = io();

  const $ = (id) => document.getElementById(id);
  const screens = {
    home: $("screen-home"),
    splash: $("screen-splash"),
    game: $("screen-game"),
    review: $("screen-review"),
    final: $("screen-final"),
  };

  function show(name) {
    Object.values(screens).forEach((s) => s.classList.remove("active"));
    screens[name].classList.add("active");
  }

  // ---- local state -------------------------------------------------------
  let state = {
    name: "",
    role: null, // "guesser" | "explainer"
    round: 1,
    clockOffset: 0, // serverNow - clientNow
    endsAt: 0,
    timerId: null,
    continueId: null,
    voted: false,
  };

  try {
    const saved = localStorage.getItem("gw_name");
    if (saved) $("name").value = saved;
  } catch (e) {}

  // ---- toast -----------------------------------------------------------
  let toastTimer = null;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add("hidden"), 3500);
  }

  // ---- HOME ----------------------------------------------------------
  $("queueBtn").addEventListener("click", () => {
    const name = $("name").value.trim().slice(0, 20);
    if (!name) {
      $("name").focus();
      toast("Enter a name first");
      return;
    }
    state.name = name;
    try { localStorage.setItem("gw_name", name); } catch (e) {}
    socket.emit("queue", { name });
    $("queueBtn").classList.add("hidden");
    $("queueStatus").classList.remove("hidden");
  });

  $("cancelQueueBtn").addEventListener("click", () => {
    socket.emit("cancelQueue");
    $("queueBtn").classList.remove("hidden");
    $("queueStatus").classList.add("hidden");
  });

  $("playAgainBtn").addEventListener("click", () => {
    resetToHome();
    socket.emit("queue", { name: state.name });
    $("queueBtn").classList.add("hidden");
    $("queueStatus").classList.remove("hidden");
  });

  $("leaveGameBtn").addEventListener("click", () => {
    if (!confirm("Leave the game?")) return;
    socket.emit("leaveGame");
    resetToHome();
  });

  function resetToHome() {
    stopTimer();
    clearInterval(state.continueId);
    show("home");
    $("queueBtn").classList.remove("hidden");
    $("queueStatus").classList.add("hidden");
    $("chatLog").innerHTML = "";
  }

  // ---- TIMER -------------------------------------------------------
  function serverNow() {
    return Date.now() + state.clockOffset;
  }

  function startTimer(endsAt) {
    state.endsAt = endsAt;
    stopTimer();
    renderTimer();
    state.timerId = setInterval(renderTimer, 250);
  }
  function stopTimer() {
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = null;
  }
  function renderTimer() {
    const ms = Math.max(0, state.endsAt - serverNow());
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    const el = $("timer");
    el.textContent = m + ":" + String(s).padStart(2, "0");
    el.classList.toggle("warn", total <= 15);
    if (ms <= 0) stopTimer();
  }

  // ---- CHAT ------------------------------------------------------
  function addMsg(text, cls, who) {
    const log = $("chatLog");
    const d = document.createElement("div");
    d.className = "msg " + cls;
    if (who) {
      const w = document.createElement("span");
      w.className = "who";
      w.textContent = who;
      d.appendChild(w);
    }
    d.appendChild(document.createTextNode(text));
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }

  $("chatForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("chatInput");
    const text = input.value.trim();
    if (!text) return;
    socket.emit("chat", { text });
    input.value = "";
    $("chatWarn").classList.add("hidden");
  });

  // ---- GUESSER BUTTONS -----------------------------------------
  $("gotitBtn").addEventListener("click", () => {
    socket.emit("gotit");
    flashLock($("gotitBtn"));
  });
  $("passBtn").addEventListener("click", () => {
    socket.emit("pass");
    flashLock($("passBtn"));
  });
  function flashLock(btn) {
    btn.disabled = true;
    setTimeout(() => { btn.disabled = false; }, 350);
  }

  // ---- CONTINUE ----------------------------------------------
  $("continueBtn").addEventListener("click", () => {
    if (state.voted) return;
    state.voted = true;
    socket.emit("continueVote");
    $("continueBtn").disabled = true;
    $("continueBtn").textContent = "Waiting for other player…";
  });

  // ==========================================================
  // SOCKET EVENTS
  // ==========================================================
  socket.on("connect", () => {});

  socket.on("disconnect", () => {
    toast("Disconnected from server");
  });

  socket.on("queued", () => {
    $("queueBtn").classList.add("hidden");
    $("queueStatus").classList.remove("hidden");
  });

  socket.on("gameStart", (data) => {
    $("chatLog").innerHTML = "";
    addMsg("Matched with " + data.players.filter((n) => n !== state.name).join(", "), "sys");
  });

  socket.on("roundStarting", (data) => {
    state.round = data.round;
    $("splashRound").textContent = "Round " + data.round + " of 2";
    $("splashName").textContent = data.guesserName;
    $("splashSub").textContent = "is guessing";
    show("splash");
  });

  socket.on("roundState", (data) => {
    state.role = data.role;
    state.round = data.round;
    state.clockOffset = data.now - Date.now();
    state.voted = false;

    $("roundTag").textContent = data.round + " / 2";
    $("score").textContent = data.score;

    const other = data.role === "guesser" ? data.explainerName : data.guesserName;
    if (data.role === "guesser") {
      $("roleBanner").innerHTML = "You are <b>guessing</b> · " + escapeHtml(other) + " explains";
      $("guesserView").classList.remove("hidden");
      $("explainerView").classList.add("hidden");
      $("chatInput").placeholder = "Type your guess…";
    } else {
      $("roleBanner").innerHTML = "You are <b>explaining</b> · " + escapeHtml(other) + " guesses";
      $("explainerView").classList.remove("hidden");
      $("guesserView").classList.add("hidden");
      $("wordMain").textContent = data.word;
      $("wordCategory").textContent = data.category;
      $("chatInput").placeholder = "Type a clue (can't contain the word)…";
    }

    $("chatWarn").classList.add("hidden");
    show("game");
    startTimer(data.endsAt);
  });

  socket.on("word", (data) => {
    if (state.role !== "explainer") return;
    $("wordMain").textContent = data.word;
    $("wordCategory").textContent = data.category;
    $("chatWarn").classList.add("hidden");
  });

  socket.on("progress", (data) => {
    $("score").textContent = data.score;
  });

  socket.on("chat", (data) => {
    const mine = data.name === state.name;
    addMsg(data.text, mine ? "me" : "them", mine ? null : data.name);
  });

  socket.on("chatBlocked", (data) => {
    const warn = $("chatWarn");
    warn.textContent = 'Blocked — "' + data.text + '" gives it away ("' + data.reason + '"). Try another clue.';
    warn.classList.remove("hidden");
  });

  socket.on("review", (data) => {
    stopTimer();
    state.voted = false;
    $("reviewRound").textContent = data.round;
    $("reviewGuesser").textContent = data.guesserName;
    $("reviewScore").textContent = data.score;

    const list = $("reviewList");
    list.innerHTML = "";
    data.log.forEach((item) => {
      const li = document.createElement("li");
      li.className = item.result;
      const icon = item.result === "correct" ? "✓" : item.result === "pass" ? "↦" : "⏱";
      li.innerHTML =
        '<span class="r-icon">' + icon + "</span>" +
        '<span class="r-word">' + escapeHtml(item.word) + "</span>" +
        '<span class="r-cat">' + escapeHtml(item.category) + "</span>";
      list.appendChild(li);
    });

    const btn = $("continueBtn");
    btn.disabled = false;
    btn.textContent = "Continue";
    $("continueVotes").textContent = "0 / 2 ready";

    // local visual countdown for the 5s auto-continue
    clearInterval(state.continueId);
    let left = Math.ceil(data.autoMs / 1000);
    $("continueAuto").textContent = "auto in " + left + "s";
    state.continueId = setInterval(() => {
      left -= 1;
      $("continueAuto").textContent = left > 0 ? "auto in " + left + "s" : "starting…";
      if (left <= 0) clearInterval(state.continueId);
    }, 1000);

    show("review");
  });

  socket.on("continueCount", (data) => {
    $("continueVotes").textContent = data.votes + " / " + data.need + " ready";
  });

  socket.on("final", (data) => {
    stopTimer();
    clearInterval(state.continueId);
    $("finalWinner").textContent = data.winner === "Tie" ? "It's a tie!" : data.winner + " wins!";
    $("finalName1").textContent = data.round1.guesser;
    $("finalScore1").textContent = data.round1.score;
    $("finalName2").textContent = data.round2.guesser;
    $("finalScore2").textContent = data.round2.score;
    show("final");
  });

  socket.on("opponentLeft", () => {
    toast("The other player left. Back to the lobby.");
    resetToHome();
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
})();
