/* 회사 일정 달력(/schedule) 화면 검사. 개발 서버를 띄운 뒤 node scripts/test-company-schedule.mjs [주소].
   /api/schedule 과 /api/schedule/page 를 가짜(메모리)로 바꿔 끼워서 노션은 건드리지 않는다. 로그인도 가짜 토큰으로 넘긴다.
   달력(시간순 자동 정렬, 같은 날 끌어서 순서 바꾸기, 만들기, 날짜 옮기기, 휴지통과 되돌리기, 필터, 검색, 주 넘기기)과
   일정 창(제목, 날짜, 담당자, 장소, 댓글, 본문 고치기: Enter, 줄 앞 단축키, 굵게, 링크 붙여넣기, Backspace)을 차례로 눌러 본다. */
import { chromium } from "file:///C:/Users/hjyeo/AppData/Roaming/npm/node_modules/playwright/index.mjs";

const BASE = process.argv[2] || "http://localhost:3218";
const kst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const add = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const TODAY = kst();
const SUN = add(TODAY, -new Date(`${TODAY}T00:00:00Z`).getUTCDay());
const D = (n) => add(SUN, n);
const KIM = { id: "11111111-1111-1111-1111-111111111111", name: "김호준" };
const KWON = { id: "22222222-2222-2222-2222-222222222222", name: "권혁찬" };

let seq = 0;
const uid = () => `00000000-0000-0000-0000-${String(++seq).padStart(12, "0")}`;
const ev = (n, title, extra = {}) => {
  const who = extra.who ?? [];
  return { id: uid(), title, start: D(n), end: null, time: "", place: "", who, people: who.map((p) => p.name), order: null, url: "https://www.notion.so/x", extra: [], ...extra };
};
const db = [
  ev(1, "콩시어지 미팅(비대면) 10:00"),
  ev(2, "(주)옆문 15:00"),
  ev(2, "에이트명동1번가약국 촬영 09:00", { order: 1, who: [KIM] }),
  ev(2, "서민지 원장님 미팅(양재) 11:00", { order: 2, who: [KWON] }),
  ev(3, "OWM 분당 촬영 10:30", { order: 2 }),
  ev(3, "바로팜 미팅 10:00", { order: 1 }),
  ev(5, "김제조 미팅(사당) 10:30", { who: [KWON] }),
  ev(12, "전종열 약사님 촬영일"),
  ev(11, "촬영 준비물 챙기기"),
  ev(11, "김제조 회의 (오후 1시) 양재"),
  ev(11, "아침 미팅 09:30"),
  ev(11, "점심 약속", { time: "12:00" }),
];
const owm = db.find((e) => e.title.startsWith("OWM"));
const BULLET = uid();
const bodies = { [owm.id]: [{ id: BULLET, type: "bulleted_list_item", segs: [{ t: "준비물", b: true }, { t: ": 노트북 or 아이패드 필요 (소품용)" }], editable: true }] };
const calls = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => { localStorage.setItem("attendance.token", "test-token"); localStorage.removeItem("company-schedule-view"); });
await page.route("**/api/schedule**", async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const body = req.postData() ? JSON.parse(req.postData()) : {};
  calls.push({ method: req.method(), path: url.pathname, body });
  const json = (o, s = 200) => route.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(o) });
  if (url.pathname.endsWith("/page")) {
    if (req.method() === "GET") {
      const e = db.find((x) => x.id === url.searchParams.get("id"));
      return json({ event: e, blocks: bodies[e.id] ?? [], comments: [], people: [KIM, KWON] });
    }
    if (body.action === "comment") return json({ comment: { id: uid(), at: new Date().toISOString(), who: "업무 시스템", segs: [{ t: body.text }] } });
    const refs = {};
    for (const op of body.ops ?? body.blocks ?? []) {
      if (op.ref) refs[op.ref] = uid();
      for (const b of op.blocks ?? []) refs[b.ref] = uid();
    }
    return json({ refs });
  }
  if (req.method() === "GET") {
    const from = url.searchParams.get("from"), to = url.searchParams.get("to");
    return json({ from, to, events: db.filter((e) => !e.archived && (e.end ?? e.start) >= from && e.start <= to) });
  }
  if (req.method() === "POST") {
    const e = ev(0, body.title, { start: body.date, end: body.end, place: body.place || "", order: body.order ?? null });
    db.push(e);
    return json({ event: e });
  }
  const e = db.find((x) => x.id === body.id);
  if (!e) return json({ error: "없음" }, 400);
  if (req.method() === "DELETE") { e.archived = true; return json({ ok: true }); }
  if (body.restore) { e.archived = false; return json({ event: e }); }
  if (body.title !== undefined) e.title = body.title;
  if (body.date !== undefined) { e.start = body.date; e.end = body.end ?? null; }
  if (body.place !== undefined) e.place = body.place;
  if (body.order !== undefined) e.order = body.order;
  if (body.people !== undefined) { e.who = [KIM, KWON].filter((p) => body.people.includes(p.id)); e.people = e.who.map((p) => p.name); }
  return json({ event: e });
});

