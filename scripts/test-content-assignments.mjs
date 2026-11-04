import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";
import vm from "node:vm";
import http from "node:http";
import ts from "typescript";
import { chromium } from "file:///C:/Users/hjyeo/AppData/Roaming/npm/node_modules/playwright/index.mjs";

const root = join(import.meta.dirname, "..");
const text = (value) => ({ type: "title", title: [{ plain_text: value }] });
const select = (value) => ({ type: "select", select: { name: value } });
const url = (value) => ({ type: "url", url: value });
const row = (id, pd, name) => ({ id, url: `https://www.notion.so/${id}`, properties: {
  "원본 페이지": url(`https://www.notion.so/${id}`), "담당 PD": select(pd), "인플루언서": text(name), "담당 편집자": select("미정"),
} });
const assignmentRows = [
  row("39e3b1f9b9ae810fb292da0117c6d8c6", "김호준 PD", "김제조 약사님"),
  row("3d83b1f9b9ae804fa7b2ee62176ccaa9", "김호준 PD", "김태은 원장님"),
  row("3de3b1f9b9ae8057b183fd8a39fc963d", "권현우 PD", "OWM 분당 약국장님"),
  row("3303b1f9b9ae80e29e24e49fa63dc80b", "권현우 PD", "제씨약사님"),
  row("32c3b1f9b9ae80a79002cd64a9ed3cd8", "이윤진 PD", "오주헌 약사님"),
  row("3bf3b1f9b9ae80bbba06dab69d23fc82", "권현우 PD", "제이약사님"),
  row("3ce3b1f9b9ae8008807edf5680ded921", "이민우 PD", "어라운드팜"),
  row("3ce3b1f9b9ae805995d6f320f6f470b6", "이민우 PD", "미미팜"),
  row("4003b1f9b9ae801cb458cab6adde008a", "권현우 PD", "맨즈약사님"),
  row("4003b1f9b9ae80e58c5efbb6f8e54756", "권현우 PD", "유선춘 약사님"),
];
const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const exports = {};
  const context = vm.createContext({ exports, console, process: { env: { NOTION_TOKEN: "test" } }, fetch: async (address) => ({
    ok: true, json: async () => ({ results: address.includes("81e8ea1addb347f6909c80e743c5e3d8") ? assignmentRows : [], has_more: false }),
  }), require: (id) => {
    if (id === "next/cache") return { unstable_cache: (fn) => fn };
    if (id.startsWith("@/lib/")) return load(id.slice(6));
    throw new Error(`지원하지 않는 테스트 의존성: ${id}`);
  } });
  modules.set(name, exports);
  const source = readFileSync(join(root, "lib", `${name}.ts`), "utf8");
  vm.runInContext(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }), context);
  return exports;
}
const assignmentsModule = load("content-assignments");
let assignments = assignmentsModule.parseContentAssignments(assignmentRows);
assert.equal(assignments.taeeun.person, "kim");
assert.equal(assignments.jessi.person, "kwon");
assert.equal(assignments.oyak.person, "song");
assert.equal(assignments.jay.person, assignments.jaykr.person);
assert.equal(assignments.mens.person, "kwon");
assert.equal(assignments.yousunchun.person, "kwon");
const renamed = assignmentRows.map((r) => r.id === assignmentRows[1].id ? { ...r, properties: { ...r.properties, 인플루언서: text("표시 이름 변경") } } : r);
assert.equal(assignmentsModule.parseContentAssignments(renamed).taeeun.person, "kim");
const unassigned = assignmentRows.map((r) => r.id === assignmentRows[1].id ? { ...r, properties: { ...r.properties, "담당 PD": select("미배정") } } : r);
assert.equal(assignmentsModule.parseContentAssignments(unassigned).taeeun.person, null);
const pipeline = await load("content-pipeline").getPipelineData();
assert.equal([...pipeline.accounts, ...pipeline.waiting].find((a) => a.key === "taeeun").owner, "김호준 PD님");
assert.equal([...pipeline.accounts, ...pipeline.waiting].find((a) => a.key === "jessi").owner, "권현우 PD님");

