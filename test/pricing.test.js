const test = require('node:test');
const assert = require('node:assert/strict');
const { timeCapFor, calcNormal, calcNight } = require('../pricing.js');

// 出発時刻は index.html の datetime-local と同じ形式(ローカル時刻)で渡す
const h = (hours, minutes = 0) => hours * 60 + minutes;

test('timeCapFor: 上限ブラケットの境界', () => {
  assert.equal(timeCapFor(6), 4290);
  assert.equal(timeCapFor(6 + 1 / 60), 5500);
  assert.equal(timeCapFor(12), 5500);
  assert.equal(timeCapFor(24), 6600);
  assert.equal(timeCapFor(36), 8800);
  assert.equal(timeCapFor(48), 9900);
  assert.equal(timeCapFor(72), 14300);
  assert.equal(timeCapFor(73), 14300 + 5500);
  assert.equal(timeCapFor(96), 14300 + 5500);
  assert.equal(timeCapFor(97), 14300 + 5500 * 2);
});

test('calcNormal: 15分単位で切り上げ', () => {
  assert.equal(calcNormal(0, 0).total, 0);
  assert.equal(calcNormal(1, 0).timeCost, 220);
  assert.equal(calcNormal(15, 0).timeCost, 220);
  assert.equal(calcNormal(16, 0).timeCost, 440);
  assert.equal(calcNormal(h(4), 0).timeCost, 3520);
});

test('calcNormal: 6時間上限の発動', () => {
  // 4時間45分 = 19ブロック = 4,180円(上限未満)
  assert.deepEqual(calcNormal(h(4, 45), 0), { total: 4180, timeCost: 4180, distFee: 0, capped: false });
  // 5時間 = 20ブロック = 4,400円 → 上限 4,290円
  assert.deepEqual(calcNormal(h(5), 0), { total: 4290, timeCost: 4290, distFee: 0, capped: true });
  // 実際の利用明細: 5時間39分 → 4,290円
  assert.equal(calcNormal(h(5, 39), 0).timeCost, 4290);
  assert.equal(calcNormal(h(6), 0).timeCost, 4290);
});

test('calcNormal: 6時間を1分超えると12時間上限に切り替わる', () => {
  // 25ブロック = 5,500円 = 12時間上限と同額なので capped は false
  assert.deepEqual(calcNormal(h(6, 1), 0), { total: 5500, timeCost: 5500, distFee: 0, capped: false });
  assert.equal(calcNormal(h(12), 0).timeCost, 5500);
  assert.equal(calcNormal(h(30), 0).timeCost, 8800);
});

test('calcNormal: 距離料金は20kmまで無料', () => {
  assert.equal(calcNormal(h(1), 20).distFee, 0);
  assert.equal(calcNormal(h(1), 21).distFee, 20);
  assert.deepEqual(calcNormal(h(1), 50), { total: 880 + 600, timeCost: 880, distFee: 600, capped: false });
});

test('calcNight: 出発時刻の利用可否(18:00〜翌9:00)', () => {
  assert.equal(calcNight('', h(3), 0).eligible, false);
  assert.equal(calcNight('2026-10-03T17:59', h(3), 0).eligible, false);
  assert.equal(calcNight('2026-10-03T18:00', h(3), 0).eligible, true);
  assert.equal(calcNight('2026-10-04T08:59', h(3), 0).eligible, true);
  assert.equal(calcNight('2026-10-04T09:00', h(3), 0).eligible, false);
});

test('calcNight: 翌9:00までに返却すれば延長なし', () => {
  assert.deepEqual(calcNight('2026-10-03T22:00', h(8), 30), {
    eligible: true,
    total: 2640 + 600,
    packCost: 2640,
    extCost: 0,
    lateCost: 0,
    distFee: 600,
    overMax: false,
  });
  // ちょうど9:00返却
  assert.equal(calcNight('2026-10-03T22:00', h(11), 0).extCost, 0);
});

test('calcNight: 距離料金は0kmから加算', () => {
  assert.equal(calcNight('2026-10-03T22:00', h(3), 1).distFee, 20);
});

test('calcNight: 9:00超過分は15分単位で延長料金', () => {
  // 1分超過 → 1ブロック
  assert.equal(calcNight('2026-10-03T22:00', h(11, 1), 0).extCost, 220);
  // 深夜0時以降の出発は当日9:00が境界
  assert.equal(calcNight('2026-10-04T02:00', h(7), 0).extCost, 0);
  assert.equal(calcNight('2026-10-04T02:00', h(8), 0).extCost, 880);
  // 月またぎ: 10/31 23:00 + 12時間 → 11/1 9:00 から2時間延長
  assert.equal(calcNight('2026-10-31T23:00', h(12), 0).extCost, 1760);
});

test('calcNight: 延長ちょうど6時間は上限内', () => {
  const r = calcNight('2026-10-03T22:00', h(17), 0);
  assert.equal(r.extCost, 24 * 220);
  assert.equal(r.overMax, false);
});

test('calcNight: 延長6時間超過で overMax が立つ', () => {
  assert.equal(calcNight('2026-10-03T22:00', h(18), 0).overMax, true);
});

test('calcNight: 延長6時間を超えた分は返却遅延料金として15分440円で加算される', () => {
  // 延長7時間 = 6時間分(24ブロック×220円) + 超過1時間(4ブロック×440円)
  const r = calcNight('2026-10-03T22:00', h(18), 0);
  assert.equal(r.extCost, 24 * 220);
  assert.equal(r.lateCost, 4 * 440);
  assert.equal(r.total, 2640 + 24 * 220 + 4 * 440);
});
