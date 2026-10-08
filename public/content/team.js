/* 콘텐츠 팀 배치와 10월 촬영 260929. 원장은 노션 "업무 분배_260929".
   촬영은 주차만 정하고 요일은 정하지 않는다 (사용자 260929).
   고칠 곳: PEOPLE, TEAMS, ACCOUNTS, OCT_WEEKS, OCT_SHOOTS, CYCLE, RUNWAY, CHECKS. */

const PEOPLE = {
  kim:  { name: "김호준 PD님", short: "김호준 PD님", role: "1팀 PD", color: "#1e62a8" },
  song: { name: "송아영 PD님", short: "송아영 PD님", role: "3팀 PD, 10/1 입사", color: "#0f7d6c" },
  newb: { name: "권현우 PD님", short: "권현우 PD님", role: "2팀 PD", color: "#b8620e" },
  lee:  { name: "이민우님", short: "이민우님", role: "보조, 약국 계정 운영 (12월까지)", color: "#7b4bb0" },
};

const TEAMS = [
  { id: "t1", name: "1팀", pd: "kim",  editor: "고명진님", color: "#1e62a8", soft: "#e3edf8" },
  { id: "t2", name: "2팀", pd: "newb", editor: "윤민유님", color: "#0f7d6c", soft: "#dff2ee" },
  { id: "t3", name: "3팀", pd: "song", editor: "윤민유님", color: "#b8620e", soft: "#f8ecdd" },
  { id: "ph", name: "약국 계정", pd: "lee", editor: "조하늘님", color: "#7b4bb0", soft: "#efe6f8" },
];

const ACCOUNTS = {
  jejo:   { ig: "kimjejo_pharma", name: "김제조 약사님", short: "김제조 약사님", sub: "김주성 대표님, kimjejo_pharma", team: "t1", weekly: 5,
            cycle: "2주 1회 10~15편", place: "사내", note: "김제조 OS에 자료 올림" },
  oyak:   { ig: "oyakstory", name: "오주헌 약사님", short: "오주헌 약사님", sub: "oyakstory", team: "t3", weekly: 5,
            cycle: "2주 1회 10편", place: "사내", note: "유튜브, 틱톡 미러링" },
  minji:  { name: "서민지 약사님", short: "서민지 약사님", sub: "인천 약국장, 새 계정", team: "t1", weekly: 5, isNew: true,
            cycle: "4주 1회 20편 (미정)", place: "사내", assist: "lee", note: "보조는 당분간 붙이고 나중에 뺌, 가끔 인천 약국 방문" },
  jay:    { ig: "kpharm.jay", name: "제이약사님", short: "제이약사님", sub: "kpharm.jay, 영어", team: "t2", weekly: 5,
            cycle: "2주 1회 10편", place: "사내", note: "영어 대본" },
  owmb:   { name: "OWM 분당 약국장님", short: "OWM 분당 약국장님", sub: "크리투스 협업, 영어, 새 계정", team: "t1", weekly: 5, isNew: true,
            cycle: "2주 1회 10편", place: "분당 약국", ext: true, assist: "lee", note: "기획 20편 중 14편은 크리투스" },
  owmm:   { name: "OWM 명동 약국장님", short: "OWM 명동 약국장님", sub: "크리투스 협업, 영어, 새 계정, 시작 대기", team: "t1", weekly: 5, isNew: true,
            cycle: "2주 1회 10편", place: "명동 약국", ext: true, assist: "lee", note: "기획 20편 중 14편은 크리투스" },
  jessi:  { ig: "jessi_yaksa", name: "제씨약사님", short: "제씨약사님", sub: "jessi_yaksa", team: "t3", weekly: 2,
            cycle: "월 1회 8편", place: "사내", note: "주 2편으로 줄임, 유튜브, 틱톡 미러링" },
  taeeun: { name: "김태은 원장님", short: "김태은 원장님", sub: "의사, 새 계정", team: "t2", weekly: 5, isNew: true,
            cycle: "월 1회 20편", place: "춘천", ext: true, assist: "lee", note: "첫 회(9/29)만 사무실, 다음부터 춘천" },
  pure:   { name: "퓨어약국 약사님", short: "퓨어약국 약사님", sub: "진행 예정, 3팀이 안정되면", team: "t2", weekly: 5, isNew: true, afterOnly: true,
            cycle: "2주 1회 10편", place: "장소 미정", note: "편집은 엄성미님", editor: "엄성미님" },
  around: { ig: "aroundpharm_official", name: "어라운드팜", short: "어라운드팜", sub: "약국 계정, 4개 언어", team: "ph", weekly: 3, shooter: "newb", shooterAfter: "kim",
            cycle: "2주 1회", place: "외부 약국", ext: true, assist: "lee", note: "매번 다른 약국, 섭외는 이민우님" },
  mimi:   { ig: "mimipharm_official", name: "미미팜", short: "미미팜", sub: "약국 계정, 4개 언어", team: "ph", weekly: 2, shooter: "newb", shooterAfter: "song",
            cycle: "당분간 촬영 없음", place: "미미팜 매장", ext: true, assist: "lee", note: "제품 딥다이브로 버팀" },
};

