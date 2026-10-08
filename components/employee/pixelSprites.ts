// 사무실 장면용 도트 그림 모음. 전부 이 앱을 위해 새로 그린 그림이다.
// 각 프레임은 h 줄, 각 줄은 w 글자. '.' 은 투명, 나머지 글자는 palette 의 색이다.
// 캐릭터 규칙: 옷은 O/o (앱이 사람마다 다시 칠함), 피부 S/s, 테두리 L, 눈은 5~8행의 E/W (깜빡임 때 숨김).

export type Rarity = "common" | "uncommon" | "rare" | "legendary";
export type PixelSprite = { w: number; h: number; palette: Record<string, string>; frames: string[][] };
export type CharacterDef = { id: string; name: string; rarity: Rarity; sprite: PixelSprite };
export type SkyEventDef = {
  id: string;
  name: string;
  rarity: Rarity;
  sprite: PixelSprite;
  motion: "fly" | "drift" | "streak" | "float";
  when?: {
    time?: Array<"dawn" | "morning" | "day" | "sunset" | "night">;
    season?: Array<"spring" | "summer" | "autumn" | "winter">;
    weather?: Array<"clear" | "cloudy" | "rain" | "snow">;
    holiday?: string[];
  };
};
export type LandmarkDef = { id: string; name: string; sprite: PixelSprite };

// ---------------------------------------------------------------------------
// 작은 도우미: 기존 그림 위에 글자를 덮어쓴다. 덮을 글자 중 ' ' 는 원래 칸을 그대로 둔다.
function edit(base: string[], edits: Array<[number, number, string]>): string[] {
  const rows = base.map((r) => r.split(""));
  for (const [r, c, s] of edits) {
    for (let i = 0; i < s.length; i++) if (s[i] !== " ") rows[r][c + i] = s[i];
  }
  return rows.map((r) => r.join(""));
}

// 빈 판에 여러 그림을 찍는다. 찍는 그림의 '.' 은 투명.
function stamp(w: number, h: number, parts: Array<[number, number, string[]]>): string[] {
  const rows = Array.from({ length: h }, () => Array<string>(w).fill("."));
  for (const [x, y, map] of parts) {
    map.forEach((line, r) => {
      for (let c = 0; c < line.length; c++) if (line[c] !== ".") rows[y + r][x + c] = line[c];
    });
  }
  return rows.map((r) => r.join(""));
}

const OUT = "#2b2b3a";

// ---------------------------------------------------------------------------
// 캐릭터 (책상 뒤에 앉은 상반신, 16x18)

const FACE = { L: OUT, E: "#1f1d2b", W: "#ffffff", P: "#ffa3b5", M: "#c4566a", S: "#ffdcbf", s: "#efb592" };
const OUTFIT = { O: "#5b8def", o: "#3f6fc9", C: "#ffffff", T: "#e25c5c" };

const TORSO_TIE = [
  "..LLOOCCCCOOLL..",
  ".LOOOOCTTCOOOOL.",
  ".LOoOOOTTOOOoOL.",
  ".LOoOOOTTOOOoOL.",
  ".LOoOOOOOOOOoOL.",
  ".LOoOOOOOOOOoOL.",
];
const TORSO_BLOUSE = [
  "..LLOCCOOCCOLL..",
  ".LOOOOCOOCOOOOL.",
  ".LOoOOOOOOOOoOL.",
  ".LOoOOOOOOOOoOL.",
  ".LOoOOOOOOOOoOL.",
  ".LOoOOOOOOOOoOL.",
];
const TORSO_HOODIE = [
  "..LLoOOOOOOoLL..",
  ".LOOOOCOOCOOOOL.",
  ".LOoOOCOOCOOoOL.",
  ".LOoOOOOOOOOoOL.",
  ".LOoOooooooOoOL.",
  ".LOoOOOOOOOOoOL.",
];
const TORSO_CARDI = [
  "..LLOOCCCCOOLL..",
  ".LOOOOCCCCOOOOL.",
  ".LOoOOOCCOOOoOL.",
  ".LOoOOOoOOOOoOL.",
  ".LOoOOOOOOOOoOL.",
  ".LOoOOOoOOOOoOL.",
];

function twoFrames(f1: string[], edits: Array<[number, number, string]>): string[][] {
  return [f1, edit(f1, edits)];
}

// 짧은 머리 (머리 위 삐친 머리카락이 흔들림)
const workerShortF1 = [
  ".......LL.......",
  "....LLLLLLLL....",
  "...LHHHHHHHHL...",
  "..LHHHHHHHHhHL..",
  "..LHHHHHHHHHHL..",
  "..LHHSSSSSHHHL..",
  "..LHSESSSSESSL..",
  "..LSSESSSSESSL..",
  "..LSPSSSSSSPSL..",
  "..LSSSSMMSSSSL..",
  "...LSSSSSSSSL...",
  "....LLLssLLL....",
  ...TORSO_TIE,
];

// 긴 머리 (머리핀이 반짝)
const workerLongF1 = [
  "................",
  "....LLLLLLLL....",
  "...LHHHHHHHHL...",
  "..LHHHHHHHHHHL..",
  ".LHHHHHHHHHRRHL.",
  ".LHHHSSSSSSHHHL.",
  ".LHHSESSSSESHHL.",
  ".LHHSESSSSESHHL.",
  ".LHSPSSSSSSPSHL.",
  ".LHSSSSMMSSSSHL.",
  ".LHHSSSSSSSSHHL.",
  ".LHHLLLssLLLHHL.",
  ".LHHOCCOOCCOHHL.",
  ".LHhOOOCCOOOhHL.",
  ".LhoOOOOOOOOohL.",
  ".LOoOOOOOOOOoOL.",
  ".LOoOOOOOOOOoOL.",
  ".LOoOOOOOOOOoOL.",
];

// 똥머리 (꽃핀이 반짝)
const workerBunF1 = [
  "......LLLL......",
  ".....LHHHhL.....",
  "...LLLHHHhRL....",
  "..LHHHHHHHHHHL..",
  "..LHHHHHHHHHHL..",
  "..LHSSSSSSSSHL..",
  "..LSSESSSSESSL..",
  "..LSSESSSSESSL..",
  "..LSPSSSSSSPSL..",
  "..LSSSSMMSSSSL..",
  "...LSSSSSSSSL...",
  "....LLLssLLL....",
  ...TORSO_CARDI,
];

// 캡모자 (콧노래 음표)
const workerCapF1 = [
  "................",
  "....LLLLLLLL....",
  "...LKKKKKKKKL...",
  "..LKKKKZZKKKKL..",
  "..LKKKKKKKKKKL..",
  ".LkkkkkkkkkkkkL.",
  "..LHSESSSSESHL..",
  "..LHSESSSSESHL..",
  "..LSPSSSSSSPSL..",
  "..LSSSSMMSSSSL..",
  "...LSSSSSSSSL...",
  "....LLLssLLL....",
  ...TORSO_HOODIE,
];

const catF1 = [
  "..LL........LL..",
  "..LFL......LFL..",
  "..LPFL....LFPL..",
  "..LPFFLLLLFFPL..",
  "..LFFFFFFFFFFL..",
  ".LFFFfFffFfFFFL.",
  ".LFFFEFFFFEFFFL.",
  ".LFFFEFFFFEFFFL.",
  "LLFPFFFNNFFFPFLL",
  ".LFFFFMFFMFFFFL.",
  "..LFFFFFFFFFFL..",
  "...LLLLffLLLL...",
  ...TORSO_BLOUSE,
];

const dogF1 = [
  "................",
  "....LLLLLLLL....",
  "...LFFFFFFFFL...",
  ".LLLFFFFFFFFLLL.",
  "LddLFFFFFFFFLddL",
  "LddLFFFFFFFFLddL",
  "LddLFEFFFFEFLddL",
  "LddLFEFFFFEFLddL",
  "LddLPFmNNmFPLddL",
  ".LLLFFmMMmFFLLL.",
  "...LFFFFFFFFL...",
  "....LLLffLLL....",
  ...TORSO_TIE,
];

const bearF1 = [
  "..LLL......LLL..",
  ".LFPFL....LFPFL.",
  ".LFFFLLLLLLFFFL.",
  "..LFFFFFFFFFFL..",
  ".LFFFFFFFFFFFFL.",
  ".LFFFFFFFFFFFFL.",
  ".LFFFEFFFFEFFFL.",
  ".LFFFEFFFFEFFFL.",
  ".LFPFFmNNmFFPFL.",
  ".LFFFFmMMmFFFFL.",
  "..LFFFmmmmFFFL..",
  "...LLLLLLLLLL...",
  ...TORSO_HOODIE,
];

