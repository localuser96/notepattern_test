import {
  accuracyFor,
  beatToMs,
  judgeTiming,
  msPerBeat,
  normalizeNotes,
  noteY,
  scoreFor,
  sanitizeJudgementWindows
} from "./engine.js";

const STORAGE_KEY = "pulse-lab-chart-v1";
const CELL_HEIGHT = 28;
const STEPS_PER_BEAT = 4;
const DEFAULT_KEY_MAPS = {
  4: ["d", "f", "j", "k"],
  5: ["s", "d", "f", "j", "k"],
  6: ["s", "d", "f", "j", "k", "l"],
  8: ["a", "s", "d", "f", "j", "k", "l", ";"]
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const elements = {
  accuracy: $("#accuracy"),
  beatRuler: $("#beat-ruler"),
  bpm: $("#bpm"),
  chartName: $("#chart-name"),
  clearChart: $("#clear-chart"),
  combo: $("#combo"),
  countIn: $("#count-in"),
  editorGrid: $("#editor-grid"),
  editorScroll: $("#editor-scroll"),
  exportChart: $("#export-chart"),
  fallingNotes: $("#falling-notes"),
  gameLanes: $("#game-lanes"),
  importChart: $("#import-chart"),
  inputOffset: $("#input-offset"),
  judgement: $("#judgement"),
  keyGuide: $("#key-guide"),
  keyBindingList: $("#key-binding-list"),
  laneCount: $("#lane-count"),
  laneLegend: $("#lane-legend"),
  loadDemo: $("#load-demo"),
  metronomeEnabled: $("#metronome-enabled"),
  measureCount: $("#measure-count"),
  noteCount: $("#note-count"),
  playState: $("#play-state"),
  playerHelp: $("#player-help"),
  playfield: $("#playfield"),
  resultAccuracy: $("#result-accuracy"),
  resultCombo: $("#result-combo"),
  resultDialog: $("#result-dialog"),
  resultGood: $("#result-good"),
  resultGrade: $("#result-grade"),
  resultGreat: $("#result-great"),
  resultMiss: $("#result-miss"),
  resultPerfect: $("#result-perfect"),
  resultReview: $("#result-review"),
  resetControls: $("#reset-controls"),
  saveStatus: $("#save-status"),
  score: $("#score"),
  scrollSpeed: $("#scroll-speed"),
  speedOutput: $("#speed-output"),
  startPlay: $("#start-play"),
  stopPlay: $("#stop-play"),
  toast: $("#toast"),
  toolHelp: $("#tool-help"),
  timingSummary: $("#timing-summary"),
  undo: $("#undo"),
  windowGood: $("#window-good"),
  windowGreat: $("#window-great"),
  windowPerfect: $("#window-perfect"),
  countInBeats: $("#count-in-beats"),
  hitSoundEnabled: $("#hit-sound-enabled")
};

function defaultSettings() {
  return {
    countInBeats: 4,
    hitSound: true,
    inputOffset: 0,
    keyMaps: structuredClone(DEFAULT_KEY_MAPS),
    metronome: true,
    windows: { perfect: 45, great: 90, good: 140 }
  };
}

const defaultChart = {
  name: "새 트레이닝",
  bpm: 120,
  laneCount: 4,
  measures: 4,
  scrollSpeed: 520,
  settings: defaultSettings(),
  notes: []
};

const savedChart = loadSavedChart();
const state = {
  chart: savedChart || structuredClone(defaultChart),
  game: null,
  keyCapture: null,
  pendingHold: null,
  saveTimer: 0,
  toastTimer: 0,
  tool: "tap",
  undoStack: []
};

function totalBeats() {
  return state.chart.measures * 4;
}

function activeKeys() {
  return state.chart.settings.keyMaps[state.chart.laneCount];
}

function createNoteId() {
  return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function loadSavedChart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed) return null;
    return sanitizeChart(parsed);
  } catch {
    return null;
  }
}

