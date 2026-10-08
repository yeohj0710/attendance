/**
 * 메이플 느낌(밝은 판) 꾸밈 조각: 페이지 배경, 퀘스트 아이콘, 진행 막대.
 * 배경 그림과 아이콘은 직접 그린 SVG 다. 스타일은 app/maple-quest.css.
 */

export function MapleScene() {
  return (
    <div aria-hidden="true" className="maple-scene">
      <div className="maple-cloud maple-cloud-1" />
      <div className="maple-cloud maple-cloud-2" />
      <div className="maple-cloud maple-cloud-3" />
      <div className="maple-hills">
        <svg preserveAspectRatio="none" viewBox="0 0 1200 240">
          <path
            d="M0 120 C160 60 300 70 420 115 C560 165 660 60 820 85 C960 105 1060 50 1200 90 L1200 240 L0 240Z"
            fill="#b5e6a0"
          />
          <path
            d="M0 165 C200 120 340 140 500 168 C660 196 780 130 950 145 C1070 155 1130 140 1200 150 L1200 240 L0 240Z"
            fill="#8fd27a"
          />
          <path d="M0 200 C220 180 420 205 620 196 C820 187 1000 205 1200 192 L1200 240 L0 240Z" fill="#6cbf5c" />
          <g fill="#6cbf5c">
            <circle cx="170" cy="150" r="24" />
            <circle cx="198" cy="140" r="30" />
            <circle cx="228" cy="152" r="22" />
            <circle cx="990" cy="132" r="20" />
            <circle cx="1014" cy="124" r="25" />
            <circle cx="1040" cy="134" r="19" />
          </g>
        </svg>
      </div>
    </div>
  );
}

export function QuestIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <defs>
        <linearGradient id="quest-icon-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ffe9a0" />
          <stop offset="1" stopColor="#ffb21e" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" fill="url(#quest-icon-fill)" r="11" stroke="#b86e00" />
      <rect fill="#5a3200" height="9" rx="1.4" width="2.8" x="10.6" y="5" />
      <circle cx="12" cy="17.6" fill="#5a3200" r="1.6" />
    </svg>
  );
}

export function QuestProgress({ done, total }: { done: number; total: number }) {
  const ratio = total ? Math.min(1, done / total) : 0;
  return (
    <div className="maple-bar">
      진행
      <div className="maple-bar-track">
        <div className="maple-bar-fill" style={{ width: `${ratio * 100}%` }} />
      </div>
      <b>
        {done} / {total}
      </b>
    </div>
  );
}