const rabbitF1 = [
  "...LL......LL...",
  "..LFPL....LPFL..",
  "..LFPL....LPFL..",
  "..LFPL....LPFL..",
  "..LFFLLLLLLFFL..",
  ".LFFFFFFFFFFFFL.",
  ".LFFFEFFFFEFFFL.",
  ".LFFFEFFFFEFFFL.",
  ".LFPFFFNNFFFPFL.",
  ".LFFFFMFFMFFFFL.",
  "..LFFFFCCFFFFL..",
  "...LLLLffLLLL...",
  ...TORSO_CARDI,
];

const frogF1 = [
  "................",
  "................",
  "................",
  "..LLLL....LLLL..",
  ".LGCCGL..LGCCGL.",
  ".LGCEGLLLLGECGL.",
  ".LGCEGGGGGGECGL.",
  ".LGGGGGGGGGGGGL.",
  ".LGPGGGGGGGGPGL.",
  ".LGGLGGGGGGLGGL.",
  "..LGGLLLLLLGGL..",
  "...LLggggggLL...",
  ...TORSO_TIE,
];

const penguinF1 = [
  ".......L........",
  "....LLLLLLLL....",
  "...LBBBBBBBBL...",
  "..LBBBBBBBBBBL..",
  "..LBBCCBBCCBBL..",
  ".LBBCCCCCCCCBBL.",
  ".LBCCECCCCECCBL.",
  ".LBCCECCCCECCBL.",
  ".LBCPCCYYCCPCBL.",
  ".LBCCCCyyCCCCBL.",
  "..LBCCCCCCCCBL..",
  "...LLBBBBBBLL...",
  ...TORSO_TIE,
];

const foxF1 = [
  ".LL..........LL.",
  ".LFL........LFL.",
  ".LDFL......LFDL.",
  ".LDFFLLLLLLFFDL.",
  ".LFFFFFFFFFFFFL.",
  ".LFFFFFFFFFFFFL.",
  ".LFFFEFFFFEFFFL.",
  ".LCFFEFFFFEFFCL.",
  ".LCCCFFFFFFCCCL.",
  "..LCCCCNNCCCCL..",
  "...LCCMCCMCCL...",
  "....LLLLLLLL....",
  ...TORSO_BLOUSE,
];

const robotF1 = [
  "......LAAL......",
  ".......LL.......",
  "...LLLLLLLLLL...",
  "..LGGGGGGGGGGL..",
  "LgLGVVVVVVVVGLgL",
  "LgLGVVVVVVVVGLgL",
  "LgLGVEVVVVEVGLgL",
  "LLLGVEVVVVEVGLLL",
  "..LGVVVVVVVVGL..",
  "..LGVVMVVMVVGL..",
  "..LGGVVMMVVGGL..",
  "...LLLggggLLL...",
  ...TORSO_TIE,
];

const alienF1 = [
  "..LYL......LYL..",
  "...L........L...",
  "...LLLLLLLLLL...",
  "..LAAAAAAAAAAL..",
  ".LAAAAAAAAAAAAL.",
  ".LAAEEAAAAEEAAL.",
  ".LAEWEAAAAEWEAL.",
  ".LAEEEAAAAEEEAL.",
  ".LAPEEAAAAEEPAL.",
  "..LAAAAAAAAAAL..",
  "...LAAAMMAAAL...",
  ".....LLAALL.....",
  ...TORSO_HOODIE,
];

const pandaF1 = [
  "..LLL......LLL..",
  ".LKKKLQQQQLKKKL.",
  ".LKKKFFFFFFKKKL.",
  "..LFFFFFFFFFFL..",
  ".LFFFFFFFFFFFFL.",
  "LQLFKKKFFKKKFLQL",
  "LQLKKEWFFWEKKLQL",
  "LQLKKEKFFKEKKLQL",
  "LLLFKKFNNFKKFLQL",
  "..LFFFFMMFFFFLQ.",
  "...LFFFFFFFRQQ..",
  "....LLLLLLLL....",
  ...TORSO_HOODIE,
];

const ghostF1 = [
  "................",
  ".....LLLLLL.....",
  "...LLGGGGGGLL...",
  "..LGGGGGGGGGGL..",
  "..LGGGGGGGGGGL..",
  ".LGGGGGGGGGGGGL.",
  ".LGGGEGGGGEGGGL.",
  ".LGGGEGGGGEGGGL.",
  ".LGPGGGGGGGGPGL.",
  ".LGGGGGMMGGGGGL.",
  ".LGGGGGGGGGGGGL.",
  ".LoOOOOOOOOOOoL.",
  ".LOOOOOOOOOOOOL.",
  ".LGGGGGOoGGGGGL.",
  ".LgGGGGOoGGGGgL.",
  ".LgGGGGGGGGGGgL.",
  ".LgGGGGGGGGGGgL.",
  ".LgGGGGGGGGGGgL.",
];

const kingF1 = [
  "...L...LL...L...",
  "..LYL.LYYL.LYL..",
  "..LYYLYYYYLYYL..",
  "..LYYYYRRYYYYL..",
  "..LyyyyyyyyyyL..",
  "..LHSSSSSSSSHL..",
  "..LHSESSSSESHL..",
  "..LSSESSSSESSL..",
  "..LSPSSSSSSPSL..",
  "..LSBBBSSBBBSL..",
  "...LBSSMMSSBL...",
  "....LLLssLLL....",
  "..LLCKCOOCKCLL..",
  ".LCKCCOOOOCCKCL.",
  ".LOoOOORROOOoOL.",
  ".LOoOOOOOOOOoOL.",
  ".LOoOOOOOOOOoOL.",
  ".LOoOOOOOOOOoOL.",
];

const dragonKidF1 = [
  "...LL......LL...",
  "...LYL....LYL...",
  "....LYLLLLYL....",
  "...LDDDDDDDDL...",
  "..LDDDDDDDDDDL..",
  ".LdDDDDDDDDDDdL.",
  ".LdDDEDDDDEDDdL.",
  ".LdDDEDDDDEDDdL.",
  ".LDDPDccccDPDDL.",
  "..LDDcNccNcDDL..",
  "...LDDcMMcDDL...",
  "L...LLLLLLLL...L",
  "LL.LLOOccOOLL.LL",
  "LwLOOOOccOOOOLwL",
  "LwLOoOOccOOoOLwL",
  ".LLOoOOOOOOoOLL.",
  "..LOoOOOOOOoOL..",
  "..LOoOOOOOOoOL..",
];