function sanitizeChart(chart) {
  const laneCount = [4, 5, 6, 8].includes(Number(chart.laneCount)) ? Number(chart.laneCount) : 4;
  const measures = [2, 4, 8].includes(Number(chart.measures)) ? Number(chart.measures) : 4;
  const incomingSettings = chart.settings || {};
  const settings = defaultSettings();
  settings.windows = sanitizeJudgementWindows(incomingSettings.windows);
  settings.countInBeats = [0, 1, 2, 4].includes(Number(incomingSettings.countInBeats))
    ? Number(incomingSettings.countInBeats)
    : 4;
  settings.inputOffset = Math.min(500, Math.max(-500, Number(incomingSettings.inputOffset) || 0));
  settings.metronome = incomingSettings.metronome !== false;
  settings.hitSound = incomingSettings.hitSound !== false;
  Object.keys(DEFAULT_KEY_MAPS).forEach((count) => {
    const incomingKeys = incomingSettings.keyMaps?.[count];
    if (Array.isArray(incomingKeys) && incomingKeys.length === Number(count)) {
      const normalized = incomingKeys.map((key) => String(key).toLowerCase());
      if (normalized.every(Boolean) && new Set(normalized).size === normalized.length) {
        settings.keyMaps[count] = normalized;
      }
    }
  });
  return {
    name: String(chart.name || "새 트레이닝").slice(0, 32),
    bpm: Math.min(400, Math.max(30, Number(chart.bpm) || 120)),
    laneCount,
    measures,
    scrollSpeed: Math.min(900, Math.max(280, Number(chart.scrollSpeed) || 520)),
    settings,
    notes: normalizeNotes(Array.isArray(chart.notes) ? chart.notes : [], laneCount, measures * 4)
  };
}

function scheduleSave() {
  elements.saveStatus.textContent = "저장 중...";
  window.clearTimeout(state.saveTimer);
  state.saveTimer = window.setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.chart));
    elements.saveStatus.textContent = "저장됨";
  }, 180);
}

function pushUndo() {
  state.undoStack.push(structuredClone(state.chart));
  if (state.undoStack.length > 30) state.undoStack.shift();
  elements.undo.disabled = false;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 1800);
}

function syncForm() {
  elements.chartName.value = state.chart.name;
  elements.bpm.value = state.chart.bpm;
  elements.laneCount.value = state.chart.laneCount;
  elements.measureCount.value = state.chart.measures;
  elements.scrollSpeed.value = state.chart.scrollSpeed;
  elements.speedOutput.value = state.chart.scrollSpeed;
  elements.speedOutput.textContent = state.chart.scrollSpeed;
  elements.windowPerfect.value = state.chart.settings.windows.perfect;
  elements.windowGreat.value = state.chart.settings.windows.great;
  elements.windowGood.value = state.chart.settings.windows.good;
  elements.inputOffset.value = state.chart.settings.inputOffset;
  elements.countInBeats.value = state.chart.settings.countInBeats;
  elements.metronomeEnabled.checked = state.chart.settings.metronome;
  elements.hitSoundEnabled.checked = state.chart.settings.hitSound;
  elements.playerHelp.textContent = `${state.chart.settings.countInBeats ? `카운트 ${state.chart.settings.countInBeats}박 후 시작` : "즉시 시작"} · 키를 길게 누르면 롱노트를 유지합니다.`;
}

function renderAll() {
  document.documentElement.style.setProperty("--lane-count", state.chart.laneCount);
  syncForm();
  renderKeyBindings();
  renderEditor();
  renderPlayfield();
}

function keyLabel(key) {
  if (key === " ") return "SPACE";
  if (key === ";") return ";";
  return key.length === 1 ? key.toUpperCase() : key.toUpperCase();
}

function renderKeyBindings() {
  elements.keyBindingList.innerHTML = activeKeys()
    .map(
      (key, index) =>
        `<button class="key-binding${state.keyCapture === index ? " listening" : ""}" type="button" data-key-index="${index}" data-lane-label="${index + 1}번">${state.keyCapture === index ? "입력..." : keyLabel(key)}</button>`
    )
    .join("");
}

function editorY(beat) {
  return totalBeats() * STEPS_PER_BEAT * CELL_HEIGHT - beat * STEPS_PER_BEAT * CELL_HEIGHT - CELL_HEIGHT / 2;
}

