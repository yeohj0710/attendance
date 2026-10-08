/* public/content (콘텐츠팀 캘린더) 의 HTML 이 부르는 CSS, JS 주소에 내용 해시를 붙인다.
   내용이 바뀌면 주소가 바뀌니 브라우저가 옛 파일을 다시 쓰지 못한다.
   npm run build 앞에서 저절로 돈다 (prebuild). 손으로 돌리려면 node scripts/stamp-content.mjs */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dist = join(import.meta.dirname, "..", "public", "content");

const PAGES = {
  "index.html": [["styles.css", "href"], ["app.js", "src"]],
  "team.html": [["team.css", "href"], ["team.js", "src"]],
  "daily.html": [["daily.css", "href"], ["daily.js", "src"]],
};

function hash(name) {
  return createHash("sha256").update(readFileSync(join(dist, name))).digest("hex").slice(0, 10);
}

for (const [page, assets] of Object.entries(PAGES)) {
  const htmlPath = join(dist, page);
  let html = readFileSync(htmlPath, "utf8");
  const before = html;
  for (const [name, attr] of assets) {
    const v = hash(name);
    const re = new RegExp(`${attr}="\\./${name.replace(".", "\\.")}(\\?v=[a-f0-9]+)?"`, "g");
    if (!html.match(re)) {
      console.error(`${name} 링크를 ${page} 에서 못 찾았다`);
      process.exit(1);
    }
    html = html.replace(re, `${attr}="./${name}?v=${v}"`);
    console.log(`${page}: ${name} → ?v=${v}`);
  }
  if (html !== before) {
    writeFileSync(htmlPath, html, "utf8");
    console.log(`${page} 갱신`);
  }
}
