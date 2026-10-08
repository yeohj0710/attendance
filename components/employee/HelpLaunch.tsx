"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 할 일 줄의 "도움" 단추. 누르면 Claude 나 Codex 데스크톱 앱이 켜지고, 새 대화에 그 할 일이 채워진다.
 * - Claude: claude://claude.ai/new?q=... (Claude 공식 딥링크)
 * - Codex: codex://new?prompt=... (Codex 앱 공식 딥링크. 업로드처럼 브라우저 작업은 Codex 쪽)
 * 노션 안(다른 사이트의 iframe)에서는 앱 링크가 막힐 수 있어서, 누를 때 프롬프트를 클립보드에도 복사해 둔다.
 */
const NOTE_LIMIT = 1200;

export function buildHelpPrompt(text: string, note?: string) {
  const trimmedNote = note ? (note.length > NOTE_LIMIT ? `${note.slice(0, NOTE_LIMIT)}…` : note) : "";
  return [
    "출퇴근기록부 할 일을 같이 해 줘.",
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
  const claudeUrl = `claude://claude.ai/new?q=${encodeURIComponent(prompt)}`;
  const codexUrl = `codex://new?prompt=${encodeURIComponent(prompt)}`;

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
          <a href={claudeUrl} onClick={copyPrompt}>
            Claude로 하기
          </a>
          <a href={codexUrl} onClick={copyPrompt}>
            Codex로 하기 <small>(업로드, 브라우저 작업)</small>
          </a>
          <span className="help-launch-note">
            {copied ? "할 일 내용을 복사해 뒀어요. 앱이 안 열리면 새 대화에 붙여 넣으세요." : "누르면 앱이 켜지고 할 일 내용이 채워져요."}
          </span>
        </span>
      ) : null}
    </span>
  );
}