function renderEditor() {
  const keys = activeKeys();
  elements.laneLegend.innerHTML = keys.map((key, index) => `<span>${index + 1} · ${key.toUpperCase()}</span>`).join("");

  const totalSteps = totalBeats() * STEPS_PER_BEAT;
  const gridHeight = totalSteps * CELL_HEIGHT;
  elements.editorGrid.style.height = `${gridHeight}px`;
  elements.beatRuler.style.height = `${gridHeight}px`;
  elements.beatRuler.innerHTML = Array.from({ length: totalBeats() }, (_, beat) => {
    const y = editorY(beat);
    const measureClass = beat % 4 === 0 ? " measure" : "";
    const label = beat % 4 === 0 ? `M${beat / 4 + 1}` : `${beat + 1}`;
    return `<span class="beat-label${measureClass}" style="top:${y}px">${label}</span>`;
  }).join("");

  elements.editorGrid.innerHTML = "";
  state.chart.notes.forEach((note) => {
    const noteElement = document.createElement("button");
    const isHold = note.duration > 0;
    noteElement.type = "button";
    noteElement.className = `editor-note${isHold ? " hold" : ""}`;
    noteElement.dataset.noteId = note.id;
    noteElement.setAttribute(
      "aria-label",
      `${note.lane + 1}번 레인 ${note.beat + 1}박 ${isHold ? `${note.duration}박 롱노트` : "단노트"}`
    );
    noteElement.style.left = `calc(${note.lane} * 100% / var(--lane-count))`;
    noteElement.style.top = `${isHold ? editorY(note.beat + note.duration) : editorY(note.beat)}px`;
    if (isHold) noteElement.style.height = `${Math.max(18, note.duration * STEPS_PER_BEAT * CELL_HEIGHT)}px`;
    elements.editorGrid.append(noteElement);
  });

  if (state.pendingHold) {
    const marker = document.createElement("span");
    marker.className = "pending-marker";
    marker.style.left = `calc(${state.pendingHold.lane} * 100% / var(--lane-count))`;
    marker.style.top = `${editorY(state.pendingHold.beat)}px`;
    elements.editorGrid.append(marker);
  }

  const holdCount = state.chart.notes.filter((note) => note.duration > 0).length;
  elements.noteCount.textContent = `${state.chart.notes.length} NOTES · ${holdCount} HOLD`;
  if (!elements.editorScroll.dataset.oriented) {
    elements.editorScroll.dataset.oriented = "true";
    requestAnimationFrame(() => {
      elements.editorScroll.scrollTop = elements.editorScroll.scrollHeight;
    });
  }
}

function renderPlayfield() {
  const keys = activeKeys();
  elements.gameLanes.innerHTML = keys.map((_, index) => `<div class="game-lane" data-lane="${index}"></div>`).join("");
  elements.keyGuide.innerHTML = keys.map((key, index) => `<span class="key-cap" data-lane="${index}">${key === ";" ? ";" : key.toUpperCase()}</span>`).join("");
  if (!state.game) elements.fallingNotes.innerHTML = "";
}