export const CHARACTERS: CharacterDef[] = [
  // ---- common ----
  {
    id: "worker-short",
    name: "짧은머리 사원",
    rarity: "common",
    sprite: { w: 16, h: 18, palette: { ...FACE, ...OUTFIT, H: "#4a3428", h: "#6b4c3a" }, frames: twoFrames(workerShortF1, [[0, 7, ".LL"]]) },
  },
  {
    id: "worker-long",
    name: "긴머리 사원",
    rarity: "common",
    sprite: {
      w: 16,
      h: 18,
      palette: { ...FACE, ...OUTFIT, H: "#7a4a2a", h: "#5a321b", R: "#ff7aa8", Z: "#fff6c8" },
      frames: twoFrames(workerLongF1, [[4, 11, "RZ"]]),
    },
  },
  {
    id: "worker-bun",
    name: "똥머리 주임",
    rarity: "common",
    sprite: {
      w: 16,
      h: 18,
      palette: { ...FACE, ...OUTFIT, H: "#3a2a24", h: "#5a4438", R: "#ffb03a", Z: "#fff6c8" },
      frames: twoFrames(workerBunF1, [[2, 10, "Z"]]),
    },
  },
  {
    id: "worker-cap",
    name: "캡모자 디자이너",
    rarity: "common",
    sprite: {
      w: 16,
      h: 18,
      palette: { ...FACE, ...OUTFIT, H: "#2f2622", K: "#e8524a", k: "#b83a33", Z: "#ffffff" },
      frames: twoFrames(workerCapF1, [
        [0, 15, "L"],
        [1, 15, "L"],
        [2, 14, "LL"],
        [9, 7, "SM"],
      ]),
    },
  },
  {
    id: "cat",
    name: "고양이 사원",
    rarity: "common",
    sprite: {
      w: 16,
      h: 18,
      palette: { ...FACE, ...OUTFIT, F: "#f4a259", f: "#d9803a", N: "#ff8fa3" },
      frames: twoFrames(catF1, [
        [0, 12, ".."],
        [1, 11, "LLLL"],
      ]),
    },
  },
  {
    id: "dog",
    name: "강아지 사원",
    rarity: "common",
    sprite: {
      w: 16,
      h: 18,
      palette: { ...FACE, ...OUTFIT, F: "#f6dcae", f: "#e2c08e", d: "#b97a45", m: "#fff6e6", N: OUT, Q: "#ff8fa3" },
      frames: twoFrames(dogF1, [
        [10, 7, "QQ"],
        [11, 7, "Q"],
      ]),
    },
  },
  {
    id: "bear",
    name: "곰 과장",
    rarity: "common",
    sprite: {
      w: 16,
      h: 18,
      palette: { ...FACE, ...OUTFIT, F: "#a87449", m: "#ecd2ad", N: OUT, P: "#e88a8a" },
      frames: twoFrames(bearF1, [
        [1, 12, "F"],
        [1, 3, "F"],
        [10, 7, "MM"],
      ]),
    },
  },
  // ---- uncommon ----
  {
    id: "rabbit",
    name: "토끼 대리",
    rarity: "uncommon",
    sprite: {
      w: 16,
      h: 18,
      palette: { ...FACE, ...OUTFIT, F: "#f7f3ee", f: "#ddd3cb", N: "#ff8fa3" },
      frames: twoFrames(rabbitF1, [
        [0, 11, ".."],
        [1, 10, "LLLL"],
      ]),
    },
  },
  {
    id: "frog",
    name: "개구리 주임",
    rarity: "uncommon",
    sprite: {
      w: 16,
      h: 18,
      palette: { ...FACE, ...OUTFIT, G: "#7cc96b", g: "#5aa94c", C: "#ffffff" },
      frames: twoFrames(frogF1, [
        [5, 3, "EC"],
        [5, 11, "CE"],
        [6, 3, "EC"],
        [6, 11, "CE"],
      ]),
    },
  },
  {
    id: "penguin",
    name: "펭귄 팀장",
    rarity: "uncommon",
    sprite: {
      w: 16,
      h: 18,
      palette: { ...FACE, ...OUTFIT, B: "#3b4262", C: "#f7f9ff", Y: "#ffb83d", y: "#e8902a" },
      frames: twoFrames(penguinF1, [[0, 7, ".L"]]),
    },
  },
  {
    id: "fox",
    name: "여우 대리",
    rarity: "uncommon",
    sprite: {
      w: 16,
      h: 18,
      palette: { ...FACE, ...OUTFIT, F: "#f08a3c", C: "#fff4e6", D: "#7a3e1c", N: OUT },
      frames: twoFrames(foxF1, [
        [0, 13, ".."],
        [1, 12, "LLLL"],
      ]),
    },
  },
  // ---- rare ----
  {
    id: "robot",
    name: "로봇 대리",
    rarity: "rare",
    sprite: {
      w: 16,
      h: 18,
      palette: { ...FACE, ...OUTFIT, G: "#c7d2e3", g: "#8f9bb3", V: "#2e3a59", E: "#6ff2ff", M: "#6ff2ff", A: "#ff5a5a", a: "#7a2b3a" },
      frames: twoFrames(robotF1, [
        [0, 7, "aa"],
        [9, 6, "V"],
        [9, 9, "V"],
        [10, 7, "MM"],
      ]),
    },
  },
  {
    id: "alien",
    name: "외계인 연구원",
    rarity: "rare",
    sprite: {
      w: 16,
      h: 18,
      palette: { ...FACE, ...OUTFIT, A: "#9be36d", Y: "#ffe35a", y: "#9c8a3a", M: "#3d6b2b", P: "#ff9fc0" },
      frames: twoFrames(alienF1, [
        [0, 3, "y"],
        [0, 12, "y"],
      ]),
    },
  },
  {
    id: "panda-headset",
    name: "판다 상담원",
    rarity: "rare",
    sprite: {
      w: 16,
      h: 18,
      palette: { ...FACE, ...OUTFIT, F: "#fbfbf7", K: "#3a3a4c", E: "#0e0e16", N: OUT, Q: "#6b7088", R: "#7dff8a", q: "#4a4f63" },
      frames: twoFrames(pandaF1, [
        [10, 7, "MM"],
        [10, 11, "q"],
      ]),
    },
  },
  // ---- legendary ----
  {
    id: "ghost",
    name: "유령 인턴",
    rarity: "legendary",
    sprite: {
      w: 16,
      h: 18,
      palette: { ...FACE, ...OUTFIT, G: "#f4f7ffcc", g: "#c8d2f0cc", L: "#2b2b3acc", P: "#ffb3c6", M: "#5a5470" },
      frames: twoFrames(ghostF1, [
        [9, 7, "MM"],
        [10, 7, "MM"],
        [13, 0, "LG"],
        [13, 14, "GL"],
      ]),
    },
  },
  {
    id: "golden-king",
    name: "황금 왕",
    rarity: "legendary",
    sprite: {
      w: 16,
      h: 18,
      palette: {
        ...FACE,
        O: "#f5c242",
        o: "#d39a1f",
        C: "#fffaf0",
        K: OUT,
        Y: "#ffd23f",
        y: "#e0a91c",
        R: "#e8384f",
        H: "#8a5a3c",
        B: "#8a5a3c",
        Z: "#fffbe0",
      },
      frames: twoFrames(kingF1, [
        [0, 14, "Z"],
        [1, 13, "ZZZ"],
        [2, 14, "Z"],
        [3, 7, "RZ"],
      ]),
    },
  },
  {
    id: "dragon-kid",
    name: "아기 용",
    rarity: "legendary",
    sprite: {
      w: 16,
      h: 18,
      palette: { ...FACE, ...OUTFIT, D: "#5fcf8f", d: "#3fae6f", Y: "#fff1c4", c: "#f6e7a8", N: "#2f7a4f", w: "#9fe8c0", X: "#d8dde8" },
      frames: twoFrames(dragonKidF1, [
        [10, 0, "L"],
        [10, 15, "L"],
        [11, 0, "LL"],
        [11, 14, "LL"],
        [12, 0, "LwL"],
        [12, 13, "LwL"],
        [13, 0, "LL"],
        [13, 14, "LL"],
        [14, 0, ".L"],
        [14, 14, "L."],
        [2, 13, "X"],
        [1, 14, "X"],
      ]),
    },
  },
];

// ---------------------------------------------------------------------------
// 하늘에 지나가는 것들

const birdFlock: string[][] = [
  [
    "......K...K......",
    ".......KKK.......",
    ".................",
    ".................",
    ".KKK.............",
    "K...K.......K...K",
    ".............KKK.",
    ".................",
  ],
  [
    ".................",
    ".......KKK.......",
    "......K...K......",
    "K...K............",
    ".KKK.............",
    ".................",
    ".............KKK.",
    "............K...K",
  ],
];

const birdBody = [
  ".............",
  ".............",
  ".............",
  "......LLLL...",
  ".....LBBBBL..",
  "....LBBBBKBL.",
  "LL.LBBBBBBBYL",
  "LBLBBBBBBccL.",
  ".LBBBBBcccL..",
  "..LLLLLLLL...",
];
const bird: string[][] = [
  edit(birdBody, [
    [1, 1, "LLL"],
    [2, 0, "LwwwL"],
    [3, 1, "LwwwL"],
    [4, 3, "LLw"],
  ]),
  edit(birdBody, [
    [6, 5, "www"],
    [7, 4, "ww"],
    [8, 3, "w"],
  ]),
];

const butterfly: string[][] = [
  [".LL...LL.", "LPPL.LPPL", "LPYPLPYPL", ".LPPLPPL.", ".LppLppL.", "..LL.LL.."],
  [".........", "..LL.LL..", "..LPLPL..", "..LPLPL..", "..LpLpL..", "...L.L..."],
];

const hotAirBalloon = [
  "....LLLLLL....",
  "..LLRRYYRRLL..",
  ".LRRRYYYYRRRL.",
  "LRwRYYYYYYRRRL",
  "LRwRYYYYYYRRRL",
  "LrRRYYYYYYRRrL",
  "LrRRYYYYYYRRrL",
  "LrrRYYYYYYRrrL",
  ".LrRRyYYyRRrL.",
  "..LrRyyyyRrL..",
  "...LrryyrrL...",
  "....LLLLLL....",
  "....K.YY.K....",
  "....K....K....",
  "....LLLLLL....",
  "....LBBBBL....",
  "....LbbbbL....",
  "....LLLLLL....",
];

const airplaneBase = [
  ".LLL....................",
  ".LRRL...................",
  ".LRRRL..................",
  ".LRRRRLLLLLLLLLLLLLL....",
  ".LwwwwwwBBwBBwBBwwwwL...",
  "..LRRRRRRRRRRRRRRRRRRL..",
  "...LwwwwwwwwwwwwwwwwL...",
  "....LLLLLLLLLLLLLLLL....",
  "........LgggggL.........",
  ".........LLLLL..........",
];
const airplane: string[][] = [
  edit(airplaneBase, [
    [3, 22, "K"],
    [4, 22, "K"],
    [5, 22, "K"],
    [6, 22, "K"],
    [7, 22, "K"],
  ]),
  edit(airplaneBase, [
    [4, 23, "g"],
    [5, 22, "K"],
    [6, 23, "g"],
  ]),
];