const ACC_SHADE = {
  jejo: "#1e62a8", oyak: "#4a8fd6", minji: "#98c0ea",
  jay: "#0f7d6c", owmb: "#3aa894", owmm: "#8fd3c5",
  jessi: "#b8620e", taeeun: "#e3a15a", pure: "#f0c898",
  around: "#7b4bb0", mimi: "#b894dc",
};

const OCT_WEEKS = [
  { w: 1, start: "2026-09-28", label: "1주", range: "9/28 ~ 10/4", notes: ["10/1 송아영 PD님 입사", "10/3 개천절"] },
  { w: 2, start: "2026-10-05", label: "2주", range: "10/5 ~ 10/11", notes: ["10/9 한글날", "촬영 적게 (휴일 주)"] },
  { w: 3, start: "2026-10-12", label: "3주", range: "10/12 ~ 10/18", notes: ["반복 4주의 1주 시작"] },
  { w: 4, start: "2026-10-19", label: "4주", range: "10/19 ~ 10/25", notes: ["OWM 분당 약국장님, 김태은 원장님 업로드 시작"] },
  { w: 5, start: "2026-10-26", label: "5주", range: "10/26 ~ 11/1", notes: ["11/2 OWM 명동 약국장님, 서민지 약사님 업로드 시작", "퓨어약국 약사님은 3팀이 안정되면 반복 4주의 2주, 4주에 첫 촬영"] },
];

/* status: done 끝남, booked 노션에 잡힘, prop 새로 넣음. when 은 이미 잡힌 날짜만 적는다.
   temp: 3팀 PD 오기 전이라 김호준 PD님이 대신 찍음. with: 동행 */
const OCT_SHOOTS = [
  { w: 1, acc: "taeeun", n: 20, status: "done", when: "9/29 사무실", placeNow: "사무실" },
  { w: 1, acc: "oyak",   n: 10, status: "booked", when: "9/30 19:30" },
  { w: 1, acc: "jejo",   n: 15, status: "booked", when: "10/2 16:00" },
  { w: 1, acc: "jay",    n: 10, status: "prop", why: "업로드가 10/14에 끝나서 이번 주 안에" },
  { w: 2, acc: "around", status: "booked", when: "명동에이트약국, 날짜 미정", temp: true },
  { w: 2, acc: "owmb",   n: 10, status: "prop", with: "kim", why: "송아영 PD님 첫 외근, 김호준 PD님 동행" },
  { w: 3, acc: "oyak",   n: 10, status: "prop" },
  { w: 3, acc: "minji",  n: 20, status: "prop", why: "10/2 미팅 뒤 첫 촬영" },
  { w: 3, acc: "jay",    n: 10, status: "prop" },
  { w: 3, acc: "owmm",   n: 10, status: "prop", why: "첫 촬영" },
  { w: 4, acc: "jejo",   n: 10, status: "prop" },
  { w: 4, acc: "owmb",   n: 10, status: "prop" },
  { w: 4, acc: "around", status: "prop", temp: true },
  { w: 5, acc: "oyak",   n: 10, status: "prop" },
  { w: 5, acc: "jay",    n: 10, status: "prop" },
  { w: 5, acc: "owmm",   n: 10, status: "prop" },
  { w: 5, acc: "taeeun", n: 20, status: "prop", temp: true, why: "첫 춘천 촬영" },
];