await page.goto(`${BASE}/schedule`, { waitUntil: "networkidle" });
await page.waitForSelector(".cs-card");
const ok = (name, cond) => console.log((cond ? "통과 " : "실패 ") + name);
const day = (d) => page.locator(`.cs-day[data-d="${d}"]`);
const titles = async (d) => day(d).locator(".cs-ct").allInnerTexts();
const wait = (ms) => page.waitForTimeout(ms);
const lastBody = () => [...calls].reverse().find((c) => c.path.endsWith("/page") && c.body.action === "body");
const close = async () => { await page.locator(".pk-top .pk-ic").first().click(); await wait(400); };

ok("2주 14칸", (await page.locator(".cs-day").count()) === 14);
ok("시간순 (제목 속 시각도 읽음)", (await titles(D(2))).join("|") === "에이트명동1번가약국 촬영 09:00|서민지 원장님 미팅(양재) 11:00|(주)옆문 15:00");
ok("시간순 (오후 1시, 날짜 시각, 시각 없는 것은 뒤로)", (await titles(D(11))).join("|") === "아침 미팅 09:30|점심 약속 12:00|김제조 회의 (오후 1시) 양재|촬영 준비물 챙기기");
ok("+ 기호가 상자 가운데", await page.evaluate(() => {
  const b = document.querySelector(".cs-plus"), i = b.querySelector("svg");
  const r1 = b.getBoundingClientRect(), r2 = i.getBoundingClientRect();
  return Math.abs((r1.top + r1.height / 2) - (r2.top + r2.height / 2)) < 0.6 && Math.abs((r1.left + r1.width / 2) - (r2.left + r2.width / 2)) < 0.6;
}));

/* 같은 날 안에서 끌어 순서 바꾸기: (주)옆문을 맨 위(에이트 위)로 */
const n0 = calls.length;
const target = day(D(2)).locator(".cs-card", { hasText: "에이트" });
const tb = await target.boundingBox();
await day(D(2)).locator(".cs-card", { hasText: "옆문" }).dragTo(target, { targetPosition: { x: tb.width / 2, y: 4 } });
await wait(600);
const orderCalls = calls.slice(n0).filter((c) => c.method === "PATCH" && c.body.order !== undefined);
ok("끌어서 같은 날 순서 바꾸기", (await titles(D(2))).join("|") === "(주)옆문 15:00|에이트명동1번가약국 촬영 09:00|서민지 원장님 미팅(양재) 11:00");
ok("바꾼 순서는 정렬시간으로 노션에 저장", orderCalls.length === 3 && orderCalls.every((c) => [1, 2, 3].includes(c.body.order)) && !calls.slice(n0).some((c) => c.body.date));
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".cs-card");
ok("다시 열어도 바꾼 순서", (await titles(D(2))).join("|") === "(주)옆문 15:00|에이트명동1번가약국 촬영 09:00|서민지 원장님 미팅(양재) 11:00");
ok("일요일 빨강, 토요일 파랑", (await day(D(0)).getAttribute("class")).includes("is-red") && (await day(D(6)).getAttribute("class")).includes("is-sat"));
ok("공휴일은 빨간 날과 이름", await page.evaluate(() => [...document.querySelectorAll(".cs-day")].every((c) => !c.querySelector(".cs-hol") || c.classList.contains("is-red"))));
ok("오늘 표시", (await page.locator(`.cs-day.is-today[data-d="${TODAY}"]`).count()) === 1);