const kiteBase = [
  ".....L.....",
  "....LRL....",
  "...LRRYL...",
  "..LRRRYYL..",
  ".LRRRRYYYL.",
  "LBBBBBGGGGL",
  ".LBBBBGGGL.",
  "..LBBBGGL..",
  "...LBBGL...",
  "....LBL....",
  ".....L.....",
];
const kite: string[][] = [
  [...kiteBase, ".....K.....", "......K....", ".....R.....", "....K......", ".....Y.....", "......K...."],
  [...kiteBase, ".....K.....", "....K......", ".....R.....", "......K....", ".....Y.....", "....K......"],
];

const bangpaeKite = [
  "LLLLLLLLLLL",
  "LwwwRRRwwwL",
  "LwwRRRRRwwL",
  "LwwwRRRwwwL",
  "LwwwwwwwwwL",
  "LwwwLLLwwwL",
  "LwwL...LwwL",
  "LwwL...LwwL",
  "LwwwLLLwwwL",
  "LBwwwwwwwBL",
  "LBBwwwwwBBL",
  "LLLLLLLLLLL",
  ".....K.....",
  "......K....",
];

const bee: string[][] = [
  ["....LL.LL..", "...LwwLwwL.", "...LLLLLLL.", "..LYKYKYYKL", "LLYYKYKYYYL", "..LYKYKYYL.", "...LLLLLL.."],
  ["...........", "...LwwLwwL.", "...LLLLLLL.", "..LYKYKYYKL", "LLYYKYKYYYL", "..LYKYKYYL.", "...LLLLLL.."],
];

const dragonfly: string[][] = [
  ["....llllll....", "...lwwwwwwl...", "....llllll.LL.", "LRRRRRRRRRLKKL", "....llllll.LL.", "...lwwwwwwl...", "....llllll...."],
  ["..llllll......", ".lwwwwwwl.....", "..llllll...LL.", "LRRRRRRRRRLKKL", "..llllll...LL.", ".lwwwwwwl.....", "..llllll......"],
];

const snowmanBalloonBase = [
  "....LLLL....",
  "....LKKL....",
  "...LLLLLL...",
  "...LwwwwL...",
  "..LwKwwKwL..",
  "..LwwOOwwL..",
  "...LwwwwL...",
  "..LRRRRRRL..",
  ".LwwwRwwwwL.",
  "LwwwwRwwwwwL",
  "LwwwwwKwwwwL",
  "LgwwwwKwwwgL",
  ".LggwwwwggL.",
  "..LLggggLL..",
  "....LLLL....",
];
const snowmanBalloon: string[][] = [
  [...snowmanBalloonBase, ".....k......", "......k.....", ".....k......", "......k....."],
  [...snowmanBalloonBase, "......k.....", ".....k......", "......k.....", ".....k......"],
];

const ufoBase = [
  "........LLLL........",
  "......LLCCwCLL......",
  ".....LCCAAACCCL.....",
  ".....LCAKAKACCL.....",
  "...LLLLLLLLLLLLLL...",
  ".LGGGGGGGGGGGGGGGGL.",
  "LGG1GGG2GGGG2GGG1GGL",
  ".LggggggggggggggggL.",
  "...LLLLLLLLLLLLLL...",
];
function ufoFrame(a: string, b: string): string[] {
  return ufoBase.map((r) => r.replace(/1/g, a).replace(/2/g, b));
}

const shootingStar = [
  "t.................",
  ".tt...............",
  "...tT.............",
  ".....TT.......y...",
  ".......TTT...yYy..",
  "..........YYyYwYy.",
  ".............yYy..",
  "..............y...",
];

const skyWhale = [
  ".....................w.w......",
  "......................w.......",
  "LL.........LLLLLLLLLLLLL......",
  "LBL.....LLLBBBBBBBBBBBBBLL....",
  "LBBL..LLBBBBBBBBBBBBBBBBBBLL..",
  ".LBBLLBBBBBBBBBBBBBBBBBBBBBBL.",
  "..LBBBBBBBBBBBBBBBBBBBBBKBBBBL",
  "..LBBBBBBBBBBBBBBBBBBBBBBBPBBL",
  ".LbbLLbbbccccccccccccccccbbbbL",
  "LbbL..LLbbccccccccccccccbbbbL.",
  "LbL.....LLLbbbbbbbbbbbbbbLLL..",
  "LL.........LLLLLLLLLLLLLL.....",
];

const rainbowBirdBody = [
  "................",
  "................",
  "..........LLLL..",
  "........LLwwwwL.",
  "RRRR...LwwwwwKwL",
  "YYYYYLLwwwwwwwAA",
  "GGGGLwwwwwwwwwL.",
  "BBBL.LwwwwwwwL..",
  "VV....LLLLLLL...",
];
const rainbowBird: string[][] = [
  edit(rainbowBirdBody, [
    [0, 7, "LL"],
    [1, 6, "LRYL"],
    [2, 6, "LGBL"],
  ]),
  edit(rainbowBirdBody, [
    [5, 7, "RYG"],
    [6, 6, "RYGB"],
    [7, 7, "GBV"],
  ]),
];

const satelliteBase = [
  "..........L..........",
  ".........LRL.........",
  "LLLLLL...LLL...LLLLLL",
  "LBbBbL..LGGGL..LBbBbL",
  "LbBbBLKKLGgGLKKLbBbBL",
  "LBbBbL..LGGGL..LBbBbL",
  "LLLLLL...LLL...LLLLLL",
];

const skyLanternBase = [
  "..LLLLL..",
  ".LyYYYyL.",
  "LyYYYYYyL",
  "LyYYYYYyL",
  "LyYYwYYyL",
  "LyYYYYYyL",
  "LyYYYYYyL",
  ".LyYYYyL.",
  "..LLLLL..",
];
const skyLantern: string[][] = [
  [...skyLanternBase, "...LFL...", "....R...."],
  [...skyLanternBase, "...LRL...", "....F...."],
];

const pumpkinGhostTop = [
  "......LL......",
  ".....LGGL.....",
  "...LLLLLLLL...",
  "..LQqQQQQqQL..",
  ".LQqQQQQQQqQL.",
  ".LQFFQQQQFFQL.",
  ".LQqFQQQQFqQL.",
  ".LQQQQQQQQQQL.",
  ".LQFQFFFFQFQL.",
  "..LQFFQQFFQL..",
  "...LLLLLLLL...",
];
const pumpkinGhost: string[][] = [
  [...pumpkinGhostTop, "...LwwwwwwL...", "..LwwwwwwwwL..", "..LwLwwLwwLL..", "...L.LL.LL...."],
  [...pumpkinGhostTop, "...LwwwwwwL...", "..LwwwwwwwwL..", "..LLwwLwwLwL..", "....LL.LL.L..."],
];

const sleigh = [
  "...............",
  "....LL.........",
  "...LRRL........",
  "..LwwwwL.LLLL..",
  "..LSKSSL.LbbL..",
  "..LwwwwL.LbbbL.",
  "LLLRwwRLLLbbbLL",
  "LRRRRRRRRRRRRRL",
  "LRRYRRRRRRRRYRL",
  ".LRRRRRRRRRRRL.",
  "..LLLLLLLLLLL..",
  "YYYYYYYYYYYYYY.",
];
const reindeerTop = [
  "......L.L..",
  "......LLL..",
  ".....LBBBL.",
  ".....LBKBBN",
  "LLLLLLBBBL.",
  "LBBBBBBBL..",
  "LbBBBBBbL..",
  ".LLLLLLLL..",
];
const santa: string[][] = [
  stamp(32, 12, [
    [0, 0, sleigh],
    [15, 6, ["kkkkkk"]],
    [21, 1, [...reindeerTop, ".L.L..L.L..", ".L.L..L.L.."]],
  ]),
  stamp(32, 12, [
    [0, 0, sleigh],
    [15, 6, ["kkkkkk"]],
    [21, 1, [...reindeerTop, ".LL...LL...", "L..L.L..L.."]],
  ]),
];