/* 10월 3주차부터 도는 4주. 퓨어 전과 후가 같은 뼈대이고, 퓨어는 2주, 4주에 들어간다 */
const CYCLE = [
  { c: 1, when: "10/12, 11/9, 12/7 주", accs: ["oyak", "minji", "jay", "owmm", "jessi"] },
  { c: 2, when: "10/19, 11/16, 12/14 주", accs: ["jejo", "owmb", "around", "pure"], note: "미미팜 촬영을 다시 하면 이 주에" },
  { c: 3, when: "10/26, 11/23, 12/21 주", accs: ["oyak", "jay", "owmm", "taeeun"] },
  { c: 4, when: "11/2, 11/30, 12/28 주", accs: ["jejo", "owmb", "around", "pure"] },
];

/* 업로드 구간. booked 노션 예정, fill 촬영분으로 채울 구간, gap 빈 날, alt 촬영 없이 버팀 */
const RUNWAY = [
  { acc: "jejo", segs: [
    ["2026-09-28", "2026-10-06", "booked", "0911 촬영분 (노션 예정)"],
    ["2026-10-07", "2026-10-12", "gap", "빈 날 3일 (10/7, 10/8, 10/12)"],
    ["2026-10-13", "2026-11-02", "fill", "1주 촬영 15편"],
    ["2026-11-03", "2026-11-15", "fill", "4주 촬영"] ] },
  { acc: "oyak", segs: [
    ["2026-09-28", "2026-10-01", "booked", "0918 촬영분"],
    ["2026-10-02", "2026-10-02", "gap", "10/2 빈 날"],
    ["2026-10-05", "2026-10-16", "booked", "0918 촬영분 (노션 예정)"],
    ["2026-10-19", "2026-10-30", "fill", "1주 촬영 (9/30)"],
    ["2026-11-02", "2026-11-15", "fill", "3주 촬영"] ] },
  { acc: "minji", segs: [
    ["2026-11-02", "2026-11-15", "fill", "3주 첫 촬영 20편 (가정)"] ] },
  { acc: "jay", segs: [
    ["2026-09-28", "2026-10-14", "booked", "0904, 0918 촬영분 (노션 예정)"],
    ["2026-10-15", "2026-10-28", "fill", "1주 촬영"],
    ["2026-10-29", "2026-11-11", "fill", "3주 촬영"],
    ["2026-11-12", "2026-11-15", "fill", "5주 촬영"] ] },
  { acc: "owmb", segs: [
    ["2026-10-19", "2026-10-30", "fill", "9/21 촬영분"],
    ["2026-11-02", "2026-11-13", "fill", "2주 촬영"] ] },
  { acc: "owmm", segs: [
    ["2026-11-02", "2026-11-15", "fill", "3주 첫 촬영"] ] },
  { acc: "jessi", segs: [
    ["2026-09-28", "2026-10-15", "booked", "노션 예정 (평일 매일로 잡혀 있음)"],
    ["2026-10-20", "2026-11-05", "fill", "남은 편, 화목 주 2편"],
    ["2026-11-10", "2026-11-15", "fill", "11월 촬영 (반복 4주의 4주)"] ] },
  { acc: "taeeun", segs: [
    ["2026-10-19", "2026-11-13", "fill", "9/29 촬영 20편, 계정 개설 뒤"] ] },
  { acc: "around", segs: [
    ["2026-09-28", "2026-10-15", "booked", "노션 예정 (화목토)"],
    ["2026-10-16", "2026-10-21", "gap", "10/17, 10/20 기획안 없음"],
    ["2026-10-22", "2026-10-22", "booked", "제품 소개"],
    ["2026-10-24", "2026-11-06", "fill", "2주 명동에이트약국 촬영"],
    ["2026-11-07", "2026-11-15", "fill", "4주 촬영"] ] },
  { acc: "mimi", segs: [
    ["2026-09-28", "2026-10-06", "booked", "노션 예정 (화목)"],
    ["2026-10-08", "2026-11-15", "alt", "촬영 없이 제품 딥다이브"] ] },
];

