"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 할 일 줄의 "도움" 단추. 누르면 Claude 나 Codex 데스크톱 앱이 켜지고, 새 대화에 그 할 일이 채워진다.
 * - Claude: claude://code/new?q=... (Claude 데스크톱 Code 탭 새 세션. claude.ai/new 는 채팅 화면이라 파일과 명령을 못 써서 쓰지 않는다)
 * - Codex: codex://new?prompt=... (Codex 앱 공식 딥링크. 업로드처럼 브라우저 작업은 Codex 쪽)
 * 노션 안(iframe)에서는 앱 링크가 막혀서 새 탭의 중간 페이지를 거친다. 누를 때 프롬프트를 클립보드에도 복사해 둔다.
 */
const NOTE_LIMIT = 1200;

export function buildHelpPrompt(text: string, note?: string) {
  const trimmedNote = note ? (note.length > NOTE_LIMIT ? `${note.slice(0, NOTE_LIMIT)}…` : note) : "";
  return [
    "업무 시스템 할 일을 같이 해 줘.",
    "",
    `할 일: ${text.split("\n")[0]}`,
    trimmedNote ? `\n설명:\n${trimmedNote}` : "",
    "",
    "먼저 G:\\내 드라이브\\에이전트\\시작.md 를 읽고, 이 일에 맞는 매뉴얼을 찾아서 진행해 줘. 그 폴더가 없으면 나한테 물어봐.",
    "메시지 보내기, 게시, 결제, 삭제처럼 되돌리기 어려운 일은 하기 전에 나한테 꼭 확인받아 줘.",
  ]
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n");
}

export function HelpLaunch({ text, note }: { text: string; note?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const boxRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const prompt = buildHelpPrompt(text, note);
  // 노션 안(iframe)에서 앱 주소로 바로 가면 노션이 막고 화면이 "차단됨"으로 바뀐다.
  // 그래서 새 탭의 중간 페이지(public/open-app.html)가 앱 주소로 이동한다.
  const viaHelper = (url: string) => `/open-app.html?u=${encodeURIComponent(url)}`;
  const claudeUrl = viaHelper(`claude://code/new?q=${encodeURIComponent(prompt)}`);
  const codexUrl = viaHelper(`codex://new?prompt=${encodeURIComponent(prompt)}`);

  /* 링크는 그대로 열고(앱 실행), 같은 순간 프롬프트를 클립보드에도 넣어 둔다 */
  function copyPrompt() {
    void navigator.clipboard?.writeText(prompt).then(
      () => setCopied(true),
      () => undefined,
    );
    window.setTimeout(() => setOpen(false), 2500);
  }

  return (
    <span className="relative" ref={boxRef}>
      <button
        aria-label={`${text} 도움받기`}
        className="rounded p-1 text-muted transition hover:bg-accent/10 hover:text-accent"
        onClick={() => {
          setCopied(false);
          setOpen((v) => !v);
        }}
        title="Claude 나 Codex 로 같이 하기"
        type="button"
      >
        <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
          <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" strokeLinejoin="round" />
          <path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <span className="help-launch-menu">
          <a href={claudeUrl} onClick={copyPrompt} rel="noopener" target="_blank">
            <b>Claude로 하기</b>
            <small>코드 탭</small>
          </a>
          <a href={codexUrl} onClick={copyPrompt} rel="noopener" target="_blank">
            <b>Codex로 하기</b>
            <small>업로드, 브라우저</small>
          </a>
          <span className="help-launch-note">{copied ? "복사해 뒀어요. 안 열리면 붙여 넣으세요" : "앱이 열리고 할 일이 채워져요"}</span>
        </span>
      ) : null}
    </span>
  );
}