const goldenDragon: string[][] = [
  [
    "...............R..R.............",
    "............R.LLLLLL....L..L....",
    "............LLYYYYYYLL..wL.wL...",
    ".........R.LYYYYYYYYYYL.LLLLLL..",
    "L..R..R..LLYYYyyyyyyYYYLYYYYYYL.",
    "LLLLLLLLLYYYyyLLLLLLyyRLYYKYYYYL",
    "LYYYYYYYYYYyLL..LL..LLRLYYYYYYNL",
    ".LLYYYYYYyyL..........RLyyLLLLLL",
    "...yyyyyyLL.............LLywwyL.",
    "...LLLLLL.................L..L..",
    "........LL......................",
    "................................",
  ],
  [
    "...R..R.........................",
    "...LLLLLLR..............L..L....",
    "...YYYYYYLL.............wL.wL...",
    ".LLYYYYYYYYLR.........L.LLLLLL..",
    "LYYyyyyyyYYYLL.R..R.LLYLYYYYYYL.",
    "LLLLLLLLLyyYYYLLLLLLYYRLYYKYYYYL",
    "L.......LLLyYYYYYYYYYYRLYYYYYYNL",
    "...........LyyYYYYYYyyRLyyLLLLLL",
    "............LLyyyyyyLL..LLywwyL.",
    "..............LLLLLL......L..L..",
    "................LL..............",
    "................................",
  ],
];

const whaleCalf = [
  "......LLLLL...",
  "LL..LLBBBBBL..",
  "LBLLBBBBBBKBL.",
  ".LBBBBBBBBBPBL",
  "LBLLcccccccBL.",
  "LL..LLLLLLLL..",
];
const whaleFamily: string[][] = [
  stamp(32, 19, [
    [2, 0, skyWhale],
    [1, 12, whaleCalf],
    [20, 0, ["...Z.......Z"]],
    [8, 4, ["Z"]],
  ]),
  stamp(32, 19, [
    [2, 0, edit(skyWhale, [[0, 21, "..w.w"], [1, 22, "ww"]])],
    [2, 13, whaleCalf],
    [24, 1, ["Z"]],
    [12, 3, ["Z"]],
  ]),
];

const phoenix: string[][] = [
  [
    "........Y.Y.Y...........",
    ".......LQLQLQL...R.R....",
    "........LRQRQRL.LYLYL...",
    ".........LRRRRLLQQQQL...",
    "..........LRRRLQQQKQQL..",
    "...........LLLQQQQQQQAA.",
    "..........LRRRRQQQQQQL..",
    "RR.......LRRRRRRYYYYL...",
    ".QRR....LRRRRRRYYYYL....",
    "..YQRRRLRRRRRRRYYYL.....",
    "...YQQRRRRRRRRRLLL......",
    ".....YYQQQRRLLL.........",
    "..Y.....YYQQL...........",
    "...........Y............",
  ],
  [
    "........................",
    ".................R.R....",
    "................LYLYL...",
    "...............LQQQQL...",
    "..............LQQQKQQL..",
    "...........LLLQQQQQQQAA.",
    "..........LRRRRQQQQQQL..",
    "RR.......LRRLLLLLLYYL...",
    ".QRR....LRRLRQRQRLYL....",
    "..YQRRRLRRRLQRQRLYL.....",
    "...YQQRRRRRRLQRL.L......",
    ".....YYQQQRRLLYL........",
    "..Y.....YYQQL.Y.........",
    "...........Y............",
  ],
];

const fireworks: string[][] = [
  [
    ".................",
    ".................",
    ".................",
    ".................",
    ".................",
    "........R........",
    "........R........",
    ".......YYY.......",
    ".....RRYwYRR.....",
    ".......YYY.......",
    "........R........",
    "........R........",
    ".................",
    "........y........",
    ".................",
    "........y........",
    ".................",
  ],
  [
    ".................",
    ".................",
    ".................",
    "......B.R.B......",
    "....R...Y...R....",
    ".....Y..y..Y.....",
    "...B..y...y..B...",
    ".................",
    "...RYy..w..yYR...",
    ".................",
    "...B..y...y..B...",
    ".....Y..y..Y.....",
    "....R...Y...R....",
    "......B.R.B......",
    ".................",
    ".................",
    ".................",
  ],
  [
    ".................",
    ".................",
    ".....b..r..b.....",
    "..r.....w.....r..",
    "....w.......w....",
    ".................",
    ".b.............b.",
    ".................",
    "...w.........w...",
    ".r.............r.",
    ".................",
    ".................",
    ".b..w.......w..b.",
    "........w........",
    ".................",
    "..r...........r..",
    ".....b..r..b.....",
  ],
];

const peperoStick = [
  "......LLLLLLLLLLLLLLLLLL..",
  "LLLLLLLCCPCCCYCCPCCCCYCCL.",
  "LbbbbbLCCCCPCCCCCYCCCCCCL.",
  "LLLLLLLCCCCCCCCCCCCCCCCCL.",
  "......LLLLLLLLLLLLLLLLLL..",
];