const CHECKS = [
  { t: "제이약사님 촬영이 노션에 없습니다", d: "업로드가 10/14에 끝납니다. 이번 주 안에 찍어야 10/15부터 이어집니다." },
  { t: "김제조 약사님 10/7, 10/8, 10/12가 빕니다", d: "냉장고 영양제 2가지(업로드 보류), 멜라토닌(추가 촬영 필요)으로 채울지 정합니다. 멜라토닌 추가 컷은 10/2 촬영 때 찍을 수 있습니다." },
  { t: "오주헌 약사님 10/2가 빕니다", d: "녹화 완료인 다이어트 라면 편으로 채울 수 있습니다." },
  { t: "어라운드팜 10/17, 10/20 기획안이 없습니다", d: "르니브(10/3), ASCE+(10/6) 두 편은 편집 진행도에 업로드 날짜가 안 보입니다. 명동에이트약국 촬영 날짜도 정해야 합니다." },
  { t: "미미팜 딥다이브 편수와 날짜", d: "10/8부터 촬영 없이 제품 딥다이브로 갑니다. 화목 주 2편이면 11월 중순까지 딥다이브 12편 안팎이 필요합니다." },
  { t: "제씨약사님 주 2편 전환일", d: "노션에는 10/15까지 평일 매일로 잡혀 있습니다. 지금 바꾸면 남은 편으로 11월 중순까지 갑니다." },
  { t: "노재영님 주 22편", d: "1팀 15편에 3팀 7편(제씨약사님, 김태은 원장님)이 더해집니다. 9월에는 한 달 40편, 주 10편 안팎이었습니다. 해 보고 밀리면 김태은 원장님 몫을 엄성미님께 나눕니다." },
  { t: "퓨어약국 약사님", d: "들어오면 편집은 엄성미님(주 5편)입니다. 촬영 장소와 시작일을 정해야 합니다." },
  { t: "노재영님에게 몰려 있습니다", d: "9/21 주에 15편을 받았고, 오주헌 약사님 9/29, 9/30 예정 2편이 아직 피드백 중이라 밀릴 수 있습니다." },
  { t: "권현우 PD님이 오기 전 외근", d: "입사 전에 잡힌 어라운드팜, 춘천 촬영은 김호준 PD님이 임시로 갑니다. 권현우 PD님이 오면 입사한 날 넘깁니다. 입사일을 정해야 합니다." },
  { t: "상태를 모르는 편 13~14편", d: "초안이 없는 의뢰 12편, 테스트 편집 3편 등은 노션 편집 진행도에서 한 번 더 확인해야 달력이 맞습니다." },
];

