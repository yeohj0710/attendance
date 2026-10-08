import { frameStyle, pixelRects } from "@/components/employee/PixelArt";
import { CHARACTERS } from "@/components/employee/pixelSprites";
import type { CharacterDef } from "@/components/employee/pixelSprites";
import { hashSeed, rollRarity, seededRandom } from "@/lib/scene";

/**
 * 실시간 작업실 카드 안의 도트 캐릭터와 책상.
 * - 캐릭터는 사람마다 날마다 새로 뽑는다(극레어 1%, 레어 5%, 희귀 19%). 옷 색도 날마다 바뀐다.
 * - 표정 효과(반짝이, 땀, zz)와 모니터 화면은 그날 상태(기분, 업무)에 따라.
 * - 눈 깜빡임, 손, 컵 김은 CSS(app/maple-quest.css 의 buddy-*), 캐릭터 프레임은 PixelArt 의 px-show.
 * 그림은 pixelSprites.ts(코드 안)에 있어서 내려받는 파일이 없다.
 */

type Mood = "boosted" | "focused" | "normal" | "sleepy" | "tired";
type Screen = "chart" | "code" | "doc" | "mail" | "spark";

const OUTFITS = [
  ["#4f86e8", "#3a6bc4"],
  ["#ee7f5c", "#cc6042"],
  ["#3fae7c", "#2e8c62"],
  ["#8f6fd8", "#7254b8"],
  ["#eaa936", "#c98a1f"],
  ["#35adbd", "#258d9b"],
  ["#e2648f", "#c24b74"],
];
const GOLD = ["#f2c230", "#c99a12"];

export type DailyCharacter = { def: CharacterDef; outfit: string[] };

/* 사람 캐릭터는 성별을 맞춘다. 동물, 로봇 같은 나머지는 누구에게나 나온다 */
const MALE_ONLY = new Set(["worker-short", "worker-cap", "golden-king"]);
const FEMALE_ONLY = new Set(["worker-long", "worker-bun"]);

/** 직원 성별 (이름 기준). 이름으로 짐작하지 않고, 대표님이 알려 준 명단만 적는다. 없으면 구분 없이 뽑는다 */
export const EMPLOYEE_GENDER: Record<string, "m" | "f"> = {};

/** 사람 + 날짜로 오늘의 캐릭터를 뽑는다. 같은 날 같은 사람은 늘 같은 결과 */
export function pickDailyCharacter(employeeId: string, dayKey: string, employeeName?: string): DailyCharacter {
  const rand = seededRandom(hashSeed(`char:${employeeId}:${dayKey}`));
  const rarity = rollRarity(rand());
  const gender = employeeName ? EMPLOYEE_GENDER[employeeName.replace(/\s/g, "")] : undefined;
  const fits = (c: CharacterDef) => !(gender === "m" && FEMALE_ONLY.has(c.id)) && !(gender === "f" && MALE_ONLY.has(c.id));
  const pool = CHARACTERS.filter((c) => c.rarity === rarity && fits(c));
  const list = pool.length ? pool : CHARACTERS.filter((c) => c.rarity === "common" && fits(c));
  const def = list[Math.floor(rand() * list.length)] ?? CHARACTERS[0];
  const outfit = /gold|king|황금/.test(`${def.id}${def.name}`) ? GOLD : OUTFITS[Math.floor(rand() * OUTFITS.length)];
  return { def, outfit };
}

/* 눈 칸(E, W)을 바로 위나 아래 칸 색으로 메운 바탕과, 눈만 있는 층으로 나눈다. 눈 층만 깜빡인다 */
function splitEyes(rows: string[]) {
  const isEye = (c: string) => c === "E" || c === "W";
  const base = rows.map((row, y) =>
    [...row]
      .map((c, x) => {
        if (!isEye(c)) return c;
        for (const dy of [-1, 1, -2, 2]) {
          const n = rows[y + dy]?.[x];
          if (n && n !== "." && !isEye(n)) return n;
        }
        return ".";
      })
      .join(""),
  );
  const eyes = rows.map((row) => [...row].map((c) => (isEye(c) ? c : ".")).join(""));
  return { base, eyes };
}

