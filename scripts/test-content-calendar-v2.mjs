/* 새 디자인 시험판(daily-v2.html) 검사. 로컬에서 public/content 를 띄우고 /api/calendar 를 메모리 저장소로 흉내 내서
   체크, 만들기, 고치기, 끌어 옮기기, 지우고 되돌리기, 검색, 필터, 정렬, 주 넘기기를 차례로 눌러 본다. 서버 저장소는 건드리지 않는다. */
import { chromium } from "file:///C:/Users/hjyeo/AppData/Roaming/npm/node_modules/playwright/index.mjs";
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { tmpdir } from "node:os";

const DIST = join(import.meta.dirname, "..", "public", "content");
const OUT = tmpdir();
const mem = { done: {}, move: {}, hide: {}, edit: {}, add: {} };
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/api/calendar") {
    if (req.method === "GET") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(mem)); }
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
      const { op, bucket, key, value } = JSON.parse(b);
      if (op === "set") mem[bucket][key] = typeof value === "string" ? value : JSON.stringify(value); else delete mem[bucket][key];
      res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ok":true}');
    });
    return;
  }
  const f = join(DIST, u.pathname === "/" ? "daily.html" : u.pathname);
  if (!existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": types[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
}).listen(4199);

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 2000 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:4199/daily-v2.html#kim", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
const ok = (name, cond) => console.log((cond ? "통과 " : "실패 ") + name);
const day = (d) => page.locator(`#cal-kim .day[data-d="${d}"]`);
const cell = () => day("10-08");
const save = () => page.locator("#editor .ed-ok").click();

ok("공용 저장 연결 표시", (await page.locator("#sync").innerText()).includes("같이 보는"));
ok("2주가 보임", (await page.locator("#cal-kim .g-week:not([hidden])").count()) === 2);
const first = cell().locator(".it").first();
const title0 = await first.locator(".it-t").innerText();
await first.locator("input[type=checkbox]").check();
await page.waitForTimeout(150);
ok("체크가 공용 저장에 들어감", Object.keys(mem.done).length === 1 && !(await page.locator("#editor[open]").count()));
ok("끝낸 일은 칸 아래로", (await cell().locator(".it").last().locator(".it-t").innerText()) === title0);
ok("오늘 남은 일 표시", (await page.locator("#today-left").innerText()).includes("남음"));

await cell().hover();
await cell().locator(".d-plus").click();
await page.locator("#editor input[name=t]").fill("테스트로 추가한 할 일");
await save();
await page.waitForTimeout(150);
ok("칸의 + 로 만들기", Object.keys(mem.add).length === 1 && (await cell().innerText()).includes("테스트로 추가한 할 일"));

await page.locator("#t-new").click();
await page.locator("#editor input[name=t]").fill("새로 만들기 버튼으로 만든 일");
await page.locator("#editor select[name=d]").selectOption("10-14");
await save();
await page.waitForTimeout(150);
ok("새로 만들기 버튼", Object.keys(mem.add).length === 2 && (await day("10-14").innerText()).includes("새로 만들기 버튼으로 만든 일"));

const own = cell().locator(".it.k-own");
await own.locator(".it-t").click();
await page.locator("#editor input[name=t]").fill("고친 할 일");
await page.locator("#editor select[name=d]").selectOption("10-13");
await save();
await page.waitForTimeout(150);
ok("카드 눌러 고치고 날짜 옮김", Object.values(mem.add).some((v) => JSON.parse(v).d === "10-13" && JSON.parse(v).t === "고친 할 일") && (await day("10-13").innerText()).includes("고친 할 일"));

const target = cell().locator(".it", { hasText: "카톡 단체방 초대" });
await target.dragTo(day("10-07"));
await page.waitForTimeout(150);
ok("끌어서 다른 날로", Object.values(mem.move).includes("10-07") && (await day("10-07").locator(".it", { hasText: "카톡 단체방 초대" }).count()) === 1);

const del = cell().locator(".it.k-todo").first();
const dTitle = await del.locator(".it-t").innerText();
await del.locator(".it-t").click();
await page.locator("#editor .ed-del").click();
await page.waitForTimeout(150);
ok("지우기", Object.keys(mem.hide).length === 1 && !(await cell().innerText()).includes(dTitle));
await page.locator("#toast button").click();
await page.waitForTimeout(150);
ok("되돌리기", Object.keys(mem.hide).length === 0 && (await cell().innerText()).includes(dTitle));

await page.locator("#t-search").click();
await page.locator("#q").fill("퇴근 전");
await page.waitForTimeout(300);
const vis = await page.locator("#cal-kim .g-week:not([hidden]) .it").allInnerTexts();
ok("검색", vis.length > 0 && vis.every((t) => t.includes("퇴근 전")));
await page.locator("#q").fill("");
await page.locator("#q").press("Escape");
await page.waitForTimeout(200);

await page.locator("#t-filter").click();
await page.locator('#menu input[data-k="routine"]').uncheck();
await page.waitForTimeout(150);
ok("필터 (루틴 숨기기)", (await page.locator("#cal-kim .it.k-routine").count()) === 0 && (await page.locator("#t-filter.is-on").count()) === 1);
await page.locator("#menu .m-clear").click();
await page.waitForTimeout(150);
ok("필터 지우기", (await page.locator("#cal-kim .it.k-routine").count()) > 0);
await page.keyboard.press("Escape");

await page.locator("#t-sort").click();
await page.locator('#menu input[value="time"]').check();
await page.waitForTimeout(150);
const ms = await cell().locator(".it:not(.is-done)").evaluateAll((xs) => xs.map((x) => +x.dataset.m));
ok("정렬 (시간 긴 순)", ms.every((m, n) => n === 0 || ms[n - 1] >= m));
await page.locator('#menu input[value="base"]').check();
await page.keyboard.press("Escape");

const w0 = await page.locator("#month").innerText();
await page.locator("#t-next").click();
ok("다음 주로 넘기기", (await page.locator('#cal-kim .g-week[data-w="0"]').isHidden()) && (await page.locator('#cal-kim .g-week[data-w="2"]').isVisible()));
await page.locator("#t-today").click();
ok("오늘로 돌아오기", (await page.locator('#cal-kim .g-week[data-w="0"]').isVisible()) && (await page.locator("#month").innerText()) === w0);

await page.locator('#jump button[data-tab="song"]').click();
ok("사람 바꾸기", (await page.locator("#cal-song").isVisible()) && (await page.locator("#cal-kim").isHidden()));
await page.locator('#jump button[data-tab="editors"]').click();
ok("표 보기", (await page.locator("#panel-editors").isVisible()) && (await page.locator("#cal-bar").isHidden()));
await page.locator('#jump button[data-tab="kim"]').click();

await page.locator("#cals").screenshot({ path: OUT + "/crud-kim.png" });
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(300);
ok("새로 열어도 남아 있음", (await cell().locator(".it.is-done").count()) === 1);

console.log(errors.length ? errors.join("\n") : "오류 없음");
await browser.close();
server.close();