const STEPS = [
  { when: "바로", title: "편집자 옮기기",
    items: ["다음 영상부터 새 PD와 소통하도록 안내만 하면 됨", "제이약사님 → 윤민유님, 제씨약사님과 김태은 원장님 → 노재영님 (권현우 PD님과 소통)"] },
  { when: "10/1", title: "송아영 PD님 입사",
    items: ["입사한 날 제이약사님, OWM 분당 약국장님, OWM 명동 약국장님을 바로 넘겨받음", "첫 OWM 외근(2주)은 김호준 PD님이 같이 감"] },
  { when: "10/7", title: "담당 바꿈 (10/12부터)",
    items: ["2팀 권현우 PD님: 제이약사님 (한국 영상), 김태은 원장님", "3팀 송아영 PD님: 제씨약사님, 오주헌 약사님", "OWM 분당 약국장님 → 김호준 PD님, OWM 명동 약국장님은 시작까지 걸려 김호준 PD님께 두고 대기"] },
  { when: "권현우 PD님 입사일", title: "3팀 출발",
    items: ["입사한 날 제씨약사님, 김태은 원장님, 어라운드팜과 미미팜 촬영을 바로 넘겨받음", "그 뒤 김호준 PD님 외근은 0회"] },
  { when: "10/19, 11/2", title: "새 계정 업로드 시작",
    items: ["10/19: OWM 분당 약국장님(9/21 촬영분), 김태은 원장님(9/29 촬영분)", "11/2: OWM 명동 약국장님, 서민지 약사님(10월 3주 첫 촬영분)"] },
  { when: "3팀 안정 뒤", title: "퓨어약국 약사님 합류 (퓨어 후)",
    items: ["3팀에 퓨어약국 약사님을 넣음. 2주 1회 10편, 반복 4주의 2주와 4주", "어라운드팜 촬영은 김호준 PD님, 미미팜 촬영은 송아영 PD님으로 넘김", "퓨어약국 약사님 편집은 엄성미님 (주 5편). 3팀(권현우 PD님)만 편집자가 두 명"] },
  { when: "12월 말", title: "이민우님 마무리",
    items: ["약국 계정 운영과 외근 보조를 누구에게 넘길지 11월 중에 정함"] },
];

/* ───────── 계산 ───────── */

const teamOf = (id) => TEAMS.find((t) => t.id === id);
const state = { phase: "before" };
const shooterOf = (acc) => {
  const a = ACCOUNTS[acc];
  if (state.phase === "after" && a.shooterAfter) return a.shooterAfter;
  return a.shooter || teamOf(a.team).pd;
};
const edOfAcc = (id) => ACCOUNTS[id].editor || teamOf(ACCOUNTS[id].team).editor;
const edOfTeam = (t) => [...new Set(Object.keys(ACCOUNTS).filter((id) => ACCOUNTS[id].team === t.id && shownAcc(id)).map(edOfAcc))].join(", ");
const shownAcc = (acc) => state.phase === "after" || !ACCOUNTS[acc].afterOnly;
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const accLink = (id, text) => {
  const h = ACCOUNTS[id].ig;
  return h ? `<a class="ig" href="https://www.instagram.com/${h}/" target="_blank" rel="noopener noreferrer" title="인스타 ${h} 새 탭">${text}</a>` : text;
};
const person = (id) => `<span class="who" style="--c:${PEOPLE[id].color}">${PEOPLE[id].name}</span>`;

/* ───────── 01 담당표 ───────── */

function renderRoster() {
  const box = document.getElementById("roster");
  box.innerHTML = "";
  box.appendChild(el("div", "ro-row ro-head",
    "<div>계정</div><div>촬영 주기, 장소</div><div>찍는 사람</div><div>보조</div><div>편집자</div><div>업로드</div>"));
  for (const t of TEAMS) {
    const g = el("div", "ro-group");
    g.style.setProperty("--c", t.color);
    g.style.setProperty("--s", t.soft);
    g.appendChild(el("div", "ro-team",
      `<b>${t.name}</b><span>${PEOPLE[t.pd].name} (${PEOPLE[t.pd].role})</span><span class="ro-link">편집자 ${edOfTeam(t)}</span>`));
    for (const [id, a] of Object.entries(ACCOUNTS).filter(([id, a]) => a.team === t.id && shownAcc(id))) {
      const up = a.team === "ph" ? `릴스 주 ${a.weekly},<br>카드뉴스 주 3` : `주 ${a.weekly}편`;
      g.appendChild(el("div", "ro-row" + (a.isNew ? " is-new" : ""),
        `<div class="ro-acc"><i style="background:${ACC_SHADE[id]}"></i><div><b>${accLink(id, a.name)}</b><small>${a.sub}</small></div></div>` +
        `<div data-l="촬영"><span>${a.cycle}</span><small>${a.place}, ${a.note}</small></div>` +
        `<div data-l="찍는 사람">${person(shooterOf(id))}${a.team === "ph" ? `<small>운영 ${PEOPLE.lee.name}</small>` : ""}</div>` +
        `<div data-l="보조">${a.assist ? person(a.assist) : `<span class="none">없음 (사내)</span>`}</div>` +
        `<div data-l="편집자"><span class="ed">${edOfAcc(id)}</span></div>` +
        `<div data-l="업로드"><span>${up}</span></div>`));
    }
    box.appendChild(g);
  }
}