/* 일정 창: 노션처럼 본문까지 */
await day(D(3)).locator(".cs-card", { hasText: "OWM" }).click();
await page.waitForSelector(".pk .pb");
ok("창에 큰 제목", (await page.locator(".pk-title").inputValue()) === "OWM 분당 촬영 10:30");
ok("속성 줄 (날짜, 담당자, 장소, 정렬시간, 속성 추가)", ["날짜", "담당자", "장소", "정렬시간", "속성 추가"].every((n) => true) && (await page.locator(".pk-name").allInnerTexts()).join("|").replace(/\s/g, "") === "날짜|담당자|장소|정렬시간|속성추가");
ok("댓글 자리", (await page.locator(".pk-cm-new input").count()) === 1);
ok("본문 글머리표와 굵게", (await page.locator(".pk .pb.t-bulleted_list_item b").innerText()) === "준비물");

const rt0 = page.locator(".pk .pb").first().locator(".pb-rt");
await rt0.click();
await page.keyboard.press("End");
await page.keyboard.press("Enter");
await page.keyboard.type("충전기");
await wait(1700);
let op = lastBody();
ok("Enter 로 새 글머리표 (노션에 insert)", op && op.body.ops[0].op === "insert" && op.body.ops[0].after === BULLET && op.body.ops[0].blocks[0].type === "bulleted_list_item" && op.body.ops[0].blocks[0].segs[0].t === "충전기");

await page.keyboard.press("Enter");
await page.keyboard.press("Enter");
await page.keyboard.type("[] 삼각대 챙기기");
await wait(1700);
op = lastBody();
const todo = op?.body.ops.find((o) => o.op === "insert")?.blocks?.[0];
ok("빈 글머리표에서 Enter 두 번 = 문단, [] = 할 일", todo && todo.type === "to_do" && todo.segs[0].t === "삼각대 챙기기");

await page.locator(".pk .pb.t-to_do .pb-chk").check();
await wait(1700);
op = lastBody();
ok("할 일 체크 저장", op.body.ops.some((o) => o.op === "update" && o.type === "to_do" && o.checked === true));

await page.keyboard.press("Enter");
await page.keyboard.press("Enter");
await page.keyboard.type("## 촬영 순서");
await wait(1700);
op = lastBody();
ok("## = 제목 2", op.body.ops.some((o) => o.op === "insert" && o.blocks[0].type === "heading_2" && o.blocks[0].segs[0].t === "촬영 순서"));

await page.keyboard.press("Enter");
await page.keyboard.type("자료 ");
await page.evaluate(() => {
  const dt = new DataTransfer();
  dt.setData("text/plain", "https://example.com/guide");
  document.activeElement.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
});
await page.keyboard.type(" 노션 ");
await page.evaluate(() => {
  const dt = new DataTransfer();
  dt.setData("text/plain", "https://www.notion.so/wellnessbox/1533b1f9b9ae80bfb0f0fca55a269a0d");
  document.activeElement.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
});
await wait(1700);
op = lastBody();
const linkBlock = op.body.ops.find((o) => o.op === "insert")?.blocks?.[0];
ok("주소 붙여넣기 = 링크", linkBlock && linkBlock.segs.some((s) => s.href === "https://example.com/guide"));
ok("노션 주소 붙여넣기 = 페이지 멘션", linkBlock && linkBlock.segs.some((s) => s.raw?.mention?.page?.id === "1533b1f9-b9ae-80bf-b0f0-fca55a269a0d"));

/* 굵게: 첫 블록의 "노트북" 을 골라 Ctrl+B */
await page.evaluate(() => {
  const rt = document.querySelector(".pk .pb .pb-rt");
  const walker = document.createTreeWalker(rt, NodeFilter.SHOW_TEXT);
  let n; while ((n = walker.nextNode())) { const i = n.textContent.indexOf("노트북"); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 3); const s = getSelection(); s.removeAllRanges(); s.addRange(r); rt.focus(); break; } }
});
await page.keyboard.press("Control+b");
await wait(1700);
op = lastBody();
ok("Ctrl+B 굵게 저장", op.body.ops.some((o) => o.op === "update" && o.id === BULLET && o.segs.some((s) => s.b && s.t === "노트북")));

/* Backspace: 글머리표 맨 앞에서 누르면 문단으로 (노션 replace) */
const second = page.locator(".pk .pb").nth(1).locator(".pb-rt");
await second.click();
await page.keyboard.press("Home");
await page.keyboard.press("Backspace");
await wait(1700);
op = lastBody();
ok("글머리표 맨 앞 Backspace = 문단", op.body.ops.some((o) => o.op === "replace" && o.type === "paragraph"));

