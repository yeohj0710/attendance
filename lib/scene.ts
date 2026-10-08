/**
 * 출퇴근기록부 배경과 작업실이 1년 내내 덜 질리게, 장면을 여러 겹의 시간 단위로 바꾼다.
 * - 분: 하늘 이벤트(components/employee/SkyScene.tsx 가 무작위로 띄움)
 * - 시간: 새벽, 아침, 낮, 노을, 밤
 * - 날: 오늘의 랜드마크, 사람마다 오늘의 캐릭터
 * - 계절, 실제 날씨, 기념일
 * 여기는 계산만 한다(서버 호출 없음).
 */

export type TimeOfDay = "dawn" | "morning" | "day" | "sunset" | "night";
export type Season = "spring" | "summer" | "autumn" | "winter";
export type SceneWeather = "clear" | "cloudy" | "rain" | "snow";
export type Holiday = "newyear" | "seollal" | "chuseok" | "halloween" | "christmas" | "pepero" | "hangul";

export type Scene = {
  dayKey: string; // YYYY-MM-DD (한국 시간)
  hour: number;
  minute: number;
  time: TimeOfDay;
  season: Season;
  weather: SceneWeather;
  holiday: Holiday | null;
};

/* 기념일. 설날, 추석은 해마다 날짜가 달라서 날짜로 적는다 */
const HOLIDAY_DATES: Array<[Holiday, string, string]> = [
  ["chuseok", "2026-09-24", "2026-09-26"],
  ["hangul", "2026-10-09", "2026-10-09"],
  ["halloween", "2026-10-26", "2026-10-31"],
  ["pepero", "2026-11-11", "2026-11-11"],
  ["christmas", "2026-12-18", "2026-12-25"],
  ["newyear", "2026-12-31", "2027-01-02"],
  ["seollal", "2027-02-05", "2027-02-08"],
  ["chuseok", "2027-09-14", "2027-09-16"],
  ["hangul", "2027-10-09", "2027-10-09"],
  ["halloween", "2027-10-25", "2027-10-31"],
  ["pepero", "2027-11-11", "2027-11-11"],
  ["christmas", "2027-12-18", "2027-12-25"],
  ["newyear", "2027-12-31", "2028-01-02"],
];

export function kstParts(now: Date) {
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth() + 1;
  const d = kst.getUTCDate();
  return {
    dayKey: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    month: m,
    hour: kst.getUTCHours(),
    minute: kst.getUTCMinutes(),
  };
}

export function getScene(now: Date, weatherLabel?: string | null): Scene {
  const { dayKey, month, hour, minute } = kstParts(now);
  const time: TimeOfDay =
    hour >= 5 && hour < 7 ? "dawn" : hour < 11 && hour >= 7 ? "morning" : hour >= 11 && hour < 16 ? "day" : hour >= 16 && hour < 19 ? "sunset" : "night";
  const season: Season = month >= 3 && month <= 5 ? "spring" : month >= 6 && month <= 8 ? "summer" : month >= 9 && month <= 11 ? "autumn" : "winter";
  const weather: SceneWeather =
    weatherLabel === "rain" ? "rain" : weatherLabel === "snow" ? "snow" : weatherLabel === "cloudy" || weatherLabel === "fog" ? "cloudy" : "clear";
  const holiday = HOLIDAY_DATES.find(([, from, to]) => dayKey >= from && dayKey <= to)?.[0] ?? null;
  return { dayKey, hour, minute, time, season, weather, holiday };
}

/* 같은 글자면 늘 같은 수가 나오는 난수. 날마다, 사람마다 고정된 뽑기에 쓴다 */
export function hashSeed(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rarity = "common" | "uncommon" | "rare" | "legendary";

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "일반",
  uncommon: "희귀",
  rare: "레어",
  legendary: "극레어",
};

/** 등급 뽑기: 극레어 1%, 레어 5%, 희귀 19%, 나머지 일반 */
export function rollRarity(r: number): Rarity {
  if (r < 0.01) return "legendary";
  if (r < 0.06) return "rare";
  if (r < 0.25) return "uncommon";
  return "common";
}

/* 이 PC 에서 만난 레어 이상 캐릭터와 하늘 이벤트 기록 (도감). 서버에 안 보낸다 */
const DEX_KEY = "wb-dex-v1";
export type DexEntry = { first: string; last: string; count: number };

export function readDex(): Record<string, DexEntry> {
  try {
    return JSON.parse(localStorage.getItem(DEX_KEY) ?? "{}") as Record<string, DexEntry>;
  } catch {
    return {};
  }
}

export function recordDex(id: string, dayKey: string) {
  try {
    const dex = readDex();
    const prev = dex[id];
    // 같은 날 같은 것은 한 번만 센다
    if (prev && prev.last === dayKey) return false;
    dex[id] = { first: prev?.first ?? dayKey, last: dayKey, count: (prev?.count ?? 0) + 1 };
    localStorage.setItem(DEX_KEY, JSON.stringify(dex));
    window.dispatchEvent(new Event("wb-dex"));
    return !prev;
  } catch {
    return false;
  }
}
