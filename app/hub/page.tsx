import type { Metadata } from "next";
import { SkyScene } from "@/components/employee/SkyScene";
import { CompanySchedule } from "@/components/schedule/CompanySchedule";
import "../schedule/schedule.css";
import "./hub.css";

export const metadata: Metadata = {
  title: "웰니스박스 업무",
  robots: { index: false, follow: false },
};

/**
 * 노션 메인에 하나만 붙이는 화면.
 * 배경은 업무 시스템의 하늘 한 장(SkyScene)으로 통일하고, 그 위에 흰 카드 세 장을 놓는다.
 * 왼쪽(넓게): 위 회사 일정(작게), 아래 채널 현황. 오른쪽: 업무 시스템(카드 폭에 맞춰 고정, 하늘 배경은 빼고 띄움 ?inhub=1).
 * 모두 같은 출처라 로그인 한 번이면 같이 된다(오른쪽에서 로그인하면 왼쪽이 저절로 다시 읽는다).
 * 카드 사이와 양옆 하늘은 스크롤이 없어 거기서 휠을 굴리면 바깥 노션 페이지가 내려간다.
 */
export default function HubPage() {
  return (
    <div className="hub">
      <SkyScene />
      <div className="hub-grid">
        <section className="hub-col hub-left">
          <div className="hub-card hub-cal-card">
            <h2 className="hub-h">📅 일정</h2>
            <div className="hub-cal">
              <CompanySchedule inHub />
            </div>
          </div>
          <div className="hub-card hub-pipe-card">
            <h2 className="hub-h">📺 채널 현황</h2>
            <iframe className="hub-frame" src="/content-board/pipeline?embed=1" title="채널 현황" />
          </div>
        </section>
        <section className="hub-col hub-app">
          <iframe className="hub-frame hub-app-frame" src="/?inhub=1" title="업무 시스템" />
        </section>
      </div>
    </div>
  );
}
