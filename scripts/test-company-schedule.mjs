/* 회사 일정 달력(/schedule) 화면 검사. 개발 서버를 띄운 뒤 node scripts/test-company-schedule.mjs [주소].
   /api/schedule 은 가짜(메모리)로 바꿔 끼워서 노션은 건드리지 않는다. 로그인도 가짜 토큰으로 넘긴다.
   만들기, 고치기, 끌어 옮기기, 휴지통과 되돌리기, 필터, 검색, 정렬, 주 넘기기를 차례로 눌러 본다. */
import { chromium } from "file:///C:/Users/hjyeo/AppData/Roaming/npm/node_modules/playwright/index.mjs";

const BASE = process.argv[2] || "http://localhost:3218";
const kst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const add = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const TODAY = kst();
const SUN = add(TODAY, -new Date(`${TODAY}T00:00:00Z`).getUTCDay());
const D = (n) => add(SUN, n);

let seq = 0;
const ev = (n, title, extra = {}) => ({ id: `00000000-0000-0000-0000-${String(++seq).padStart(12, "0")}`, title, start: D(n), end: null, time: "", place: "", people: [], order: null, url: "https://www.notion.so/x", ...extra });
const db = [
  ev(1, "콩시어지 미팅(비대면) 10:00"),
  ev(2, "(주)옆문 15:00"),
  ev(2, "에이트명동1번가약국 촬영 09:00", { order: 1, people: ["김호준"] }),
  ev(2, "서민지 원장님 미팅(양재) 11:00", { order: 2, people: ["권혁찬"] }),
  ev(3, "바로팜 미팅 10:00", { order: 1 }),
  ev(5, "김제조 미팅(사당) 10:30", { people: ["권혁찬"] }),
  ev(12, "전종열 약사님 촬영일"),
];
const calls = [];

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1100 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => { localStorage.setItem("attendance.token", "test-token"); localStorage.removeItem("company-schedule-view"); });
await page.route("**/api/schedule**", async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const body = req.postData() ? JSON.parse(req.postData()) : {};
  calls.push({ method: req.method(), body });
  const json = (o, s = 200) => route.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(o) });
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
  return json({ event: e });
});

await page.goto(`${BASE}/schedule`, { waitUntil: "networkidle" });
await page.waitForSelector(".cs-card");
const ok = (name, cond) => console.log((cond ? "통과 " : "실패 ") + name);
const day = (d) => page.locator(`.cs-day[data-d="${d}"]`);
const titles = async (d) => day(d).locator(".cs-ct").allInnerTexts();

ok("2주 14칸", (await page.locator(".cs-day").count()) === 14);
ok("일정이 제 날짜에", (await titles(D(1))).join() === "콩시어지 미팅(비대면) 10:00");
ok("정렬시간 순서 (노션과 같음)", (await titles(D(2))).join("|") === "에이트명동1번가약국 촬영 09:00|서민지 원장님 미팅(양재) 11:00|(주)옆문 15:00");
ok("오늘 빨간 표시", (await page.locator(`.cs-day.is-today[data-d="${TODAY}"]`).count()) === 1);
ok("주말 회색", (await day(D(0)).getAttribute("class")).includes("is-off") && (await day(D(6)).getAttribute("class")).includes("is-off"));

await day(D(4)).hover();
await day(D(4)).locator(".cs-plus").click();
await page.locator(".cs-dtitle").fill("시험 미팅 16:00");
await page.locator(".cs-prop input").nth(3).fill("사무실");
await page.locator(".cs-ok").click();
await page.waitForTimeout(300);
ok("칸의 + 로 만들기", calls.some((c) => c.method === "POST" && c.body.date === D(4) && c.body.place === "사무실") && (await titles(D(4))).includes("시험 미팅 16:00"));

await page.locator(".cs-new").click();
await page.locator(".cs-dtitle").fill("새로 만들기 버튼 일정");
await page.locator('.cs-prop input[type="date"]').first().fill(D(10));
await page.locator(".cs-ok").click();
await page.waitForTimeout(300);
ok("새로 만들기 버튼", (await titles(D(10))).includes("새로 만들기 버튼 일정"));

await day(D(1)).locator(".cs-card").first().click();
await page.locator(".cs-dtitle").fill("콩시어지 미팅 고침");
await page.locator(".cs-ok").click();
await page.waitForTimeout(300);
ok("카드 눌러 고치기", calls.some((c) => c.method === "PATCH" && c.body.title === "콩시어지 미팅 고침") && (await titles(D(1))).includes("콩시어지 미팅 고침"));

await day(D(3)).locator(".cs-card", { hasText: "바로팜" }).dragTo(day(D(9)));
await page.waitForTimeout(300);
ok("끌어서 날짜 옮기기", calls.some((c) => c.method === "PATCH" && c.body.date === D(9)) && (await titles(D(9))).some((t) => t.includes("바로팜")));

await day(D(5)).locator(".cs-card").first().click();
await page.locator(".cs-del").click();
await page.waitForTimeout(300);
ok("휴지통", calls.some((c) => c.method === "DELETE") && (await titles(D(5))).length === 0);
await page.locator(".cs-toast button").click();
await page.waitForTimeout(300);
ok("되돌리기", calls.some((c) => c.body.restore === true) && (await titles(D(5))).length === 1);

await page.locator(".cs-search .cs-ic").click();
await page.locator(".cs-search input").fill("촬영");
await page.waitForTimeout(200);
const shown = await page.locator(".cs-ct").allInnerTexts();
ok("검색", shown.length === 2 && shown.every((t) => t.includes("촬영")));
await page.locator(".cs-search input").fill("");

await page.locator(".cs-ic-menu").first().click();
await page.locator(".cs-menu label", { hasText: "권혁찬" }).locator("input").uncheck();
await page.waitForTimeout(200);
const noKwon = await page.locator(".cs-ct").allInnerTexts();
ok("필터 (담당자)", !noKwon.some((t) => t.includes("서민지") || t.includes("김제조")) && noKwon.some((t) => t.includes("에이트")));
await page.locator(".cs-mbtn").click();
await page.keyboard.press("Escape");

await page.locator(".cs-ic-menu").nth(1).click();
await page.locator(".cs-menu label", { hasText: "이름 순" }).locator("input").check();
await page.waitForTimeout(200);
const t2 = await titles(D(2));
ok("정렬 (이름 순)", t2.join("|") === [...t2].sort((a, b) => a.localeCompare(b, "ko")).join("|"));
await page.locator(".cs-menu label", { hasText: "정렬시간" }).locator("input").check();
await page.keyboard.press("Escape");

await page.locator(".cs-arrow").nth(1).click();
await page.waitForTimeout(400);
ok("다음 주로", (await page.locator(`.cs-day[data-d="${D(7)}"]`).count()) === 1 && (await page.locator(`.cs-day[data-d="${D(0)}"]`).count()) === 0);
await page.getByRole("button", { name: "오늘", exact: true }).click();
await page.waitForTimeout(400);
ok("오늘로", (await page.locator(`.cs-day[data-d="${D(0)}"]`).count()) === 1);

await page.screenshot({ path: process.env.SHOT || `${process.env.TEMP || "."}/company-schedule.png` });
console.log(errors.length ? errors.join("\n") : "오류 없음");
await browser.close();