export const SKY_EVENTS: SkyEventDef[] = [
  // ---- common ----
  { id: "bird-flock", name: "새 떼", rarity: "common", motion: "fly", sprite: { w: 17, h: 8, palette: { K: "#3d4260" }, frames: birdFlock } },
  {
    id: "bluebird",
    name: "파랑새",
    rarity: "common",
    motion: "fly",
    sprite: { w: 13, h: 10, palette: { L: OUT, B: "#6cb6ff", c: "#fff4d6", K: OUT, Y: "#ffb347", w: "#3f8be0" }, frames: bird },
  },
  {
    id: "paper-plane",
    name: "종이비행기",
    rarity: "common",
    motion: "fly",
    sprite: {
      w: 12,
      h: 7,
      palette: { L: "#5a6680", w: "#ffffff", g: "#cdd6e6" },
      frames: [["LLL.........", ".LwwLLL.....", "..LwwwwwLLL.", "...LwwwwwwwL", "..LggggLLLL.", ".LggLLL.....", "LLL........."]],
    },
  },
  {
    id: "butterfly",
    name: "나비",
    rarity: "common",
    motion: "fly",
    when: { season: ["spring", "summer"] },
    sprite: { w: 9, h: 6, palette: { L: OUT, P: "#ff8fc8", p: "#e05aa3", Y: "#ffe066" }, frames: butterfly },
  },
  {
    id: "smile-cloud",
    name: "웃는 구름",
    rarity: "common",
    motion: "drift",
    sprite: {
      w: 20,
      h: 9,
      palette: { L: "#aab8d4", w: "#ffffff", g: "#e3eaf6", K: "#5a6488", P: "#ffc2d1" },
      frames: [
        [
          "......LLLLL.........",
          "....LLwwwwwLLLL.....",
          "...LwwwwwwwwwwwLL...",
          ".LLwwwwwwwwwwwwwwL..",
          "LwwwwwKwwwwKwwwwwwL.",
          "LwwwwPwwKKwwPwwwwwwL",
          "LgwwwwwwwwwwwwwwwwgL",
          ".LggggggggggggggggL.",
          "..LLLLLLLLLLLLLLLL..",
        ],
      ],
    },
  },
  // ---- uncommon ----
  {
    id: "hot-air-balloon",
    name: "열기구",
    rarity: "uncommon",
    motion: "drift",
    sprite: {
      w: 14,
      h: 18,
      palette: { L: OUT, R: "#ff6b6b", r: "#d94a4a", Y: "#ffd166", y: "#e8ab3d", w: "#ffe0e0", K: "#6b5a4a", B: "#b07a4a", b: "#8a5a34", F: "#ff8c3a" },
      frames: [hotAirBalloon, edit(hotAirBalloon, [[12, 6, "FF"]])],
    },
  },
  {
    id: "propeller-plane",
    name: "경비행기",
    rarity: "uncommon",
    motion: "fly",
    sprite: { w: 24, h: 10, palette: { L: OUT, R: "#ff6b6b", w: "#f4f7fb", g: "#c9d3e3", B: "#7cc4ff", K: "#5a6680" }, frames: airplane },
  },
  {
    id: "kite",
    name: "가오리연",
    rarity: "uncommon",
    motion: "drift",
    sprite: { w: 11, h: 17, palette: { L: OUT, R: "#ff6b8b", Y: "#ffd166", B: "#6cb6ff", G: "#7cd67c", K: "#7a7a8a" }, frames: kite },
  },
  {
    id: "bangpae-kite",
    name: "방패연",
    rarity: "uncommon",
    motion: "drift",
    when: { holiday: ["seollal"] },
    sprite: { w: 11, h: 14, palette: { L: OUT, w: "#fffaf0", R: "#e8384f", B: "#3f6fd9", K: "#7a7a8a" }, frames: [bangpaeKite] },
  },
  {
    id: "bee",
    name: "꿀벌",
    rarity: "uncommon",
    motion: "fly",
    when: { season: ["spring", "summer"] },
    sprite: { w: 11, h: 7, palette: { L: OUT, Y: "#ffd23f", K: OUT, w: "#e8f4ffdd" }, frames: bee },
  },
  {
    id: "red-dragonfly",
    name: "고추잠자리",
    rarity: "uncommon",
    motion: "fly",
    when: { season: ["autumn"] },
    sprite: { w: 14, h: 7, palette: { L: OUT, l: "#7f9cc4", R: "#e8503a", K: "#7a2a1a", w: "#e6f4ffdd" }, frames: dragonfly },
  },
  {
    id: "snowman-balloon",
    name: "눈사람 풍선",
    rarity: "uncommon",
    motion: "drift",
    when: { season: ["winter"] },
    sprite: {
      w: 12,
      h: 19,
      palette: { L: OUT, w: "#ffffff", g: "#d7e2f2", K: OUT, O: "#ff8c3a", R: "#e84a5f", k: "#7a7a8a" },
      frames: snowmanBalloon,
    },
  },
  {
    id: "pepero-stick",
    name: "왕 빼빼로",
    rarity: "uncommon",
    motion: "drift",
    when: { holiday: ["pepero"] },
    sprite: { w: 26, h: 5, palette: { L: OUT, C: "#6b3a24", b: "#e8b86a", P: "#ff8fb1", Y: "#ffe066" }, frames: [peperoStick] },
  },
  // ---- rare ----
  {
    id: "ufo",
    name: "UFO",
    rarity: "rare",
    motion: "fly",
    sprite: {
      w: 20,
      h: 9,
      palette: { L: OUT, G: "#b8c4d6", g: "#8e9bb0", C: "#9fe8ffcc", w: "#ffffff", A: "#9be36d", K: OUT, R: "#ff5a5a", Y: "#ffe066", B: "#5ac8ff" },
      frames: [ufoFrame("R", "Y"), ufoFrame("Y", "B"), ufoFrame("B", "R")],
    },
  },
  {
    id: "shooting-star",
    name: "별똥별",
    rarity: "rare",
    motion: "streak",
    when: { time: ["sunset", "night"] },
    sprite: {
      w: 18,
      h: 8,
      palette: { Y: "#fff3a0", y: "#ffd23f", w: "#ffffff", t: "#ffffff55", T: "#fff3c8aa" },
      frames: [
        shootingStar,
        edit(shootingStar, [
          [2, 14, "y"],
          [3, 14, "Y"],
          [5, 12, "Y"],
          [5, 16, "Yy"],
          [7, 14, "Y"],
        ]),
      ],
    },
  },
  {
    id: "sky-whale",
    name: "하늘 고래",
    rarity: "rare",
    motion: "drift",
    sprite: {
      w: 30,
      h: 12,
      palette: { L: OUT, B: "#6c8ff0", b: "#4a6bd0", c: "#dfe8ff", K: OUT, P: "#ffa3c0", w: "#bfe3ff" },
      frames: [skyWhale, edit(skyWhale, [[0, 20, "w...w"], [1, 21, "w.w"]])],
    },
  },
  {
    id: "rainbow-bird",
    name: "무지개새",
    rarity: "rare",
    motion: "fly",
    sprite: {
      w: 16,
      h: 9,
      palette: { L: OUT, w: "#ffffff", K: OUT, A: "#ffb347", R: "#ff5a5a", Y: "#ffd23f", G: "#5fd068", B: "#4fa8ff", V: "#a56cff" },
      frames: rainbowBird,
    },
  },
  {
    id: "satellite",
    name: "인공위성",
    rarity: "rare",
    motion: "drift",
    when: { time: ["night", "dawn"] },
    sprite: {
      w: 21,
      h: 7,
      palette: { L: OUT, B: "#4f7bd9", b: "#7ea6ff", G: "#d0d8e6", g: "#a8b4c8", K: "#8e9bb0", R: "#ff5a5a", r: "#5a3a4a" },
      frames: [satelliteBase, edit(satelliteBase, [[1, 10, "r"]])],
    },
  },
  {
    id: "sky-lantern",
    name: "소원 풍등",
    rarity: "rare",
    motion: "float",
    when: { time: ["sunset", "night"], holiday: ["chuseok"] },
    sprite: { w: 9, h: 11, palette: { L: "#7a3b1e", Y: "#ffd166", y: "#ffb347", w: "#fff6d0", F: "#fff3b0", R: "#ff8c42" }, frames: skyLantern },
  },
  {
    id: "pumpkin-ghost",
    name: "호박 유령",
    rarity: "rare",
    motion: "fly",
    when: { holiday: ["halloween"] },
    sprite: {
      w: 14,
      h: 15,
      palette: { L: OUT, Q: "#ff8c2a", q: "#d96a12", G: "#5aa94c", F: "#ffe066", w: "#f4f7ffdd" },
      frames: pumpkinGhost,
    },
  },
  {
    id: "santa-sleigh",
    name: "산타 썰매",
    rarity: "rare",
    motion: "fly",
    when: { holiday: ["christmas"] },
    sprite: {
      w: 32,
      h: 12,
      palette: { L: OUT, R: "#e8384f", Y: "#ffd23f", S: "#ffdcbf", K: OUT, w: "#ffffff", b: "#a0663f", B: "#a87449", N: "#ff3b3b", k: "#8a5a3c" },
      frames: santa,
    },
  },
  // ---- legendary ----
  {
    id: "golden-dragon",
    name: "황금 용",
    rarity: "legendary",
    motion: "fly",
    sprite: {
      w: 32,
      h: 12,
      palette: { L: "#7a4a12", Y: "#ffd23f", y: "#e8a91c", R: "#ff6b4a", K: OUT, w: "#fff6c8", N: "#7a4a12" },
      frames: goldenDragon,
    },
  },
  {
    id: "whale-family",
    name: "하늘 고래 가족",
    rarity: "legendary",
    motion: "drift",
    sprite: {
      w: 32,
      h: 19,
      palette: { L: OUT, B: "#7a6cf0", b: "#5a4ad0", c: "#ece6ff", K: OUT, P: "#ffa3c0", w: "#d8e6ff", Z: "#fff3a0" },
      frames: whaleFamily,
    },
  },
  {
    id: "phoenix",
    name: "불사조",
    rarity: "legendary",
    motion: "fly",
    sprite: {
      w: 24,
      h: 14,
      palette: { L: "#7a2a12", R: "#ff4a3a", Q: "#ff9a2a", Y: "#ffd23f", A: "#ffe066", K: OUT },
      frames: phoenix,
    },
  },
  {
    id: "fireworks",
    name: "새해 불꽃",
    rarity: "legendary",
    motion: "float",
    when: { holiday: ["newyear"] },
    sprite: {
      w: 17,
      h: 17,
      palette: { R: "#ff5a7a", Y: "#ffe066", y: "#ffd23f99", B: "#6cd4ff", w: "#ffffff", r: "#ff5a7a99", b: "#6cd4ff99" },
      frames: fireworks,
    },
  },
];

// ---------------------------------------------------------------------------
// 먼 언덕 위 건물

const windmillBase = [
  ".....................",
  ".....................",
  ".....................",
  ".....................",
  ".....................",
  ".........LLL.........",
  "........LRRRL........",
  ".......LRRRRRL.......",
  "......LRRRRRRRL......",
  "......LLLLLLLLL......",
  ".......LwwwwwL.......",
  ".......LwwwwwL.......",
  "......LwwwwwwwL......",
  "......LwwwBwwwL......",
  "......LwwwBwwwL......",
  "......LwwwwwwwL......",
  ".....LwwwwwwwwwL.....",
  ".....LwwwwwwwwwL.....",
  ".....LwwwwwwwwwL.....",
  ".....LwwwwDwwwwL.....",
  "....LwwwwDDDwwwwL....",
  "....LwwwwDDDwwwwL....",
  "....LwwwwDDDwwwwL....",
  "....LLLLLLLLLLLLL....",
];
const windmillPlus = [
  "..........b..........",
  "..........bs.........",
  "..........bs.........",
  "..........bs.........",
  "..........bs.........",
  "..........bs.........",
  "....sssss.b..........",
  "...bbbbbbbKbbbbbbb...",
  "..........b.sssss....",
  ".........sb..........",
  ".........sb..........",
  ".........sb..........",
  ".........sb..........",
  ".........sb..........",
  "..........b..........",
];
const windmillX = [
  ".....................",
  "....bs..........b....",
  ".....bs........bs....",
  "......bs......bs.....",
  ".......bs....bs......",
  "........bs..bs.......",
  ".........b.bs........",
  "..........K..........",
  "........sb.b.........",
  ".......sb..sb........",
  "......sb....sb.......",
  ".....sb......sb......",
  "....sb........sb.....",
  "....b..........sb....",
  ".....................",
];
function overlay(base: string[], top: string[]): string[] {
  return base.map((row, r) => {
    const t = top[r];
    if (!t) return row;
    let s = "";
    for (let c = 0; c < row.length; c++) s += t[c] && t[c] !== "." ? t[c] : row[c];
    return s;
  });
}