function setTool(tool) {
  state.tool = tool;
  state.pendingHold = null;
  const help = {
    tap: "격자를 클릭하면 단노트가 배치됩니다.",
    hold: "같은 레인에서 롱노트의 시작과 끝을 차례로 선택하세요.",
    erase: "배치된 노트를 클릭하면 삭제됩니다."
  };
  elements.toolHelp.textContent = help[tool];
  $$(".tool-button").forEach((button) => {
    const active = button.dataset.tool === tool;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderEditor();
}

function editorPosition(event) {
  const rect = elements.editorGrid.getBoundingClientRect();
  const laneWidth = rect.width / state.chart.laneCount;
  const lane = Math.min(state.chart.laneCount - 1, Math.max(0, Math.floor((event.clientX - rect.left) / laneWidth)));
  const step = Math.min(
    totalBeats() * STEPS_PER_BEAT - 1,
    Math.max(0, Math.floor((rect.bottom - event.clientY) / CELL_HEIGHT))
  );
  return { lane, beat: step / STEPS_PER_BEAT };
}

function sortAndSaveNotes() {
  state.chart.notes = normalizeNotes(state.chart.notes, state.chart.laneCount, totalBeats());
  renderEditor();
  scheduleSave();
}

function handleEditorPointer(event) {
  if (state.game) return;
  const noteElement = event.target.closest(".editor-note");
  if (noteElement) {
    if (state.tool !== "erase") {
      showToast("이 노트를 지우려면 지우개 도구를 선택하세요.");
      return;
    }
    pushUndo();
    state.chart.notes = state.chart.notes.filter((note) => note.id !== noteElement.dataset.noteId);
    sortAndSaveNotes();
    return;
  }

  if (state.tool === "erase") return;
  const point = editorPosition(event);
  const occupied = state.chart.notes.some(
    (note) => note.lane === point.lane && point.beat >= note.beat && point.beat <= note.beat + note.duration
  );
  if (occupied) {
    showToast("해당 위치에는 이미 노트가 있습니다.");
    return;
  }

  if (state.tool === "tap") {
    pushUndo();
    state.chart.notes.push({ id: createNoteId(), ...point, duration: 0 });
    sortAndSaveNotes();
    return;
  }

  if (!state.pendingHold) {
    state.pendingHold = point;
    elements.toolHelp.textContent = `${point.lane + 1}번 레인 ${point.beat + 1}박 선택됨 · 끝 위치를 선택하세요.`;
    renderEditor();
    return;
  }

  if (state.pendingHold.lane !== point.lane) {
    state.pendingHold = point;
    elements.toolHelp.textContent = "레인이 바뀌어 시작점을 다시 선택했습니다. 같은 레인의 끝을 선택하세요.";
    renderEditor();
    return;
  }

  if (state.pendingHold.beat === point.beat) {
    state.pendingHold = null;
    elements.toolHelp.textContent = "시작점과 끝점이 같아 선택을 취소했습니다.";
    renderEditor();
    return;
  }

  const beat = Math.min(state.pendingHold.beat, point.beat);
  const endBeat = Math.max(state.pendingHold.beat, point.beat);
  pushUndo();
  state.chart.notes.push({ id: createNoteId(), lane: point.lane, beat, duration: endBeat - beat });
  state.pendingHold = null;
  elements.toolHelp.textContent = "롱노트를 배치했습니다. 다음 시작점을 선택하세요.";
  sortAndSaveNotes();
}

function demoNotes(laneCount) {
  const notes = [];
  const addTap = (lane, beat) => notes.push({ id: createNoteId(), lane: lane % laneCount, beat, duration: 0 });
  const addHold = (lane, beat, duration) => notes.push({ id: createNoteId(), lane: lane % laneCount, beat, duration });
  [0, 1, 2, 3].forEach((lane, index) => addTap(lane, index));
  addTap(Math.min(2, laneCount - 1), 4);
  addTap(Math.min(1, laneCount - 1), 4.5);
  addTap(Math.min(3, laneCount - 1), 5);
  addTap(0, 5.5);
  addHold(0, 6, 2);
  addTap(laneCount - 1, 6.5);
  addTap(Math.max(1, laneCount - 2), 7);
  addTap(laneCount - 1, 7.5);
  for (let beat = 9; beat < 12; beat += 0.5) addTap(Math.round(beat * 2) % laneCount, beat);
  addHold(Math.floor((laneCount - 1) / 2), 12, 2.5);
  addTap(laneCount - 1, 12);
  addTap(laneCount - 1, 13);
  addTap(0, 14.5);
  addTap(laneCount - 1, 15);
  return normalizeNotes(notes, laneCount, totalBeats());
}

function handleChartSetting(key, value, shouldRender = true) {
  if (state.game) return;
  pushUndo();
  state.chart[key] = value;
  state.pendingHold = null;
  state.chart = sanitizeChart(state.chart);
  if (shouldRender) renderAll();
  scheduleSave();
}

function updateControlSettings(mutator) {
  if (state.game) return;
  pushUndo();
  mutator(state.chart.settings);
  state.chart = sanitizeChart(state.chart);
  renderAll();
  scheduleSave();
}

function setGameUi(active) {
  elements.startPlay.disabled = active;
  elements.stopPlay.disabled = !active;
  elements.playState.textContent = active ? "PLAYING" : "READY";
  elements.playState.classList.toggle("playing", active);
  elements.editorGrid.setAttribute("aria-disabled", String(active));
}

function resetStats() {
  elements.score.textContent = "000000";
  elements.combo.textContent = "0";
  elements.accuracy.textContent = "100.00%";
  elements.judgement.textContent = "";
}

function prepareRuntimeNotes() {
  elements.fallingNotes.innerHTML = "";
  return state.chart.notes.map((note) => {
    const noteElement = document.createElement("span");
    noteElement.className = `game-note${note.duration > 0 ? " hold" : ""}`;
    noteElement.style.left = `calc(${note.lane} * 100% / var(--lane-count))`;
    noteElement.style.width = `calc(100% / var(--lane-count))`;
    elements.fallingNotes.append(noteElement);
    return {
      ...note,
      completed: false,
      element: noteElement,
      holding: false,
      startJudged: false
    };
  });
}

function startGame() {
  if (state.chart.notes.length === 0) {
    showToast("먼저 노트를 하나 이상 배치하세요.");
    return;
  }

  resetStats();
  document.body.classList.add("play-focus");
  elements.playfield.focus({ preventScroll: true });
  setGameUi(true);
  const beatMs = msPerBeat(state.chart.bpm);
  state.game = {
    animationId: 0,
    audio: createAudio(),
    beatMs,
    countInBeats: state.chart.settings.countInBeats,
    counts: { perfect: 0, great: 0, good: 0, miss: 0 },
    keysDown: new Set(),
    lastMetronome: -1,
    maxCombo: 0,
    combo: 0,
    notes: prepareRuntimeNotes(),
    records: [],
    score: 0,
    startAt: performance.now()
  };
  gameFrame(performance.now());
}

function createAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  try {
    const context = new AudioContextClass();
    context.resume();
    return context;
  } catch {
    return null;
  }
}

function playClick(accent = false, hit = false) {
  const context = state.game?.audio;
  if (!context) return;
  if (hit && !state.chart.settings.hitSound) return;
  if (!hit && !state.chart.settings.metronome) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = hit ? "sine" : "square";
  oscillator.frequency.value = hit ? 620 : accent ? 1080 : 760;
  gain.gain.setValueAtTime(hit ? 0.035 : 0.025, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + (hit ? 0.045 : 0.025));
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.05);
}

