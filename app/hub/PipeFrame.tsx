"use client";

import { useEffect, useRef } from "react";

/**
 * 채널 현황 iframe. 안쪽 스크롤 없이 내용 높이만큼 늘린다.
 * 채널 현황 embed 가 같은 출처 부모에게 { source: "content-board", type: "height", height } 를 보낸다(components/content/ContentShell.tsx).
 */
export function PipeFrame() {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin || e.source !== ref.current?.contentWindow) return;
      const m = e.data as { source?: string; type?: string; height?: number } | null;
      if (!m || m.source !== "content-board" || m.type !== "height" || typeof m.height !== "number") return;
      if (ref.current) ref.current.style.height = `${Math.max(200, Math.ceil(m.height))}px`;
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return <iframe ref={ref} className="hub-frame hub-pipe-frame" src="/content-board/pipeline?embed=1" title="채널 현황" scrolling="no" />;
}