/* ───────── 02, 04 주차 × 사람 표 ───────── */

const ORDER = ["kim", "song", "newb", "lee"];

function chip(pid, s) {
  const a = ACCOUNTS[s.acc];
  const own = shooterOf(s.acc) === pid;
  const assist = a.assist && !(s.placeNow) ? a.assist : null;
  let role, sub;
  if (own) {
    role = a.ext && !s.placeNow ? "외근 촬영" : "촬영";
    const partners = [];
    if (assist) partners.push(`보조 ${PEOPLE[assist].short}`);
    if (s.with) partners.push(`동행 ${PEOPLE[s.with].short}`);
    sub = `${s.placeNow || a.place}${s.n ? `, ${s.n}편` : ""}${partners.length ? `, ${partners.join(", ")}` : ""}`;
  } else {
    role = s.with === pid ? "동행" : "보조";
    sub = `${s.placeNow || a.place}, 촬영 ${PEOPLE[shooterOf(s.acc)].short}`;
  }
  const c = el("div", `mx-chip ${own ? "own" : "help"} st-${s.status || "cyc"}`);
  c.style.setProperty("--c", PEOPLE[pid].color);
  c.innerHTML = `<div class="mx-top"><b>${accLink(s.acc, a.short)}</b><em>${role}</em></div><small>${sub}</small>` +
    (s.when ? `<div class="mx-when">${s.status === "done" ? "끝남" : "잡힘"} ${s.when}</div>` : "") +
    (s.temp && own ? `<div class="mx-temp">오기 전엔 김호준 PD님</div>` : "") +
    (s.why && own ? `<div class="mx-why">${s.why}</div>` : "");
  return c;
}

function involved(pid, s) {
  const a = ACCOUNTS[s.acc];
  const own = shooterOf(s.acc) === pid;
  const helps = (a.assist === pid && !s.placeNow) || s.with === pid;
  return own || helps;
}

function renderMatrix(boxId, rows) {
  const box = document.getElementById(boxId);
  box.innerHTML = "";
  box.appendChild(el("div", "mx-row mx-head", `<div>주차</div>` + ORDER.map((pid) =>
    `<div style="--c:${PEOPLE[pid].color}"><b>${PEOPLE[pid].name}</b><small>${PEOPLE[pid].role}</small></div>`).join("")));
  for (const r of rows) {
    const row = el("div", "mx-row");
    const total = r.shoots.length;
    const ext = r.shoots.filter((s) => ACCOUNTS[s.acc].ext && !s.placeNow).length;
    row.appendChild(el("div", "mx-wk",
      `<b>${r.label}</b><span>${r.range}</span><em>촬영 ${total}회, 외근 ${ext}회</em>` +
      (r.notes || []).map((n) => `<small>${n}</small>`).join("")));
    for (const pid of ORDER) {
      const cell = el("div", "mx-cell", `<span class="m-only mx-who" style="--c:${PEOPLE[pid].color}">${PEOPLE[pid].name}</span>`);
      const mine = r.shoots.filter((s) => involved(pid, s));
      for (const s of mine) cell.appendChild(chip(pid, s));
      if (!mine.length) cell.appendChild(el("div", "mx-empty", "촬영 없음"));
      row.appendChild(cell);
    }
    box.appendChild(row);
  }
}

function renderOct() {
  renderMatrix("octMatrix", OCT_WEEKS.map((w) => ({ ...w, shoots: OCT_SHOOTS.filter((s) => s.w === w.w) })));
}

