// 料金計算ロジック(index.html と node:test の両方から読み込む)。
// ビルド不要で file:// でも動くよう、ES module ではなく通常のスクリプトとして定義する。

// 車両クラス別の料金(タイムズカー公式 https://share.timescar.jp/fare/use.html 2026-10-03 時点)
// rate15min: 15分あたりの時間料金(ナイトパック延長にも同じ料率)
// caps: 最大時間料金(〜72時間)。以降は extraDay を24時間ごとに加算
// nightPack: ナイトパック(18:00〜翌9:00出発)の料金
const CAR_CLASSES = {
  basic: {
    label: 'ベーシック',
    rate15min: 220,
    caps: [
      { hours: 6, price: 4290 },
      { hours: 12, price: 5500 },
      { hours: 24, price: 6600 },
      { hours: 36, price: 8800 },
      { hours: 48, price: 9900 },
      { hours: 72, price: 14300 },
    ],
    extraDay: 5500,
    nightPack: 2640,
  },
  middle: {
    label: 'ミドル',
    rate15min: 330,
    caps: [
      { hours: 6, price: 6490 },
      { hours: 12, price: 7700 },
      { hours: 24, price: 8800 },
      { hours: 36, price: 11000 },
      { hours: 48, price: 13200 },
      { hours: 72, price: 18700 },
    ],
    extraDay: 6600,
    nightPack: 3960,
  },
  premium: {
    label: 'プレミアム',
    rate15min: 440,
    caps: [
      { hours: 6, price: 8690 },
      { hours: 12, price: 9900 },
      { hours: 24, price: 12100 },
      { hours: 36, price: 17600 },
      { hours: 48, price: 20900 },
      { hours: 72, price: 27500 },
    ],
    extraDay: 7700,
    nightPack: 5280,
  },
};
const DEFAULT_CLASS = 'basic';

// 距離料金は全クラス共通
const DISTANCE_RATE = 20;
const FREE_KM_NORMAL = 20;
const NIGHT_PACK_MAX_EXT_MIN = 6 * 60;
// 返却遅延料金は通常料金の2倍(最大時間料金の適用なし)
const LATE_RATE_MULTIPLIER = 2;

function carClass(classId) {
  return CAR_CLASSES[classId] || CAR_CLASSES[DEFAULT_CLASS];
}

function timeCapFor(hours, classId = DEFAULT_CLASS) {
  const cls = carClass(classId);
  for (const b of cls.caps) {
    if (hours <= b.hours) return b.price;
  }
  const last = cls.caps[cls.caps.length - 1];
  const extraDays = Math.ceil((hours - last.hours) / 24);
  return last.price + extraDays * cls.extraDay;
}

function calcNormal(durationMinutes, km, classId = DEFAULT_CLASS) {
  const cls = carClass(classId);
  const hours = durationMinutes / 60;
  const blocks = Math.ceil(durationMinutes / 15);
  const raw = blocks * cls.rate15min;
  const cap = timeCapFor(hours, classId);
  const timeCost = Math.min(raw, cap);
  const distFee = Math.max(0, km - FREE_KM_NORMAL) * DISTANCE_RATE;
  return {
    total: timeCost + distFee,
    timeCost,
    distFee,
    capped: raw > cap,
  };
}

function calcNight(startDateStr, durationMinutes, km, classId = DEFAULT_CLASS) {
  if (!startDateStr) return { eligible: false, reason: '出発時刻を入力してください' };
  const cls = carClass(classId);
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
    // パック延長は最大6時間までクラスの15分料金(最大時間料金の適用なし)
    const cappedExtMin = Math.min(extMin, NIGHT_PACK_MAX_EXT_MIN);
    extCost = Math.ceil(cappedExtMin / 15) * cls.rate15min;
    // 6時間を超えた分は予約できないため返却遅延扱い(通常の2倍・最大時間料金の適用なし)
    if (overMax) {
      const lateMin = extMin - NIGHT_PACK_MAX_EXT_MIN;
      lateCost = Math.ceil(lateMin / 15) * cls.rate15min * LATE_RATE_MULTIPLIER;
    }
  }
  const distFee = km * DISTANCE_RATE;
  return {
    eligible: true,
    total: cls.nightPack + extCost + lateCost + distFee,
    packCost: cls.nightPack,
    extCost,
    lateCost,
    distFee,
    overMax,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CAR_CLASSES,
    DEFAULT_CLASS,
    DISTANCE_RATE,
    FREE_KM_NORMAL,
    NIGHT_PACK_MAX_EXT_MIN,
    LATE_RATE_MULTIPLIER,
    timeCapFor,
    calcNormal,
    calcNight,
  };
}
