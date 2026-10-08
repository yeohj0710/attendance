import type { Metadata } from "next";
import { CompanySchedule } from "@/components/schedule/CompanySchedule";
import "../schedule/schedule.css";
import "./hub.css";

export const metadata: Metadata = {
  title: "웰니스박스 업무",
  robots: { index: false, follow: false },
};

/**
 * 노션 메인에 하나만 붙이는 화면.
 * 왼쪽(좁게): 위에 회사 일정 2주를 작게, 그 아래에 채널 현황(콘텐츠 관리). 오른쪽(넓게): 업무 시스템 첫 화면을 그대로.
 * 업무 관리와 콘텐츠 관리가 주인공이고 달력은 한눈에 보는 정도로 둔다(사용자 지시 261008).
 * 모두 같은 출처라 로그인 한 번이면 같이 된다(오른쪽에서 로그인하면 왼쪽이 저절로 다시 읽는다).
 */
export default function HubPage() {
  return (
    <div className="hub">
      <section className="hub-col hub-left">
        <h2 className="hub-h">📅 일정</h2>
        <div className="hub-cal">
          <CompanySchedule inHub />
        </div>
        <h2 className="hub-h hub-h2">📺 채널 현황</h2>
        <iframe className="hub-frame" src="/content-board/pipeline?embed=1" title="채널 현황" />
      </section>
      <section className="hub-col hub-app">
        <h2 className="hub-h">⏰ 업무 시스템</h2>
        <iframe className="hub-frame" src="/" title="업무 시스템" />
      </section>
    </div>
  );
}