function renderCycle() {
  renderMatrix("cycleMatrix", CYCLE.map((c) => ({
    label: `${c.c}주`, range: c.when, notes: c.note ? [c.note] : [],
    shoots: c.accs.filter(shownAcc).map((acc) => ({ acc, n: null })),
  })));

  const rows = ORDER.map((pid) => {
    const p = PEOPLE[pid];
    const accs = Object.entries(ACCOUNTS).filter(([id, a]) => teamOf(a.team).pd === pid && shownAcc(id));
    const reels = accs.reduce((s, [, a]) => s + a.weekly * 4, 0);
    const all = CYCLE.flatMap((c) => c.accs.filter(shownAcc));
    const own = all.filter((acc) => shooterOf(acc) === pid);
    const inN = own.filter((acc) => !ACCOUNTS[acc].ext).length;
    const outN = own.length - inN;
    const helpN = all.filter((acc) => ACCOUNTS[acc].assist === pid).length;
    const helpExt = all.filter((acc) => ACCOUNTS[acc].assist === pid && ACCOUNTS[acc].ext).length;
    const perWeek = CYCLE.map((c) => c.accs.filter(shownAcc).filter((acc) => shooterOf(acc) === pid || ACCOUNTS[acc].assist === pid).length).join(", ");
    return `<tr style="--c:${p.color}"><th>${p.name}</th><td>${accs.map(([, a]) => a.short).join(", ")}</td><td>${reels}편</td><td>${inN}회</td><td>${outN}회</td><td>${helpN}회${helpN !== helpExt ? ` (사내 ${helpN - helpExt})` : ""}</td><td>${perWeek}</td></tr>`;
  }).join("");
  document.getElementById("counts").innerHTML =
    `<h3>사람별 4주 합계</h3><div class="tbl"><table><thead><tr><th>사람</th><th>맡은 계정</th><th>업로드</th><th>사내 촬영</th><th>외근 촬영</th><th>보조로 따라감</th><th>1~4주 촬영 횟수</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="foot">약국 계정 업로드 편수는 운영하는 이민우님에게 셌습니다. 미미팜은 촬영을 다시 할 때까지 빼고 셌습니다.</p>`;
}

/* ───────── 03 업로드 이어짐 ───────── */

const G_START = new Date("2026-09-28T00:00:00");
const G_DAYS = 49; /* 9/28 ~ 11/15 */
const HOLI = ["2026-10-03", "2026-10-09"];
const dayIdx = (iso) => Math.round((new Date(iso + "T00:00:00") - G_START) / 86400000);
const isoOf = (i) => { const d = new Date(G_START); d.setDate(d.getDate() + i); return d; };

function renderGantt() {
  const box = document.getElementById("gantt");
  box.innerHTML = "";
  box.style.setProperty("--days", G_DAYS);

  const head = el("div", "g-row g-head");
  head.appendChild(el("div", "g-name", ""));
  const scale = el("div", "g-track g-scale");
  for (let i = 0; i < G_DAYS; i++) {
    const d = isoOf(i);
    const iso = d.toISOString().slice(0, 10);
    const we = d.getDay() === 0 || d.getDay() === 6;
    const cls = "g-day" + (we ? " we" : "") + (HOLI.includes(iso) ? " holi" : "") + (d.getDay() === 1 ? " mon" : "");
    scale.appendChild(el("div", cls, d.getDay() === 1 || i === 0 ? `${d.getMonth() + 1}/${d.getDate()}` : ""));
  }
  head.appendChild(scale);
  box.appendChild(head);

  const shootMarks = {};
  for (const s of OCT_SHOOTS) {
    (shootMarks[s.acc] ||= []).push({ w: s.w, status: s.status, when: s.when });
  }

  for (const r of RUNWAY) {
    const a = ACCOUNTS[r.acc];
    const row = el("div", "g-row");
    row.appendChild(el("div", "g-name", `<i style="background:${ACC_SHADE[r.acc]}"></i><b>${accLink(r.acc, a.short)}</b>`));
    const track = el("div", "g-track");
    for (let i = 0; i < G_DAYS; i++) {
      const d = isoOf(i);
      const we = d.getDay() === 0 || d.getDay() === 6;
      track.appendChild(el("div", "g-bg" + (we ? " we" : "")));
    }
    for (const [from, to, type, label] of r.segs) {
      const a0 = Math.max(0, dayIdx(from));
      const a1 = Math.min(G_DAYS - 1, dayIdx(to));
      if (a1 < a0) continue;
      const seg = el("div", `g-seg ${type}`, `<span>${label}</span>`);
      seg.style.gridColumn = `${a0 + 1} / ${a1 + 2}`;
      seg.style.setProperty("--c", ACC_SHADE[r.acc]);
      seg.title = `${a.short}: ${from.slice(5).replace("-", "/")} ~ ${to.slice(5).replace("-", "/")} ${label}`;
      track.appendChild(seg);
    }
    for (const m of shootMarks[r.acc] || []) {
      const w = OCT_WEEKS.find((x) => x.w === m.w);
      const start = dayIdx(w.start);
      const mk = el("div", `g-shoot st-${m.status}`, `<span>촬영</span>`);
      mk.style.gridColumn = `${start + 1} / ${start + 8}`;
      mk.title = `${w.label} 촬영${m.when ? ` (${m.when})` : ""}`;
      track.appendChild(mk);
    }
    row.appendChild(track);
    box.appendChild(row);
  }
}