await page.locator(".pk-cm-new input").fill("준비물 다시 확인 부탁드려요");
await page.locator(".pk-cm-new input").press("Enter");
await wait(400);
ok("댓글 남기기", calls.some((c) => c.body.action === "comment") && (await page.locator(".pk-cm b").count()) === 1);

await page.locator(".pk-chips").click();
await page.locator(".pk-pop label", { hasText: "김호준" }).locator("input").check();
await wait(500);
ok("담당자 넣기", calls.some((c) => c.method === "PATCH" && Array.isArray(c.body.people) && c.body.people.includes(KIM.id)));

await page.locator(".pk-title").fill("OWM 분당 촬영 10:30 (확정)");
await wait(1200);
ok("제목 고치기 = 노션에 바로", calls.some((c) => c.method === "PATCH" && c.body.title === "OWM 분당 촬영 10:30 (확정)"));
await close();
ok("창 닫으면 달력에 반영", (await titles(D(3))).some((t) => t.includes("(확정)")));

/* 새로 만들기 */
await day(D(4)).hover();
await day(D(4)).locator(".cs-plus").click();
await page.locator(".pk-title").fill("시험 미팅 16:00");
await wait(1500);
ok("칸의 + 로 만들기 (제목 적으면 노션에 생김)", calls.some((c) => c.method === "POST" && c.path === "/api/schedule" && c.body.date === D(4)));
await page.locator(".pk-row").nth(2).locator("input").fill("사무실");
await wait(1200);
ok("장소 고치기", calls.some((c) => c.method === "PATCH" && c.body.place === "사무실"));
await close();
ok("새 일정이 달력에", (await titles(D(4))).includes("시험 미팅 16:00"));

await page.locator(".cs-new").click();
await page.locator(".pk-row").first().locator(".pk-val").click();
await page.locator('.pk-date input[type="date"]').first().fill(D(10));
await page.locator(".pk-title").fill("새로 만들기 버튼 일정");
await wait(1500);
await close();
ok("새로 만들기 버튼 (날짜 골라서)", (await titles(D(10))).includes("새로 만들기 버튼 일정"));

await day(D(3)).locator(".cs-card", { hasText: "바로팜" }).dragTo(day(D(9)));
await wait(300);
ok("끌어서 날짜 옮기기", (await titles(D(9))).some((t) => t.includes("바로팜")));

await day(D(5)).locator(".cs-card").first().click();
await page.locator(".pk-del").click();
await wait(300);
ok("휴지통", (await titles(D(5))).length === 0 && (await page.locator(".pk").count()) === 0);
await page.locator(".cs-toast button").click();
await wait(300);
ok("되돌리기", (await titles(D(5))).length === 1);

await page.locator(".cs-search .cs-ic").click();
await page.locator(".cs-search input").fill("촬영");
await wait(200);
const shown = await page.locator(".cs-ct").allInnerTexts();
ok("검색", shown.length === 4 && shown.every((t) => t.includes("촬영")));
await page.locator(".cs-search input").fill("");

await page.locator(".cs-ic-menu").first().click();
await page.locator(".cs-menu label", { hasText: "권혁찬" }).locator("input").uncheck();
await wait(200);
const noKwon = await page.locator(".cs-ct").allInnerTexts();
ok("필터 (담당자)", !noKwon.some((t) => t.includes("서민지") || t.includes("김제조 미팅")) && noKwon.some((t) => t.includes("에이트")));
await page.locator(".cs-mbtn").click();
await page.keyboard.press("Escape");

await page.locator(".cs-arrow").nth(1).click();
await wait(400);
ok("다음 주로", (await page.locator(`.cs-day[data-d="${D(7)}"]`).count()) === 1 && (await page.locator(`.cs-day[data-d="${D(0)}"]`).count()) === 0);
await page.getByRole("button", { name: "오늘", exact: true }).click();
await wait(400);
ok("오늘로", (await page.locator(`.cs-day[data-d="${D(0)}"]`).count()) === 1);

await day(D(3)).locator(".cs-card", { hasText: "OWM" }).click();
await page.waitForSelector(".pk .pb");
await page.screenshot({ path: process.env.SHOT || `${process.env.TEMP || "."}/company-schedule.png` });
console.log(errors.length ? errors.join("\n") : "오류 없음");
await browser.close();