function gameElapsed(now = performance.now()) {
  return now - state.game.startAt - state.game.countInBeats * state.game.beatMs;
}

function gameNoteTime(beat) {
  return beatToMs(beat, state.chart.bpm, state.chart.settings.inputOffset);
}

function gameNoteY(beat, elapsed, judgementY) {
  return noteY(
    beat,
    elapsed - state.chart.settings.inputOffset,
    state.chart.bpm,
    judgementY,
    state.chart.scrollSpeed
  );
}

function gameFrame(now) {
  if (!state.game) return;
  const elapsed = gameElapsed(now);
  const beatIndex = Math.floor((elapsed + state.game.countInBeats * state.game.beatMs) / state.game.beatMs);
  if (beatIndex !== state.game.lastMetronome && beatIndex >= 0) {
    state.game.lastMetronome = beatIndex;
    playClick(beatIndex % 4 === 0);
  }

  if (elapsed < 0) {
    elements.countIn.textContent = Math.min(
      state.game.countInBeats,
      Math.max(1, Math.ceil(-elapsed / state.game.beatMs))
    );
  } else {
    elements.countIn.textContent = "";
  }

  updateRuntimeNotes(elapsed);
  const finishAt = totalBeats() * state.game.beatMs + 900;
  if (elapsed >= finishAt) {
    finishGame();
    return;
  }
  state.game.animationId = requestAnimationFrame(gameFrame);
}

function updateRuntimeNotes(elapsed) {
  const judgementY = elements.playfield.clientHeight * 0.82;
  state.game.notes.forEach((note) => {
    const startY = gameNoteY(note.beat, elapsed, judgementY);
    const endY = gameNoteY(note.beat + note.duration, elapsed, judgementY);

    if (note.duration > 0) {
      const bottomY = note.holding ? judgementY : startY;
      note.element.style.top = `${endY}px`;
      note.element.style.height = `${Math.max(12, bottomY - endY)}px`;
    } else {
      note.element.style.top = `${startY - 6}px`;
    }

    note.element.hidden = endY > elements.playfield.clientHeight + 80 || startY < -120;
    note.element.classList.toggle("hit", note.startJudged);

    const startTime = gameNoteTime(note.beat);
    const endTime = gameNoteTime(note.beat + note.duration);
    if (!note.startJudged && elapsed - startTime > state.chart.settings.windows.good) {
      note.startJudged = true;
      note.completed = true;
      applyJudgement("miss");
    } else if (note.holding && elapsed >= endTime) {
      note.holding = false;
      note.completed = true;
      applyJudgement("perfect");
    }
  });
}

function lanePress(lane) {
  if (!state.game) return;
  const elapsed = gameElapsed();
  const record = {
    id: createNoteId(),
    kind: "press",
    lane,
    elapsed,
    beat: (elapsed - state.chart.settings.inputOffset) / state.game.beatMs,
    matchedNoteId: null,
    judgement: "extra",
    delta: null
  };
  state.game.records.push(record);
  const candidates = state.game.notes
    .filter((note) => note.lane === lane && !note.startJudged)
    .map((note) => ({ note, delta: elapsed - gameNoteTime(note.beat) }))
    .filter((candidate) => Math.abs(candidate.delta) <= state.chart.settings.windows.good)
    .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
  if (!candidates.length) return;

  const { note, delta } = candidates[0];
  const judgement = judgeTiming(delta, state.chart.settings.windows);
  record.matchedNoteId = note.id;
  record.judgement = judgement;
  record.delta = delta;
  note.startRecord = record;
  note.startJudged = true;
  note.holding = note.duration > 0;
  note.completed = note.duration === 0;
  applyJudgement(judgement);
  playClick(false, true);
}