let offline = false;
const uploads = [
  ["11-04", "taeeun", "연동 확인 영상", "ok", ""],
  ["11-04", "owmb", "분당 연동 확인 영상", "ok", ""],
  ["11-04", "jessi", "제씨 연동 확인 영상", "ok", ""],
  ["11-04", "oyak", "오주헌 연동 확인 영상", "ok", ""],
];
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };
const server = http.createServer((req, res) => {
  const path = new URL(req.url, "http://local").pathname;
  if (path === "/api/calendar/uploads") {
    res.writeHead(offline ? 502 : 200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ uploads, assignments }));
  }
  if (path === "/api/calendar") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ done: {}, move: {}, hide: {}, edit: {}, add: {} }));
  }
  try {
    const file = join(root, "public", "content", path.replace(/^\/content\//, ""));
    res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.clock.install({ time: new Date("2026-11-04T03:00:00Z") });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${address}/content/daily.html#kim`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => upState.ready);
  const owners = await page.evaluate(() => ({
    current: [ownerOf("taeeun", "11-04"), ownerOf("jessi", "11-04"), ownerOf("owmb", "11-04"), ownerOf("oyak", "11-04")],
    past: [ownerOf("taeeun", "10-20"), ownerOf("jessi", "10-20"), ownerOf("owmb", "10-20")],
    kim: rawTasks("kim", "11-04").map((x) => x.t),
    kwon: rawTasks("kwon", "11-04").map((x) => x.t),
    song: rawTasks("song", "11-04").map((x) => x.t),
    shoot: shootPeople({ t: "김태은 원장님", who: ["kwon", "lee"] }, "11-23"),
    mirror: mirrorOwner({ acc: "제씨약사님", who: "song" }, "11-09"),
    editor: shootEditor({ t: "OWM 분당 약국장님", editor: "이전 편집자님" }, "11-23"),
    historicKey: keyOf("song", "10-08", { k: "up", t: "기존 영상" }),
  }));
  assert.deepEqual(owners.current, ["kim", "kwon", "kwon", "song"]);
  assert.deepEqual(owners.past, ["kwon", "song", "kim"]);
  assert(owners.kim.some((t) => t.includes("김태은") && t.includes("연동 확인 영상")));
  assert(!owners.kwon.some((t) => t.includes("김태은 원장님 업로드")));
  assert(owners.kwon.some((t) => t.includes("분당 연동 확인 영상")));
  assert(owners.kwon.some((t) => t.includes("제씨 연동 확인 영상")));
  assert(owners.song.some((t) => t.includes("오주헌 연동 확인 영상")));
  assert.deepEqual(owners.shoot, ["kim", "lee"]);
  assert.equal(owners.mirror, "kwon");
  assert.equal(owners.editor, "담당 편집자님");
  assert((await page.locator("#cal-song h2").innerText()).includes("이윤진"));
  assert((await page.locator("#cal-kwon .pcal-meta p").innerText()).includes("제씨"));
  await page.evaluate(() => { SH.done["song:10-08:keep"] = "1"; });
  assignments = { ...assignments, taeeun: { ...assignments.taeeun, person: "kwon", owner: "권현우 PD님" } };
  await page.evaluate(async () => { await loadUploads(); renderPerson("kwon"); });
  assert.equal(await page.evaluate(() => ownerOf("taeeun", "11-05")), "kwon");
  assert.equal(await page.evaluate(() => SH.done["song:10-08:keep"]), "1");
  assert.equal(await page.evaluate(() => keyOf("song", "10-08", { k: "up", t: "기존 영상" })), owners.historicKey);
  const out = process.env.CONTENT_TEST_OUTPUT;
  if (out) { mkdirSync(out, { recursive: true }); await page.screenshot({ path: join(out, "calendar-sync.png"), fullPage: false }); }
  offline = true;
  await page.evaluate(async () => { await loadUploads(); showSync(); });
  assert.equal(await page.evaluate(() => upState.ready), false);
  assert((await page.locator("#sync").innerText()).includes("담당표 연결 실패"));
  assert.deepEqual(errors, []);
  console.log("담당표 해석, 현황판, 업로드 배정, 촬영과 편집 준비, 담당 변경 재연동, 과거 체크 보존, 연결 실패 처리 통과");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
