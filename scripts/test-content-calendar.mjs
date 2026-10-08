/* 로컬에서 public/content 를 띄우고 /api/calendar 를 메모리 저장소로 흉내 내서
   체크, 추가, 고치기, 끌어 옮기기, 지우고 되돌리기를 차례로 눌러 본다. 서버 저장소는 건드리지 않는다. */
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
const page = await (await browser.newContext({ viewport: { width: 1500, height: 2400 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:4199/daily.html#kim", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
const ok = (name, cond) => console.log((cond ? "통과 " : "실패 ") + name);

ok("공용 저장 연결 표시", (await page.locator("#sync").innerText()).includes("같이 보는"));
const cell = () => page.locator('#cal-kim .g-week[data-w="0"] .day').nth(3); // 10/8
const first = cell().locator(".it:not(.k-off)").first();
const title0 = await first.locator(".it-t").innerText();
await first.locator("input[type=checkbox]").check();
await page.waitForTimeout(150);
ok("체크가 공용 저장에 들어감", Object.keys(mem.done).length === 1);
ok("끝낸 일은 칸 아래로", (await cell().locator(".it:not(.k-off)").last().locator(".it-t").innerText()) === title0);
ok("시간 합계 표시", (await cell().locator(".d-time").innerText()).includes("남은 일"));

await cell().locator(".d-add-btn").click();
await cell().locator(".d-add-form input").fill("테스트로 추가한 할 일");
await cell().locator(".d-add-form input").press("Enter");
await page.waitForTimeout(150);
ok("추가", Object.keys(mem.add).length === 1 && (await cell().innerText()).includes("테스트로 추가한 할 일"));

const own = cell().locator(".it.k-own");
await own.hover();
await own.locator(".it-edit").click();
await page.locator("#editor input[name=t]").fill("고친 할 일");
await page.locator("#editor select[name=d]").selectOption("10-13");
await page.locator("#editor .ed-ok").click();
await page.waitForTimeout(150);
const wk1 = page.locator('#cal-kim .g-week[data-w="1"] .day').nth(1); // 10/13
ok("고치고 날짜 옮김", JSON.parse(Object.values(mem.add)[0]).d === "10-13" && (await wk1.innerText()).includes("고친 할 일"));

const target = cell().locator(".it", { hasText: "카톡 단체방 초대" });
const tTitle = await target.locator(".it-t").innerText();
await target.dragTo(page.locator('#cal-kim .g-week[data-w="0"] .day').nth(2)); // 10/7 로
await page.waitForTimeout(150);
ok("끌어서 다른 날로", Object.values(mem.move).includes("10-07") && (await page.locator('#cal-kim .g-week[data-w="0"] .day').nth(2).locator(".it", { hasText: "카톡 단체방 초대" }).count()) === 1);

const del = cell().locator(".it.k-todo").first();
const dTitle = await del.locator(".it-t").innerText();
await del.hover();
await del.locator(".it-edit").click();
await page.locator("#editor .ed-del").click();
await page.waitForTimeout(150);
ok("지우기", Object.keys(mem.hide).length === 1 && !(await cell().innerText()).includes(dTitle));
await page.locator("#toast button").click();
await page.waitForTimeout(150);
ok("되돌리기", Object.keys(mem.hide).length === 0 && (await cell().innerText()).includes(dTitle));

await page.locator('#cal-kim .grid').screenshot({ path: OUT + "/crud-kim.png" });
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(300);
ok("새로 열어도 남아 있음", (await cell().locator(".it.is-done").count()) === 1);

console.log(errors.length ? errors.join("\n") : "오류 없음");
await browser.close();
server.close();