function laneRelease(lane) {
  if (!state.game) return;
  const elapsed = gameElapsed();
  const held = state.game.notes.find((note) => note.lane === lane && note.holding && !note.completed);
  if (!held) return;
  const endTime = gameNoteTime(held.beat + held.duration);
  const delta = elapsed - endTime;
  const record = {
    id: createNoteId(),
    kind: "release",
    lane,
    elapsed,
    beat: (elapsed - state.chart.settings.inputOffset) / state.game.beatMs,
    matchedNoteId: held.id,
    judgement: delta < -state.chart.settings.windows.good
      ? "miss"
      : judgeTiming(delta, state.chart.settings.windows),
    delta
  };
  state.game.records.push(record);
  held.releaseRecord = record;
  held.holding = false;
  held.completed = true;
  applyJudgement(record.judgement);
}

function applyJudgement(judgement) {
  if (!state.game) return;
  state.game.counts[judgement] += 1;
  state.game.score += scoreFor(judgement);
  if (judgement === "miss") {
    state.game.combo = 0;
  } else {
    state.game.combo += 1;
    state.game.maxCombo = Math.max(state.game.maxCombo, state.game.combo);
  }

  const accuracy = accuracyFor(state.game.counts);
  elements.score.textContent = String(state.game.score).padStart(6, "0");
  elements.combo.textContent = state.game.combo;
  elements.accuracy.textContent = `${accuracy.toFixed(2)}%`;
  elements.judgement.textContent = judgement.toUpperCase();
  elements.judgement.className = `judgement ${judgement}`;
  void elements.judgement.offsetWidth;
  elements.judgement.classList.add("flash");
}

function stopGame(showResult = false) {
  if (!state.game) return;
  const snapshot = state.game;
  cancelAnimationFrame(snapshot.animationId);
  snapshot.audio?.close();
  state.game = null;
  document.body.classList.remove("play-focus");
  elements.countIn.textContent = "";
  elements.judgement.textContent = "";
  $$(".game-lane, .key-cap").forEach((element) => element.classList.remove("active"));
  setGameUi(false);
  renderPlayfield();
  if (showResult) showResults(snapshot);
}

function finishGame() {
  stopGame(true);
}

function showResults(game) {
  const accuracy = accuracyFor(game.counts);
  const grade = accuracy >= 99 ? "S" : accuracy >= 95 ? "A" : accuracy >= 90 ? "B" : accuracy >= 80 ? "C" : "D";
  elements.resultGrade.textContent = grade;
  elements.resultAccuracy.textContent = `${accuracy.toFixed(2)}%`;
  elements.resultPerfect.textContent = game.counts.perfect;
  elements.resultGreat.textContent = game.counts.great;
  elements.resultGood.textContent = game.counts.good;
  elements.resultMiss.textContent = game.counts.miss;
  elements.resultCombo.textContent = game.maxCombo;
  renderSessionReview(game);
  elements.resultDialog.showModal();
}

function renderSessionReview(game) {
  const stepHeight = 18;
  const gridHeight = totalBeats() * STEPS_PER_BEAT * stepHeight;
  const reviewY = (beat) => gridHeight - beat * STEPS_PER_BEAT * stepHeight - stepHeight / 2;
  const ruler = document.createElement("div");
  const grid = document.createElement("div");
  ruler.className = "review-ruler";
  grid.className = "review-grid";
  ruler.style.height = `${gridHeight}px`;
  grid.style.height = `${gridHeight}px`;
  ruler.innerHTML = Array.from({ length: totalBeats() }, (_, beat) => {
    const measureClass = beat % 4 === 0 ? " measure" : "";
    const label = beat % 4 === 0 ? `M${beat / 4 + 1}` : `${beat + 1}`;
    return `<span class="${measureClass.trim()}" style="top:${reviewY(beat)}px">${label}</span>`;
  }).join("");

  game.notes.forEach((note) => {
    const original = document.createElement("span");
    const isHold = note.duration > 0;
    original.className = `review-note${isHold ? " hold" : ""}${note.startRecord ? "" : " missed"}`;
    original.style.left = `calc(${note.lane} * 100% / var(--lane-count))`;
    original.style.top = `${isHold ? reviewY(note.beat + note.duration) : reviewY(note.beat)}px`;
    if (isHold) original.style.height = `${Math.max(14, note.duration * STEPS_PER_BEAT * stepHeight)}px`;
    original.title = note.startRecord
      ? `원본 ${note.beat + 1}박 · ${note.startRecord.delta >= 0 ? "+" : ""}${Math.round(note.startRecord.delta)}ms`
      : `원본 ${note.beat + 1}박 · MISS`;
    grid.append(original);
  });

  game.records
    .filter((record) => record.beat >= 0 && record.beat <= totalBeats())
    .forEach((record) => {
      const marker = document.createElement("span");
      marker.className = `review-hit${record.kind === "release" ? " release" : ""}${record.judgement === "extra" ? " extra" : ""}`;
      marker.style.left = `calc(${record.lane} * 100% / var(--lane-count))`;
      marker.style.top = `${reviewY(record.beat)}px`;
      const label = document.createElement("span");
      label.textContent = record.delta === null
        ? "EXTRA"
        : `${record.delta >= 0 ? "+" : ""}${Math.round(record.delta)}ms`;
      marker.append(label);
      marker.title = `${record.kind === "release" ? "키 해제" : "키 입력"} · ${label.textContent}`;
      grid.append(marker);
    });

  elements.resultReview.replaceChildren(ruler, grid);
  requestAnimationFrame(() => {
    elements.resultReview.scrollTop = elements.resultReview.scrollHeight;
  });

  const matchedPresses = game.records.filter(
    (record) => record.kind === "press" && record.matchedNoteId && Number.isFinite(record.delta)
  );
  if (!matchedPresses.length) {
    elements.timingSummary.textContent = "판정된 키 입력이 없습니다.";
    return;
  }
  const average = matchedPresses.reduce((sum, record) => sum + record.delta, 0) / matchedPresses.length;
  const direction = Math.abs(average) < 1 ? "정확한 중앙" : average < 0 ? "평균적으로 빠름" : "평균적으로 늦음";
  elements.timingSummary.textContent = `${direction} · 평균 ${average >= 0 ? "+" : ""}${average.toFixed(1)}ms · 입력 ${game.records.length}회`;
}

