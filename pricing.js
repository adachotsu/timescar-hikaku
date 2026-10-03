// 料金計算ロジック(index.html と node:test の両方から読み込む)。
// ビルド不要で file:// でも動くよう、ES module ではなく通常のスクリプトとして定義する。
const RATE_15MIN = 220;
const DISTANCE_RATE = 20;
const FREE_KM_NORMAL = 20;
const NIGHT_PACK_PRICE = 2640;
const NIGHT_PACK_MAX_EXT_MIN = 6 * 60;
const LATE_RATE_15MIN = RATE_15MIN * 2;

const CAP_BRACKETS = [
  { hours: 6, price: 4290 },
  { hours: 12, price: 5500 },
  { hours: 24, price: 6600 },
  { hours: 36, price: 8800 },
  { hours: 48, price: 9900 },
  { hours: 72, price: 14300 },
];
const EXTRA_DAY_PRICE = 5500;

function timeCapFor(hours) {
  for (const b of CAP_BRACKETS) {
    if (hours <= b.hours) return b.price;
  }
  const extraDays = Math.ceil((hours - 72) / 24);
  return 14300 + extraDays * EXTRA_DAY_PRICE;
}

function calcNormal(durationMinutes, km) {
  const hours = durationMinutes / 60;
  const blocks = Math.ceil(durationMinutes / 15);
  const raw = blocks * RATE_15MIN;
  const cap = timeCapFor(hours);
  const timeCost = Math.min(raw, cap);
  const distFee = Math.max(0, km - FREE_KM_NORMAL) * DISTANCE_RATE;
  return {
    total: timeCost + distFee,
    timeCost,
    distFee,
    capped: raw > cap,
  };
}

function calcNight(startDateStr, durationMinutes, km) {
  if (!startDateStr) return { eligible: false, reason: '出発時刻を入力してください' };
  const start = new Date(startDateStr);
  const hour = start.getHours();
  const eligible = hour >= 18 || hour < 9;
  if (!eligible) {
    return { eligible: false, reason: '出発が18:00〜翌9:00の範囲外のため利用不可' };
  }

  const boundary = new Date(start);
  if (hour >= 18) {
    boundary.setDate(boundary.getDate() + 1);
    boundary.setHours(9, 0, 0, 0);
  } else {
    boundary.setHours(9, 0, 0, 0);
  }

  const end = new Date(start.getTime() + durationMinutes * 60000);
  let extCost = 0;
  let lateCost = 0;
  let overMax = false;
  if (end > boundary) {
    const extMin = (end - boundary) / 60000;
    overMax = extMin > NIGHT_PACK_MAX_EXT_MIN;
    // パック延長は最大6時間まで15分220円(最大時間料金の適用なし)
    const cappedExtMin = Math.min(extMin, NIGHT_PACK_MAX_EXT_MIN);
    extCost = Math.ceil(cappedExtMin / 15) * RATE_15MIN;
    // 6時間を超えた分は予約できないため返却遅延扱い(通常の2倍・最大時間料金の適用なし)
    if (overMax) {
      const lateMin = extMin - NIGHT_PACK_MAX_EXT_MIN;
      lateCost = Math.ceil(lateMin / 15) * LATE_RATE_15MIN;
    }
  }
  const distFee = km * DISTANCE_RATE;
  return {
    eligible: true,
    total: NIGHT_PACK_PRICE + extCost + lateCost + distFee,
    packCost: NIGHT_PACK_PRICE,
    extCost,
    lateCost,
    distFee,
    overMax,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    RATE_15MIN,
    DISTANCE_RATE,
    FREE_KM_NORMAL,
    NIGHT_PACK_PRICE,
    NIGHT_PACK_MAX_EXT_MIN,
    LATE_RATE_15MIN,
    CAP_BRACKETS,
    EXTRA_DAY_PRICE,
    timeCapFor,
    calcNormal,
    calcNight,
  };
}