export function DeskBuddy({ character, mood, screen, sleepy }: { character: DailyCharacter; mood: Mood; screen: Screen; sleepy: boolean }) {
  const { def, outfit } = character;
  const sprite = def.sprite;
  const pal = { ...sprite.palette, O: outfit[0], o: outfit[1] };
  const face: Mood = sleepy ? "sleepy" : mood;
  const frames = sprite.frames.slice(0, 4);
  const CX = 21;
  const CY = 5;

  return (
    <svg aria-hidden="true" className="buddy" shapeRendering="crispEdges" viewBox="3 1 58 33">
      {/* 화분 */}
      <g>{pixelRects(["..g.G..", ".gGGg..", "GGgGGg.", ".GGGGg.", "..GGg..", ".TTTTT.", ".TttTT.", "..TTT.."], { G: "#5cbf6e", g: "#3f9a55", T: "#d9784f", t: "#b85e3c" }, "plant", 5, 14)}</g>
      {/* 모니터 */}
      <g>
        {pixelRects(
          ["LLLLLLLLLLLL", "LCCCCCCCCCCL", "LCCCCCCCCCCL", "LCCCCCCCCCCL", "LCCCCCCCCCCL", "LCCCCCCCCCCL", "LCCCCCCCCCCL", "LLLLLLLLLLLL", ".....LL.....", "...LLLLLL..."],
          { L: "#37425c", C: screen === "spark" ? "#2a2456" : "#e8f1ff" },
          "mon",
          44,
          12,
        )}
        <ScreenContent screen={screen} />
      </g>

      {/* 캐릭터 (프레임마다 눈은 따로 깜빡인다) */}
      {frames.map((frame, i) => {
        const { base, eyes } = splitEyes(frame);
        return (
          <g key={i} style={frameStyle(i, frames.length, 1.6)}>
            {pixelRects(base, pal, `c${i}-`, CX, CY)}
            {face === "sleepy" ? null : <g className="buddy-eyes">{pixelRects(eyes, pal, `e${i}-`, CX, CY)}</g>}
          </g>
        );
      })}

      {/* 책상 */}
      <rect fill="#f1f4f9" height={1} width={60} x={2} y={22} />
      <rect fill="#d7dfeb" height={1} width={60} x={2} y={23} />
      <rect fill="#e4eaf3" height={9} width={56} x={4} y={24} />
      <rect fill="#cbd4e2" height={1} width={56} x={4} y={24} />
      <rect fill="#b9c4d6" height={7} width={2} x={6} y={25} />
      <rect fill="#b9c4d6" height={7} width={2} x={56} y={25} />
      {/* 키보드와 손 */}
      <rect fill="#c4cedd" height={1} width={10} x={24} y={21} />
      <g className="buddy-hand-l">{pixelRects(["LL", "OO"], { L: "#2b2b3a", O: outfit[0] }, "hl", 23, 20)}</g>
      <g className="buddy-hand-r">{pixelRects(["LL", "OO"], { L: "#2b2b3a", O: outfit[0] }, "hr", 33, 20)}</g>
      {/* 컵 */}
      {pixelRects(["LLL.", "LWLL", "LWL.", "LLL."], { L: "#9aa6bb", W: "#ffffff" }, "mug", 15, 18)}
      <g className="buddy-steam">{pixelRects([".s.s", "s.s."], { s: "#c9d3e3" }, "st", 15, 15)}</g>

      {/* 기분 효과 */}
      {face === "boosted" ? (
        <g className="buddy-spark">
          {pixelRects([".Y.", "YYY", ".Y."], { Y: "#ffc83d" }, "sp1", 39, 4)}
          {pixelRects([".Y.", "YYY", ".Y."], { Y: "#ffc83d" }, "sp2", 17, 6)}
        </g>
      ) : null}
      {face === "tired" ? pixelRects([".D", "DD", "DD"], { D: "#7cc8f5" }, "sw", 38, 7) : null}
      {face === "sleepy" ? <g className="buddy-zzz">{pixelRects(["ZZZ", "..Z", ".Z.", "Z..", "ZZZ"], { Z: "#7c8db5" }, "zz", 39, 2)}</g> : null}
    </svg>
  );
}

function ScreenContent({ screen }: { screen: Screen }) {
  const x = 45;
  const y = 13;
  if (screen === "chart") {
    return (
      <g>
        <rect fill="#4f86e8" height={2} width={2} x={x + 1} y={y + 4} />
        <rect fill="#3fae7c" height={4} width={2} x={x + 4} y={y + 2} />
        <rect fill="#eaa936" height={3} width={2} x={x + 7} y={y + 3} />
      </g>
    );
  }
  if (screen === "code") {
    return (
      <g>
        <rect fill="#8f6fd8" height={1} width={5} x={x + 1} y={y + 1} />
        <rect fill="#3fae7c" height={1} width={6} x={x + 2} y={y + 3} />
        <rect fill="#ee7f5c" height={1} width={4} x={x + 2} y={y + 5} />
      </g>
    );
  }
  if (screen === "mail") return <g>{pixelRects(["WWWWWWW", "WBWWWBW", "WWBWBWW", "WWWBWWW", "WWWWWWW"], { W: "#ffffff", B: "#4f86e8" }, "ml", x + 1, y)}</g>;
  if (screen === "spark") return <g>{pixelRects(["Y.......", "....Y...", ".......Y", "..Y....."], { Y: "#ffd36b" }, "sk", x + 1, y + 1)}</g>;
  return (
    <g fill="#b9c4d6">
      <rect height={1} width={8} x={x + 1} y={y + 1} />
      <rect height={1} width={6} x={x + 1} y={y + 3} />
      <rect height={1} width={7} x={x + 1} y={y + 5} />
    </g>
  );
}