function setLaneVisual(lane, active) {
  document.querySelector(`.game-lane[data-lane="${lane}"]`)?.classList.toggle("active", active);
  document.querySelector(`.key-cap[data-lane="${lane}"]`)?.classList.toggle("active", active);
}

function handleKeyDown(event) {
  if (state.keyCapture !== null && !state.game) {
    event.preventDefault();
    if (event.key === "Escape") {
      state.keyCapture = null;
      renderKeyBindings();
      return;
    }
    if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(event.key)) return;
    const capturedKey = event.key.toLowerCase();
    if (activeKeys().some((key, index) => key === capturedKey && index !== state.keyCapture)) {
      showToast("이미 다른 레인에서 사용 중인 키입니다.");
      return;
    }
    pushUndo();
    activeKeys()[state.keyCapture] = capturedKey;
    state.keyCapture = null;
    renderAll();
    scheduleSave();
    showToast("키 배치를 변경했습니다.");
    return;
  }
  if (state.game && event.key === "Escape") {
    event.preventDefault();
    stopGame(false);
    return;
  }
  if (!state.game || event.repeat) return;
  const key = event.key.toLowerCase();
  const lane = activeKeys().indexOf(key);
  if (lane < 0) return;
  event.preventDefault();
  state.game.keysDown.add(key);
  setLaneVisual(lane, true);
  lanePress(lane);
}

function handleKeyUp(event) {
  if (!state.game) return;
  const key = event.key.toLowerCase();
  const lane = activeKeys().indexOf(key);
  if (lane < 0) return;
  event.preventDefault();
  state.game.keysDown.delete(key);
  setLaneVisual(lane, false);
  laneRelease(lane);
}

