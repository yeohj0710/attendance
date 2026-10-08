"use client";

import { useEffect, useState } from "react";

/**
 * 할 일 줄의 "도움" 단추. 누르면 Claude 나 Codex 데스크톱 앱이 켜지고, 새 대화에 그 할 일이 채워진다.
 * 메뉴 없이 할 일 종류로 앱을 고른다(261008 대표님: 중간 단계 줄이기, 업로드만 Codex). 모양은 아이콘, 마우스를 올리면 앱 이름.
 * - 영상 업로드(캘린더 라벨 "업로드", "예약" 또는 제목에 "업로드"): Codex. codex://new?prompt=... 크롬 확장으로 올린다
 * - 나머지: Claude 데스크톱 Code 탭 새 세션. claude://code/new?q=...&folder=G:\내 드라이브\에이전트
 *   (claude.ai/new 는 채팅 화면이라 파일과 명령을 못 써서 쓰지 않는다. PD님 PC 는 모두 G: 드라이브)
 * 노션 안(iframe)에서는 앱 링크가 막혀서 새 탭의 중간 페이지를 거친다. 누를 때 프롬프트를 클립보드에도 복사해 둔다.
 */
const NOTE_LIMIT = 1200;
const AGENT_FOLDER = "G:\\내 드라이브\\에이전트";

export function isUploadTask(text: string, label?: string) {
  return /업로드|예약/.test(label ?? "") || /업로드/.test(text.split("\n")[0]);
}

export function buildHelpPrompt(text: string, note?: string, upload = false) {
  const trimmedNote = note ? (note.length > NOTE_LIMIT ? `${note.slice(0, NOTE_LIMIT)}…` : note) : "";
  return [
    "업무 시스템 할 일을 같이 해 줘.",
    "",
    `할 일: ${text.split("\n")[0]}`,
    trimmedNote ? `\n설명:\n${trimmedNote}` : "",
    "",
    `먼저 ${AGENT_FOLDER}\\시작.md 를 읽고, 이 일에 맞는 매뉴얼을 찾아서 진행해 줘. 그 폴더가 없으면 나한테 물어봐.`,
    ...(upload
      ? [
          "영상 업로드는 이 PC 크롬의 확장(로그인된 크롬)으로 해 줘. 매뉴얼에 적힌 업로드와 게시는 끝까지 해 줘.",
          "올리기 직전에 화면의 계정 이름이 맞는지 확인하고, 매뉴얼에 없는 메시지 보내기, 결제, 삭제는 하기 전에 나한테 확인받아 줘.",
        ]
      : ["메시지 보내기, 게시, 결제, 삭제처럼 되돌리기 어려운 일은 하기 전에 나한테 꼭 확인받아 줘."]),
  ]
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n");
}

export function HelpLaunch({ text, note, label }: { text: string; note?: string; label?: string }) {
  const [opened, setOpened] = useState(false);

  /* 노션 같은 다른 페이지 안(iframe)에 떠 있는지. 처음 그릴 때는 모르니 안전한 쪽(안에 있음)으로 둔다 */
  const [inFrame, setInFrame] = useState(true);
  useEffect(() => {
    try {
      setInFrame(window.self !== window.top);
    } catch {
      setInFrame(true);
    }
  }, []);

  const upload = isUploadTask(text, label);
  const prompt = buildHelpPrompt(text, note, upload);
  const appUrl = upload
    ? `codex://new?prompt=${encodeURIComponent(prompt)}`
    : `claude://code/new?q=${encodeURIComponent(prompt)}&folder=${encodeURIComponent(AGENT_FOLDER)}`;
  // 노션 안(iframe)에서 앱 주소로 바로 가면 노션이 막고 화면이 "차단됨"으로 바뀐다.
  // 그때만 새 탭의 중간 페이지(public/open-app.html)가 앱 주소로 이동한다.
  // 업무 시스템을 직접 열었을 때는 새 탭 없이 바로 앱을 연다(새 탭이 매번 떠서 불편하다는 261008 요청).
  const href = inFrame ? `/open-app.html?u=${encodeURIComponent(appUrl)}` : appUrl;
  const appName = upload ? "Codex" : "Claude";

  /* 링크는 그대로 열고(앱 실행), 같은 순간 프롬프트를 클립보드에도 넣어 둔다. 앱이 안 열리면 붙여 넣으면 된다 */
  function onOpen() {
    void navigator.clipboard?.writeText(prompt).catch(() => undefined);
    setOpened(true);
    window.setTimeout(() => setOpened(false), 2500);
  }

  /* 글자 단추는 줄마다 자리를 차지해 할 일 제목이 잘려서(261008 대표님) 아이콘으로. 마우스를 올리면 어느 앱인지 뜬다.
     업로드 할 일은 위 화살표, 나머지는 반짝이. 누른 직후 잠깐 주황으로 바뀐다 */
  return (
    <a
      aria-label={`${text}, ${appName}로 하기`}
      className={`rounded p-1 transition hover:bg-accent/10 hover:text-accent ${opened ? "text-accent" : "text-muted"}`}
      href={href}
      onClick={onOpen}
      rel="noopener"
      target={inFrame ? "_blank" : undefined}
      title={upload ? "Codex로 하기 (영상 업로드, 크롬 확장)" : "Claude로 하기 (코드 탭)"}
    >
      {upload ? (
        <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
          <path d="M12 16V4" />
          <path d="M7 9l5-5 5 5" />
          <path d="M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" />
        </svg>
      ) : (
        <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
          <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" strokeLinejoin="round" />
          <path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" strokeLinejoin="round" />
        </svg>
      )}
    </a>
  );
}
