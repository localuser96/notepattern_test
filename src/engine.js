export const JUDGEMENT_WINDOWS = Object.freeze({
  perfect: 45,
  great: 90,
  good: 140
});

export function sanitizeJudgementWindows(windows = JUDGEMENT_WINDOWS) {
  const perfect = Math.min(200, Math.max(10, Number(windows.perfect) || JUDGEMENT_WINDOWS.perfect));
  const great = Math.min(300, Math.max(perfect, Number(windows.great) || JUDGEMENT_WINDOWS.great));
  const good = Math.min(500, Math.max(great, Number(windows.good) || JUDGEMENT_WINDOWS.good));
  return { perfect, great, good };
}

export function msPerBeat(bpm) {
  const safeBpm = Math.min(400, Math.max(30, Number(bpm) || 120));
  return 60000 / safeBpm;
}

export function beatToMs(beat, bpm, offset = 0) {
  return Number(offset) + Number(beat) * msPerBeat(bpm);
}

export function chartDurationMs(notes, bpm, countInBeats = 4) {
  const lastBeat = notes.reduce(
    (latest, note) => Math.max(latest, Number(note.beat) + Number(note.duration || 0)),
    0
  );
  return (lastBeat + countInBeats) * msPerBeat(bpm);
}

export function judgeTiming(deltaMs, windows = JUDGEMENT_WINDOWS) {
  const safeWindows = sanitizeJudgementWindows(windows);
  const absoluteDelta = Math.abs(deltaMs);
  if (absoluteDelta <= safeWindows.perfect) return "perfect";
  if (absoluteDelta <= safeWindows.great) return "great";
  if (absoluteDelta <= safeWindows.good) return "good";
  return "miss";
}

export function normalizeNotes(notes, laneCount, totalBeats) {
  const safeLanes = Math.min(8, Math.max(4, Number(laneCount) || 4));
  const maxBeat = Math.max(4, Number(totalBeats) || 16);

  return notes
    .map((note, index) => ({
      id: String(note.id || `note-${index}-${note.lane}-${note.beat}`),
      lane: Math.round(Number(note.lane)),
      beat: Math.round(Number(note.beat) * 4) / 4,
      duration: Math.max(0, Math.round(Number(note.duration || 0) * 4) / 4)
    }))
    .filter(
      (note) =>
        Number.isFinite(note.beat) &&
        Number.isFinite(note.lane) &&
        note.lane >= 0 &&
        note.lane < safeLanes &&
        note.beat >= 0 &&
        note.beat <= maxBeat &&
        note.beat + note.duration <= maxBeat
    )
    .sort((a, b) => a.beat - b.beat || a.lane - b.lane);
}

export function noteY(noteBeat, elapsedMs, bpm, judgementY, pixelsPerSecond) {
  const noteTime = beatToMs(noteBeat, bpm);
  return judgementY - ((noteTime - elapsedMs) / 1000) * pixelsPerSecond;
}

export function scoreFor(judgement) {
  return { perfect: 1000, great: 700, good: 350, miss: 0 }[judgement] || 0;
}

export function accuracyFor(counts) {
  const total = counts.perfect + counts.great + counts.good + counts.miss;
  if (!total) return 100;
  const weighted = counts.perfect + counts.great * 0.7 + counts.good * 0.35;
  return (weighted / total) * 100;
}
