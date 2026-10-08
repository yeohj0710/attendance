import { EmployeeApp } from "@/components/employee/EmployeeApp";

/* ?inhub=1: 노션 메인의 /hub 안에 들어갈 때. 하늘 배경은 /hub 가 한 장으로 깔아 주니 여기서는 빼고 투명하게 둔다 */
const IN_HUB_CSS = ".sky-scene{display:none!important}html,body{background:transparent!important}";

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const inHub = (await searchParams).inhub === "1";
  return (
    <>
      {inHub ? <style>{IN_HUB_CSS}</style> : null}
      <EmployeeApp />
    </>
  );
}
