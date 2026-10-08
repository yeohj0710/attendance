"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { PixelSpriteView } from "@/components/employee/PixelArt";
import { CHARACTERS, LANDMARKS, SKY_EVENTS } from "@/components/employee/pixelSprites";
import type { SkyEventDef } from "@/components/employee/pixelSprites";
import {
  getScene,
  hashSeed,
  RARITY_LABEL,
  readDex,
  recordDex,
  seededRandom,
  type Rarity,
  type Scene,
} from "@/lib/scene";

/**
 * 출퇴근기록부 페이지 뒤 배경. 1년 내내 덜 질리게 여러 겹으로 바뀐다(lib/scene.ts 설명 참고).
 * - 하늘색, 해와 달, 별: 시간대
 * - 언덕 색, 떨어지는 것(벚꽃잎, 단풍, 눈, 비): 계절과 실제 날씨
 * - 오늘의 랜드마크: 날마다 다른 건물 하나
 * - 기념일 장식: 크리스마스 전구, 추석 보름달 등
 * - 하늘 이벤트: 25~70초마다 하나가 지나간다. 레어, 극레어는 도감에 남는다.
 * 트래픽: 그림은 전부 코드 안(pixelSprites.ts)에 있고, 타이머는 하나뿐이다. 창을 안 보고 있으면 띄우지 않는다.
 */

const RARITY_WEIGHT: Record<Rarity, number> = { common: 60, uncommon: 26, rare: 11, legendary: 3 };
const EVENT_GAP_MIN = 25_000;
const EVENT_GAP_MAX = 70_000;
const MOTION_SECONDS: Record<SkyEventDef["motion"], number> = { fly: 20, drift: 34, streak: 2.4, float: 7 };

type LiveEvent = { def: SkyEventDef; key: number; top: number; seconds: number };

function eligible(def: SkyEventDef, scene: Scene) {
  const when = def.when;
  if (!when) return true;
  if (when.holiday && !(scene.holiday && when.holiday.includes(scene.holiday))) return false;
  if (when.time && !when.time.includes(scene.time)) return false;
  if (when.season && !when.season.includes(scene.season)) return false;
  if (when.weather && !when.weather.includes(scene.weather)) return false;
  return true;
}

function pickEvent(scene: Scene, rand: () => number) {
  const pool = SKY_EVENTS.filter((def) => eligible(def, scene));
  if (!pool.length) return null;
  const weights = pool.map((def) => RARITY_WEIGHT[def.rarity] * (def.when?.holiday ? 6 : 1));
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function useScene(weatherLabel?: string | null) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return useMemo(() => getScene(now, weatherLabel), [now, weatherLabel]);
}