const lighthouse = [
  "........LL........",
  ".......LRRL.......",
  "......LRRRRL......",
  ".....LLLLLLLL.....",
  ".....LYYwwYYL.....",
  ".....LYYwwYYL.....",
  ".....LLLLLLLL.....",
  "....LLLLLLLLLL....",
  "......LwwwwL......",
  "......LRRRRL......",
  "......LRRRRL......",
  ".....LwwwwwwL.....",
  ".....LwwKKwwL.....",
  ".....LRRRRRRL.....",
  ".....LRRRRRRL.....",
  "....LwwwwwwwwL....",
  "....LwwwwwwwwL....",
  "....LRRRRRRRRL....",
  "....LRRRRRRRRL....",
  "...LwwwwwwwwwwL...",
  "...LwwwwDDwwwwL...",
  "...LRRRRDDRRRRL...",
  "..LLLLLLLLLLLLLL..",
  ".LssSssSsssSssSsL.",
];

const castle = [
  "...LR..................LR.",
  "...LRR.................LRR",
  "...L..................L...",
  "..LBL................LBL..",
  ".LBBBL..............LBBBL.",
  "LBBBBBL............LBBBBBL",
  "LLLLLLL.LL..LL..LL.LLLLLLL",
  "LsssssLLssLLssLLssLLsssssL",
  "LsssssLLssssssssssLLsssssL",
  "LssKssLLssssssssssLLssKssL",
  "LssKssLLssssssssssLLssKssL",
  "LsssssLLssssssssssLLsssssL",
  "LsssssLLssssLLssssLLsssssL",
  "LsssssLLsssLDDLsssLLsssssL",
  "LssKssLLssLDDDDLssLLssKssL",
  "LssKssLLssLDDDDLssLLssKssL",
  "LsssssLLssLDDDDLssLLsssssL",
  "LsssssLLssLDDDDLssLLsssssL",
  "LsssssLLssLDDYDLssLLsssssL",
  "LLLLLLLLLLLLLLLLLLLLLLLLLL",
];

const cottage = [
  "...............LLL....",
  "...............LcL....",
  ".....LLLLLLLLLLLcL....",
  "....LRRRRRRRRRRRRL....",
  "...LRRRRRRRRRRRRRRL...",
  "..LRRRRRRRRRRRRRRRRL..",
  ".LrrrrrrrrrrrrrrrrrrL.",
  "LLLLLLLLLLLLLLLLLLLLLL",
  "..LwwwwwwwwwwwwwwwwL..",
  "..LwBBBwwwwwwwwBBBwL..",
  "..LwBvBwwLLLLwwBvBwL..",
  "..LwBBBwwLDDLwwBBBwL..",
  "..LwwwwwwLDDLwwwwwwL..",
  "..LwwwwwwLDYLwwwwwwL..",
  "..LGPGwwwLDDLwwwGPGL..",
  "..LLLLLLLLLLLLLLLLLL..",
];

const tentBase = [
  ".......L................",
  ".......LRR..............",
  ".......LR...............",
  ".......L................",
  "......LTL...............",
  ".....LTLtL..............",
  "....LTTLttL.............",
  "...LTTTLtttL............",
  "..LTTTTLttttL...........",
  ".LTTTTLKLttttL..........",
  "LTTTTLKKKLttttL.........",
  "LTTTLKKKKKLtttL.........",
  "LTTLKKKKKKKLttL.........",
  "LLLLLLLLLLLLLLL..LLLLL..",
];
const tent: string[][] = [
  edit(tentBase, [
    [7, 20, "F"],
    [8, 19, "FF"],
    [9, 19, "FRF"],
    [10, 18, "FRRF"],
    [11, 18, "FRYRF"],
    [12, 17, "LbbbbbL"],
  ]),
  edit(tentBase, [
    [6, 20, "F"],
    [7, 21, "F"],
    [8, 20, "FF"],
    [9, 19, "FRF"],
    [10, 19, "FRRF"],
    [11, 18, "FRYRF"],
    [12, 17, "LbbbbbL"],
  ]),
];

const observatory = edit(
  [
    "......................",
    "......................",
    "........LLKKLL........",
    "......LLggKKggLL......",
    ".....LgwggKKggggL.....",
    "....LgwgggKKgggggL....",
    "....LgggggKKgggggL....",
    "...LLLLLLLLLLLLLLLL...",
    "...LssssssssssssssL...",
    "...LssKKssssssKKssL...",
    "...LssKKssssssKKssL...",
    "...LsssssLLLLsssssL...",
    "...LsssssLDDLsssssL...",
    "...LsssssLDDLsssssL...",
    "...LsssssLDDLsssssL...",
    "...LLLLLLLLLLLLLLLL...",
  ],
  [
    [0, 15, "LL"],
    [1, 14, "LTTL"],
    [2, 13, "LTTL"],
    [3, 12, "TT"],
  ],
);

const hotSpringBody = [
  "........LLLLLL........",
  "......LLbbbbbbLL......",
  "....LLbbbbbbbbbbLL....",
  "..LLbbbbbbbbbbbbbbLL..",
  ".LBBBBBBBBBBBBBBBBBBL.",
  "...LwwwwwwwwwwwwwwL...",
  "...LwKKwNNNNNNwKKwL...",
  "...LwKKwNNZZNNwKKwL...",
  "...LwwwwNNNNNNwwwwL...",
  "...LwwwwKKKKKKwwwwL...",
  "...LwwwwKKKKKKwwwwL...",
  "..LLLLLLLLLLLLLLLLLL..",
  ".LssssssssssssssssssL.",
  ".LsAAAAAAAAAAAAAAAAsL.",
  ".LsAaAAAAaAAAAaAAAAsL.",
  "..LssssssssssssssssL..",
];
const hotSpring: string[][] = [
  [
    ".......v...v...v......",
    "........v...v...v.....",
    ".......v...v...v......",
    "......v...v...v.......",
    ".......v...v...v......",
    "........v...v...v.....",
    ...hotSpringBody,
  ],
  [
    "........v...v...v.....",
    ".......v...v...v......",
    "......v...v...v.......",
    ".......v...v...v......",
    "........v...v...v.....",
    ".......v...v...v......",
    ...hotSpringBody,
  ],
];

const ferrisWheel = [
  ".........................",
  ".........LLLLLLL.........",
  ".......LLL..g..LLL.......",
  ".....LLLRL..g..LYLLL.....",
  "....LL.LLL..g..LLL.LL....",
  "....L.g.....g.....g.L....",
  "...LL..g....g....g..LL...",
  "...L....g...g...g....L...",
  "..LPL....g..g..g....LBL..",
  "..LLL.....g.g.g.....LLL..",
  "..L........ggg........L..",
  "..LgggggggggYgggggggggL..",
  "..L........ggg........L..",
  "..L.......gKgKg.......L..",
  "..LL.....gK.g.Kg.....LL..",
  "...L....g.K.g.K.g....L...",
  "..LGL..g.K..g..K.g..LRL..",
  "..LLL.g..K..g..K..g.LLL..",
  "....LL..K...g...K..LL....",
  ".....LLLK...g...KLLL.....",
  ".......LLL..g..LLL.......",
  ".......LBLLLLLLLYL.......",
  "......KLLL.....LLLK......",
  "......K...........K......",
  "...LBbBbBbBbBbBbBbBbBL...",
  "...LLLLLLLLLLLLLLLLLLL...",
];

const mushroomHouse = [
  ".......LLLLLL.......",
  ".....LLRRRRRRLL.....",
  "....LRRwwRRRRRRL....",
  "...LRRwwwwRRRwwRL...",
  "..LRRRwwRRRRRwwwRL..",
  ".LRRRRRRRRRRRRRRRRL.",
  ".LRwwRRRRRwwRRRRRRL.",
  "LRRwwRRRRRRRRRRwwRRL",
  "LrrrrrrrrrrrrrrrrrrL",
  ".LLLLLLLLLLLLLLLLLL.",
  "....LccccccccccL....",
  "....LcBBccccBBcL....",
  "....LcBBccccBBcL....",
  "....LccccLLccccL....",
  "....LcccLDDLcccL....",
  "....LcccLDDLcccL....",
  "....LcccLDYLcccL....",
  "....LcccLDDLcccL....",
  "...LLLLLLLLLLLLLL...",
  "..GGgGG........GgGG.",
];

