import type { Metadata } from "next";
import { SkyScene } from "@/components/employee/SkyScene";
import { CompanySchedule } from "@/components/schedule/CompanySchedule";
import { PipeFrame } from "./PipeFrame";
import "../schedule/schedule.css";
import "./hub.css";

export const metadata: Metadata = {
  title: "웰니스박스 업무",
  robots: { index: false, follow: false },
};

/**
 * 노션 메인에 하나만 붙이는 화면.
 * 배경은 업무 시스템의 하늘 한 장(SkyScene)으로 통일하고, 그 위에 흰 카드 세 장을 놓는다.
 * 넓을 때: 왼쪽 위 회사 일정, 왼쪽 아래 채널 현황, 오른쪽 업무 시스템(화면에 붙어 있고 자기 스크롤). 두 줄 너비는 5:6 비율로 같이 늘고 준다.
 * 좁을 때: 한 줄로 일정, 업무 시스템, 채널 현황 순서.
 * 모두 같은 출처라 로그인 한 번이면 같이 된다(오른쪽에서 로그인하면 일정이 저절로 다시 읽는다).
 */
export default function HubPage() {
  return (
    <div className="hub">
      <SkyScene />
      <div className="hub-grid">
        <div className="hub-card hub-cal-card">
          <h2 className="hub-h">📅 일정</h2>
          <div className="hub-cal">
            <CompanySchedule inHub />
          </div>
        </div>
        <div className="hub-app">
          <iframe className="hub-frame hub-app-frame" src="/?inhub=1" title="업무 시스템" />
        </div>
        <div className="hub-card hub-pipe-card">
          <h2 className="hub-h">📺 채널 현황</h2>
          <PipeFrame />
        </div>
      </div>
    </div>
  );
}