function exportChart() {
  const data = JSON.stringify({ format: "pulse-lab-chart", version: 1, ...state.chart }, null, 2);
  const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  const anchor = document.createElement("a");
  const safeName = state.chart.name.replace(/[\\/:*?"<>|]/g, "-") || "pattern";
  anchor.href = url;
  anchor.download = `${safeName}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("패턴 JSON을 내보냈습니다.");
}

async function importChart(file) {
  try {
    const parsed = JSON.parse(await file.text());
    pushUndo();
    state.chart = sanitizeChart(parsed);
    state.pendingHold = null;
    renderAll();
    scheduleSave();
    showToast("패턴을 불러왔습니다.");
  } catch {
    showToast("올바른 PULSE LAB JSON 파일이 아닙니다.");
  } finally {
    elements.importChart.value = "";
  }
}

$$('.tool-button').forEach((button) => button.addEventListener("click", () => setTool(button.dataset.tool)));
elements.keyBindingList.addEventListener("click", (event) => {
  const button = event.target.closest(".key-binding");
  if (!button || state.game) return;
  state.keyCapture = Number(button.dataset.keyIndex);
  renderKeyBindings();
});
elements.editorGrid.addEventListener("pointerdown", handleEditorPointer);
elements.chartName.addEventListener("input", (event) => {
  state.chart.name = event.target.value.slice(0, 32);
  scheduleSave();
});
elements.bpm.addEventListener("change", (event) => handleChartSetting("bpm", Number(event.target.value)));
elements.bpm.addEventListener("input", (event) => {
  const bpm = Number(event.target.value);
  if (Number.isFinite(bpm) && bpm >= 30 && bpm <= 400) {
    state.chart.bpm = bpm;
    scheduleSave();
  }
});
elements.laneCount.addEventListener("change", (event) => handleChartSetting("laneCount", Number(event.target.value)));
elements.measureCount.addEventListener("change", (event) => {
  delete elements.editorScroll.dataset.oriented;
  handleChartSetting("measures", Number(event.target.value));
});
elements.scrollSpeed.addEventListener("input", (event) => {
  state.chart.scrollSpeed = Number(event.target.value);
  elements.speedOutput.textContent = state.chart.scrollSpeed;
  scheduleSave();
});
const updateWindows = () => updateControlSettings((settings) => {
  settings.windows = {
    perfect: Number(elements.windowPerfect.value),
    great: Number(elements.windowGreat.value),
    good: Number(elements.windowGood.value)
  };
});
const stageWindows = () => {
  state.chart.settings.windows = sanitizeJudgementWindows({
    perfect: Number(elements.windowPerfect.value),
    great: Number(elements.windowGreat.value),
    good: Number(elements.windowGood.value)
  });
  scheduleSave();
};
elements.windowPerfect.addEventListener("input", stageWindows);
elements.windowGreat.addEventListener("input", stageWindows);
elements.windowGood.addEventListener("input", stageWindows);
elements.windowPerfect.addEventListener("change", updateWindows);
elements.windowGreat.addEventListener("change", updateWindows);
elements.windowGood.addEventListener("change", updateWindows);
elements.inputOffset.addEventListener("change", (event) => updateControlSettings((settings) => {
  settings.inputOffset = Number(event.target.value);
}));
elements.inputOffset.addEventListener("input", (event) => {
  const offset = Number(event.target.value);
  if (Number.isFinite(offset) && offset >= -500 && offset <= 500) {
    state.chart.settings.inputOffset = offset;
    scheduleSave();
  }
});
elements.countInBeats.addEventListener("change", (event) => updateControlSettings((settings) => {
  settings.countInBeats = Number(event.target.value);
}));
elements.metronomeEnabled.addEventListener("change", (event) => updateControlSettings((settings) => {
  settings.metronome = event.target.checked;
}));
elements.hitSoundEnabled.addEventListener("change", (event) => updateControlSettings((settings) => {
  settings.hitSound = event.target.checked;
}));
elements.resetControls.addEventListener("click", () => {
  if (state.game) return;
  pushUndo();
  state.chart.settings = defaultSettings();
  state.keyCapture = null;
  renderAll();
  scheduleSave();
  showToast("조작 설정을 기본값으로 되돌렸습니다.");
});
elements.loadDemo.addEventListener("click", () => {
  if (state.game) return;
  pushUndo();
  state.chart.notes = demoNotes(state.chart.laneCount);
  renderEditor();
  scheduleSave();
  showToast("16박 예제 패턴을 불러왔습니다.");
});
elements.clearChart.addEventListener("click", () => {
  if (state.game || state.chart.notes.length === 0) return;
  pushUndo();
  state.chart.notes = [];
  state.pendingHold = null;
  renderEditor();
  scheduleSave();
  showToast("모든 노트를 지웠습니다. 실행 취소로 복구할 수 있습니다.");
});
elements.undo.addEventListener("click", () => {
  if (state.game || state.undoStack.length === 0) return;
  state.chart = state.undoStack.pop();
  state.pendingHold = null;
  renderAll();
  scheduleSave();
  elements.undo.disabled = state.undoStack.length === 0;
});
elements.exportChart.addEventListener("click", exportChart);
elements.importChart.addEventListener("change", (event) => {
  if (event.target.files[0]) importChart(event.target.files[0]);
});
elements.startPlay.addEventListener("click", startGame);
elements.stopPlay.addEventListener("click", () => stopGame(false));
window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);
window.addEventListener("blur", () => {
  if (!state.game) return;
  [...state.game.keysDown].forEach((key) => {
    const lane = activeKeys().indexOf(key);
    setLaneVisual(lane, false);
    laneRelease(lane);
  });
  state.game.keysDown.clear();
});

elements.undo.disabled = true;
renderAll();