/* ───────── 05 ~ 07 ───────── */

function renderChecks() {
  document.getElementById("checks").innerHTML = CHECKS.map((c) => `<li><b>${c.t}</b><p>${c.d}</p></li>`).join("");
}

function bar(label, segs, max, marks, sub) {
  const total = segs.reduce((s, x) => s + x.v, 0);
  const row = el("div", "bar-row");
  row.appendChild(el("div", "bar-label", `<b>${label}</b><span>${sub(total)}</span>`));
  const track = el("div", "bar-track");
  for (const s of segs) {
    const seg = el("div", "bar-seg", s.v >= max * 0.08 ? s.name : "");
    seg.style.width = (s.v / max) * 100 + "%";
    seg.style.background = s.color;
    seg.title = `${s.name} ${s.v}`;
    track.appendChild(seg);
  }
  for (const m of marks) {
    const mk = el("div", "bar-mark" + (m.cap ? " cap" : ""), `<span>${m.text}</span>`);
    mk.style.left = (m.v / max) * 100 + "%";
    track.appendChild(mk);
  }
  row.appendChild(track);
  return row;
}

function renderBars() {
  const eb = document.getElementById("editorBars");
  eb.innerHTML = "";
  const marks = { "노재영님": [{ v: 16, text: "목표 16" }], "윤민유님": [{ v: 16, text: "목표 16" }],
    "엄성미님": [{ v: 10, text: "10 미만", cap: true }], "조하늘님": [{ v: 10, text: "계약 10", cap: true }] };
  const groups = {};
  for (const [id, a] of Object.entries(ACCOUNTS).filter(([id]) => shownAcc(id))) {
    const ed = edOfAcc(id);
    const g = (groups[ed] ||= { pds: new Set(), segs: [] });
    g.pds.add(PEOPLE[teamOf(a.team).pd].short);
    g.segs.push({ name: a.short, v: a.weekly, color: ACC_SHADE[id] });
  }
  for (const [ed, g] of Object.entries(groups)) {
    eb.appendChild(bar(`${ed} (${[...g.pds].join(", ")})`, g.segs, 25, marks[ed] || [], (n) => `주 ${n}편`));
  }
}

function renderSteps() {
  document.getElementById("steps").innerHTML = STEPS.map((s, i) =>
    `<li><div class="st-no">${i + 1}</div><div class="st-body"><div class="st-when">${s.when}</div><h3>${s.title}</h3><ul>${s.items.map((x) => `<li>${x}</li>`).join("")}</ul></div></li>`
  ).join("");
}

function renderPhase() {
  renderRoster();
  renderCycle();
  renderBars();
}

document.querySelectorAll(".phase-btn").forEach((b) => b.addEventListener("click", () => {
  state.phase = b.dataset.phase;
  document.querySelectorAll(".phase-btn").forEach((x) => x.classList.toggle("is-on", x === b));
  renderPhase();
}));

renderPhase();
renderOct();
renderGantt();
renderChecks();
renderSteps();
