import { EmployeeApp } from "@/components/employee/EmployeeApp";

/* ?inhub=1: 노션 메인의 /hub 안에 들어갈 때. 하늘 배경은 /hub 가 한 장으로 깔아 주니 여기서는 빼고 투명하게 둔다 */
/* 위 여백 0 으로 옆 카드와 윗변을 맞추고, 카드는 칸 폭을 다 쓰고, 스크롤 막대는 숨긴다(휠로는 그대로 스크롤) */
const IN_HUB_CSS = [
  ".sky-scene{display:none!important}",
  "html,body{background:transparent!important}",
  "html{scrollbar-width:none}html::-webkit-scrollbar{display:none}",
  "main.max-w-4xl{padding-top:0!important;padding-left:0!important;padding-right:0!important;max-width:none!important}",
  "main.max-w-4xl>section{max-width:none!important}",
].join("");

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const inHub = (await searchParams).inhub === "1";
  return (
    <>
      {inHub ? <style>{IN_HUB_CSS}</style> : null}
      <EmployeeApp />
    </>
  );
}
