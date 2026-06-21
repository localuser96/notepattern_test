import test from "node:test";
import assert from "node:assert/strict";

import {
  accuracyFor,
  beatToMs,
  chartDurationMs,
  judgeTiming,
  msPerBeat,
  normalizeNotes,
  sanitizeJudgementWindows
} from "../src/engine.js";

test("BPM을 밀리초 단위 박자로 변환한다", () => {
  assert.equal(msPerBeat(120), 500);
  assert.equal(beatToMs(4, 120), 2000);
});

test("입력 오차를 네 단계로 판정한다", () => {
  assert.equal(judgeTiming(-20), "perfect");
  assert.equal(judgeTiming(70), "great");
  assert.equal(judgeTiming(120), "good");
  assert.equal(judgeTiming(180), "miss");
});

test("롱노트 끝을 포함해 패턴 길이를 계산한다", () => {
  const notes = [{ beat: 2, duration: 3 }, { beat: 7, duration: 0 }];
  assert.equal(chartDurationMs(notes, 120, 0), 3500);
});

test("노트를 보정하고 범위를 벗어난 데이터를 제거한다", () => {
  const notes = normalizeNotes(
    [
      { lane: 1, beat: 2.13, duration: 0.7 },
      { lane: 7, beat: 1, duration: 0 },
      { lane: -1, beat: 3, duration: 0 }
    ],
    4,
    16
  );
  assert.deepEqual(notes.map(({ lane, beat, duration }) => ({ lane, beat, duration })), [
    { lane: 1, beat: 2.25, duration: 0.75 }
  ]);
});

test("판정 비율로 정확도를 계산한다", () => {
  assert.equal(accuracyFor({ perfect: 1, great: 0, good: 0, miss: 1 }), 50);
});

test("커스텀 판정 범위를 순서에 맞게 보정한다", () => {
  assert.deepEqual(sanitizeJudgementWindows({ perfect: 60, great: 40, good: 20 }), {
    perfect: 60,
    great: 60,
    good: 60
  });
  assert.equal(judgeTiming(55, { perfect: 20, great: 60, good: 100 }), "great");
});