export function SkyScene({ weatherLabel }: { weatherLabel?: string | null }) {
  const scene = useScene(weatherLabel);
  const [event, setEvent] = useState<LiveEvent | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  // 오늘의 랜드마크와 떨어지는 것 위치는 날마다 고정
  const daily = useMemo(() => {
    const rand = seededRandom(hashSeed(`scene:${scene.dayKey}`));
    const landmark = LANDMARKS.length ? LANDMARKS[Math.floor(rand() * LANDMARKS.length)] : null;
    const landmarkLeft = 8 + rand() * 70;
    const particles = Array.from({ length: 16 }, () => ({
      left: rand() * 100,
      delay: -rand() * 14,
      seconds: 9 + rand() * 9,
      drift: (rand() - 0.5) * 80,
      size: 0.7 + rand() * 0.8,
    }));
    // 날마다 하늘 색감이 조금씩 다르다(-14~14도), 맑은 오후에는 가끔(15%) 무지개
    const hueShift = Math.round((rand() - 0.5) * 28);
    const rainbowDay = rand() < 0.15;
    return { landmark, landmarkLeft, particles, hueShift, rainbowDay };
  }, [scene.dayKey]);

  // 하늘 이벤트: 타이머 하나로 다음 것을 예약한다
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let timer = 0;
    let key = 0;
    const rand = Math.random;
    const schedule = (ms: number) => {
      timer = window.setTimeout(() => {
        if (!document.hidden) {
          const def = pickEvent(sceneRef.current, rand);
          if (def) {
            const seconds = MOTION_SECONDS[def.motion];
            const top = def.motion === "streak" ? 4 + rand() * 14 : 6 + rand() * 30;
            const eventKey = ++key;
            setEvent({ def, key: eventKey, top, seconds });
            if (def.rarity === "rare" || def.rarity === "legendary") {
              const isNew = recordDex(`sky:${def.id}`, sceneRef.current.dayKey);
              setToast(`${def.rarity === "legendary" ? "🌟" : "✨"} ${RARITY_LABEL[def.rarity]} ${def.name}${isNew ? " 도감 등록!" : ""}`);
              window.setTimeout(() => setToast(null), 5000);
            } else {
              recordDex(`sky:${def.id}`, sceneRef.current.dayKey);
            }
            window.setTimeout(() => setEvent((cur) => (cur?.key === eventKey ? null : cur)), seconds * 1000 + 200);
          }
        }
        schedule(EVENT_GAP_MIN + rand() * (EVENT_GAP_MAX - EVENT_GAP_MIN));
      }, ms);
    };
    schedule(6000);
    return () => window.clearTimeout(timer);
  }, []);

  const particleKind =
    scene.weather === "rain" ? "rain" : scene.weather === "snow" || scene.season === "winter" ? "snow" : scene.season === "spring" ? "petal" : scene.season === "autumn" ? "leaf" : scene.time === "night" ? "firefly" : null;
  const cloudCount = scene.weather === "clear" ? 3 : 6;
  const sunProgress = Math.min(1, Math.max(0, (scene.hour + scene.minute / 60 - 6) / 13));

  return (
    <div
      aria-hidden="true"
      className={`sky-scene sky-${scene.time} season-${scene.season} weather-${scene.weather}${scene.holiday ? ` holiday-${scene.holiday}` : ""}`}
      style={{ filter: daily.hueShift ? `hue-rotate(${daily.hueShift}deg)` : undefined }}
    >
      {(daily.rainbowDay && scene.weather === "clear" && (scene.time === "day" || scene.time === "sunset")) || (scene.weather === "cloudy" && scene.time !== "night" && daily.rainbowDay) ? (
        <div className="sky-rainbow" />
      ) : null}
      {scene.time === "night" || scene.time === "dawn" ? <div className="sky-stars" /> : null}
      {scene.time === "night" ? (
        <div className={`sky-moon${scene.holiday === "chuseok" ? " is-full" : ""}`} />
      ) : (
        <div className="sky-sun" style={{ left: `${8 + sunProgress * 80}%`, top: `${26 - Math.sin(sunProgress * Math.PI) * 18}%` }} />
      )}
      {Array.from({ length: cloudCount }, (_, i) => (
        <div className={`sky-cloud sky-cloud-${i % 6}`} key={i} />
      ))}

      {event ? (
        <div
          className={`sky-event sky-motion-${event.def.motion} sky-rarity-${event.def.rarity}`}
          key={event.key}
          style={{ top: `${event.top}%`, animationDuration: `${event.seconds}s` }}
        >
          <PixelSpriteView
            className="sky-event-art"
            duration={0.5}
            sprite={event.def.sprite}
          />
        </div>
      ) : null}

      <div className="sky-hills">
        <svg preserveAspectRatio="none" viewBox="0 0 1200 240">
          <path className="hill-far" d="M0 120 C160 60 300 70 420 115 C560 165 660 60 820 85 C960 105 1060 50 1200 90 L1200 240 L0 240Z" />
          <path className="hill-mid" d="M0 165 C200 120 340 140 500 168 C660 196 780 130 950 145 C1070 155 1130 140 1200 150 L1200 240 L0 240Z" />
          <path className="hill-near" d="M0 200 C220 180 420 205 620 196 C820 187 1000 205 1200 192 L1200 240 L0 240Z" />
        </svg>
        {daily.landmark ? (
          <div className="sky-landmark" style={{ left: `${daily.landmarkLeft}%` }}>
            <PixelSpriteView duration={1.2} sprite={daily.landmark.sprite} title={daily.landmark.name} />
          </div>
        ) : null}
      </div>

      {particleKind ? (
        <div className={`sky-particles sky-particles-${particleKind}`}>
          {daily.particles.map((p, i) => (
            <span
              key={i}
              style={
                {
                  left: `${p.left}%`,
                  animationDelay: `${p.delay}s`,
                  animationDuration: `${particleKind === "rain" ? p.seconds / 8 : p.seconds}s`,
                  "--drift": `${p.drift}px`,
                  "--size": p.size,
                } as CSSProperties
              }
            />
          ))}
        </div>
      ) : null}
      {scene.holiday === "christmas" ? <div className="sky-lights" /> : null}

      {toast ? <div className="sky-toast">{toast}</div> : null}
    </div>
  );
}

/** 작업실 머리에 붙는 도감 단추. 이 PC 에서 만난 하늘 이벤트와 캐릭터를 보여 준다 */
export function SkyDex() {
  const [open, setOpen] = useState(false);
  const [dex, setDex] = useState<Record<string, { first: string; count: number }>>({});

  useEffect(() => {
    const load = () => setDex(readDex());
    load();
    window.addEventListener("wb-dex", load);
    return () => window.removeEventListener("wb-dex", load);
  }, []);

  const entries = [
    ...SKY_EVENTS.map((def) => ({ id: `sky:${def.id}`, name: def.name, rarity: def.rarity, sprite: def.sprite, kind: "하늘" })),
    ...CHARACTERS.map((def) => ({ id: `char:${def.id}`, name: def.name, rarity: def.rarity, sprite: def.sprite, kind: "캐릭터" })),
  ];
  const found = entries.filter((e) => dex[e.id]).length;

  return (
    <span className="sky-dex">
      <button className="desk-chip sky-dex-button" onClick={() => setOpen((v) => !v)} type="button">
        📖 도감 {found}/{entries.length}
      </button>
      {open ? (
        <span className="sky-dex-panel" role="dialog">
          <span className="sky-dex-head">
            <b>도감</b>
            <span>이 PC에서 만난 하늘 이벤트와 캐릭터예요. 레어와 극레어는 정말 가끔 나와요.</span>
          </span>
          <span className="sky-dex-grid">
            {entries.map((e) => {
              const seen = dex[e.id];
              return (
                <span className={`sky-dex-item sky-rarity-${e.rarity}${seen ? "" : " is-unknown"}`} key={e.id} title={seen ? `${e.name}, ${seen.count}번 만남` : "아직 못 만남"}>
                  <PixelSpriteView className="sky-dex-art" sprite={e.sprite} />
                  <span className="sky-dex-name">{seen ? e.name : "???"}</span>
                  <span className="sky-dex-rarity">{RARITY_LABEL[e.rarity]}</span>
                </span>
              );
            })}
          </span>
        </span>
      ) : null}
    </span>
  );
}