const cafe = [
  ".LLLLLLLLLLLLLLLLLLLLLL.",
  ".LbbbbbbbbbbbbbbbbbbbbL.",
  ".LbbbbbLwwwwwwwwLbbbbbL.",
  ".LbbbbbLwKwKKwKwLbbbbbL.",
  ".LbbbbbLLLLLLLLLLbbbbbL.",
  "LLLLLLLLLLLLLLLLLLLLLLLL",
  "LRRwwRRwwRRwwRRwwRRwwRRL",
  "LRRwwRRwwRRwwRRwwRRwwRRL",
  ".RRwwRRwwRRwwRRwwRRwwRR.",
  ".rr..rr..rr..rr..rr..rr.",
  ".LwwwwwwwwwwwwwwwwwwwwL.",
  ".LwBBBBBBwLLLLwBBBBBBwL.",
  ".LwBvBBBBwLDDLwBvBBBBwL.",
  ".LwBBBBBBwLDDLwBBBBBBwL.",
  ".LwLLLLLLwLDYLwLLLLLLwL.",
  ".LwGPGGPGwLDDLwGPGGPGwL.",
  ".LwwwwwwwwLDDLwwwwwwwwL.",
  "LLLLLLLLLLLLLLLLLLLLLLLL",
];

const hanok = [
  "........LLLLLLLLLLLL........",
  "......LLGGGGGGGGGGGGLL......",
  "....LLGGGGGGGGGGGGGGGGLL....",
  "L.LLGGGGGGGGGGGGGGGGGGGGLL.L",
  "LLggggggggggggggggggggggggLL",
  ".LLLLLLLLLLLLLLLLLLLLLLLLLL.",
  "...LbwwwwbDDDDDDDDbwwwwbL...",
  "...LbwDDwbDdDdDdDdbwDDwbL...",
  "...LbwDDwbDdDdDdDdbwDDwbL...",
  "...LbwwwwbDDDDDDDDbwwwwbL...",
  "...LbwwwwbDdDdDdDdbwwwwbL...",
  "...LbbbbbbDDDDDDDDbbbbbbL...",
  "..LLLLLLLLLLLLLLLLLLLLLLLL..",
  "..LssssssssssssssssssssssL..",
  "..LsSsssSsssSsssSsssSsssL...",
  "..LLLLLLLLLLLLLLLLLLLLLLLL..",
];

const treeHouse = [
  ".......LLLLLLLL.......",
  ".....LLGGGGGGGGLL.....",
  "...LLGGGgGGGGGGGGLL...",
  "..LGGGGGGGGGgGGGGGGL..",
  ".LGGgGGGGGGGGGGGGgGGL.",
  ".LGGGGGGLLLLLLGGGGGGL.",
  "LGGGGGGLRRRRRRLGGGGGGL",
  "LGgGGGLRRRRRRRRLGGgGGL",
  "LGGGGLRRRRRRRRRRLGGGGL",
  ".LGGGLLLLLLLLLLLLGGGL.",
  ".LGGGGLwwwwwwwwLGGGGL.",
  "..LGGGLwBBwwDDwLGGGL..",
  "...LLGLwBBwwDDwLGLL...",
  ".....LLLLLLLLLLLL.....",
  "........LTTTTL.yyy....",
  "........LTtTTL.y.y....",
  "........LTTTTL.yyy....",
  "........LTTtTL.y.y....",
  "........LTTTTL.yyy....",
  "........LTtTTL.y.y....",
  "........LTTTTL.yyy....",
  "........LTTTtL.y.y....",
  ".......LTTTTTTLyyy....",
  "......LTTLTTLTTL......",
  ".....GGgGGGGGGgGG.....",
];

export const LANDMARKS: LandmarkDef[] = [
  {
    id: "windmill",
    name: "풍차",
    sprite: {
      w: 21,
      h: 24,
      palette: { L: OUT, R: "#d9614f", w: "#f6ead2", B: "#7cc4ff", D: "#8a5a3c", b: "#7a5236", s: "#fffaf0", K: OUT },
      frames: [overlay(windmillBase, windmillPlus), overlay(windmillBase, windmillX)],
    },
  },
  {
    id: "lighthouse",
    name: "등대",
    sprite: {
      w: 18,
      h: 24,
      palette: { L: OUT, R: "#e8584f", w: "#fffaf0", Y: "#ffe066", y: "#c9b25a", K: "#3a3f58", D: "#8a5a3c", s: "#b8b0a8", S: "#8e867e", Z: "#fff3a0aa" },
      frames: [
        edit(lighthouse, [
          [4, 0, "ZZZZZ"],
          [4, 13, "ZZZZZ"],
          [5, 1, "ZZZZ"],
          [5, 13, "ZZZZ"],
        ]),
        edit(lighthouse, [
          [4, 6, "yy"],
          [4, 10, "yy"],
          [5, 6, "yy"],
          [5, 10, "yy"],
        ]),
      ],
    },
  },
  {
    id: "castle",
    name: "작은 성",
    sprite: {
      w: 26,
      h: 20,
      palette: { L: OUT, s: "#ece6f2", B: "#5b7bd6", K: "#3a3f58", D: "#8a5a3c", Y: "#ffd23f", R: "#ff5a6a" },
      frames: [castle],
    },
  },
  {
    id: "cottage",
    name: "빨간 지붕 집",
    sprite: {
      w: 22,
      h: 16,
      palette: { L: OUT, R: "#e8584f", r: "#b8413a", w: "#fff4e0", B: "#8fd3ff", v: "#e6f7ff", D: "#8a5a3c", Y: "#ffd23f", c: "#b07a5a", G: "#5fb85a", P: "#ff8fb1" },
      frames: [cottage],
    },
  },
  {
    id: "camp-tent",
    name: "캠핑 텐트",
    sprite: {
      w: 24,
      h: 14,
      palette: { L: OUT, T: "#ff9a3c", t: "#d9742a", K: "#4a3a3a", R: "#ff5a5a", F: "#ffe066", Y: "#fff6c8", b: "#8a5a3c" },
      frames: tent,
    },
  },
  {
    id: "observatory",
    name: "천문대",
    sprite: {
      w: 22,
      h: 16,
      palette: { L: OUT, g: "#c9d3e3", w: "#ffffff", K: "#3a3f58", s: "#f0e6d6", D: "#8a5a3c", T: "#8e9bb0" },
      frames: [observatory],
    },
  },
  {
    id: "hot-spring",
    name: "온천 오두막",
    sprite: {
      w: 22,
      h: 22,
      palette: {
        L: OUT,
        b: "#6b5a8a",
        B: "#4a3e6a",
        w: "#fff4e0",
        K: "#3a3040",
        N: "#3f5fb0",
        Z: "#ffffff",
        s: "#b8b0a8",
        A: "#7fd3e8",
        a: "#c4f0fa",
        v: "#ffffffbb",
      },
      frames: hotSpring,
    },
  },
  {
    id: "ferris-wheel",
    name: "관람차",
    sprite: {
      w: 25,
      h: 26,
      palette: { L: OUT, g: "#c9d3e3", K: "#8e9bb0", Y: "#ffd23f", R: "#ff6b6b", B: "#5ac8ff", G: "#5fd068", P: "#ff8fc8", b: "#e8e2d6" },
      frames: [ferrisWheel],
    },
  },
  {
    id: "mushroom-house",
    name: "버섯 집",
    sprite: {
      w: 20,
      h: 20,
      palette: { L: OUT, R: "#e8443a", r: "#b8302a", w: "#ffffff", c: "#fff1d6", B: "#8fd3ff", D: "#a0663f", Y: "#ffd23f", G: "#5fb85a", g: "#3f9a42" },
      frames: [mushroomHouse],
    },
  },
  {
    id: "cafe",
    name: "골목 카페",
    sprite: {
      w: 24,
      h: 18,
      palette: { L: OUT, b: "#8a5a3c", w: "#fff4e0", K: "#4a3428", R: "#3fae7a", r: "#2f8a5f", B: "#8fd3ff", v: "#e6f7ff", D: "#a0663f", Y: "#ffd23f", G: "#5fb85a", P: "#ff8fb1" },
      frames: [cafe],
    },
  },
  {
    id: "hanok",
    name: "한옥",
    sprite: {
      w: 28,
      h: 16,
      palette: { L: OUT, G: "#5a6478", g: "#3e4658", b: "#8a5a3c", w: "#f6efe0", D: "#f0dfb8", d: "#b08a5a", s: "#c8c0b4", S: "#9a928a" },
      frames: [hanok],
    },
  },
  {
    id: "tree-house",
    name: "나무 위 오두막",
    sprite: {
      w: 22,
      h: 25,
      palette: { L: OUT, G: "#5fb85a", g: "#3f9a42", R: "#e8584f", w: "#fff4e0", B: "#8fd3ff", D: "#8a5a3c", T: "#a0663f", t: "#7a4a2a", y: "#d9b26a" },
      frames: [treeHouse],
    },
  },
];
