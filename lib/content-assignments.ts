import { unstable_cache } from "next/cache";
import { propText, queryNotionDatabase, type NotionPage } from "@/lib/notion";

export const ASSIGNMENTS_DATABASE_ID = "81e8ea1addb347f6909c80e743c5e3d8";
export type CalendarPerson = "kim" | "kwon" | "song" | "lee";
export type ContentAssignment = { person: CalendarPerson | null; owner: string; name: string; editor: string };
export type ContentAssignments = Record<string, ContentAssignment>;

// 원본 페이지 ID로 연결한다. 인플루언서 표시 이름이 바뀌어도 같은 계정이다.
const ACCOUNT_PAGES: Record<string, string> = {
  "39e3b1f9b9ae810fb292da0117c6d8c6": "jejo",
  "32c3b1f9b9ae80a79002cd64a9ed3cd8": "oyak",
  "3303b1f9b9ae80e29e24e49fa63dc80b": "jessi",
  "3bf3b1f9b9ae80bbba06dab69d23fc82": "jay",
  "3d83b1f9b9ae804fa7b2ee62176ccaa9": "taeeun",
  "3de3b1f9b9ae8057b183fd8a39fc963d": "owmb",
  "3eb3b1f9b9ae8199aa52d9764f815edb": "seominji",
  "3de3b1f9b9ae80e3ac73d6b48dcc0ef3": "owmm",
  "3eb3b1f9b9ae8142aa2ed425ec464baa": "yoo",
  "3ce3b1f9b9ae8008807edf5680ded921": "around",
  "3ce3b1f9b9ae805995d6f320f6f470b6": "mimi",
  "4003b1f9b9ae801cb458cab6adde008a": "mens",
  "4003b1f9b9ae80e58c5efbb6f8e54756": "yousunchun",
};
const PEOPLE: Record<string, CalendarPerson> = { 김호준: "kim", 권현우: "kwon", 이윤진: "song", 이민우: "lee" };

export function parseContentAssignments(pages: NotionPage[]): ContentAssignments {
  const result: ContentAssignments = {};
  for (const page of pages) {
    const source = propText(page, "원본 페이지").replace(/-/g, "").match(/[a-f0-9]{32}/i)?.[0].toLowerCase();
    const key = source ? ACCOUNT_PAGES[source] : undefined;
    if (!key) continue;
    const pd = propText(page, "담당 PD");
    const name = pd.replace(/\s*(?:PD님?|님)\s*$/, "").trim();
    result[key] = {
      person: PEOPLE[name] ?? null,
      owner: PEOPLE[name] ? `${name} PD님` : pd || "담당 미정",
      name: propText(page, "인플루언서"),
      editor: propText(page, "담당 편집자") || "미정",
    };
  }
  if (Object.keys(result).length === 0) throw new Error("노션 담당표에서 연결된 계정을 찾지 못했습니다.");
  if (result.jay) result.jaykr = result.jay;
  return result;
}

export const getContentAssignments = unstable_cache(
  async () => parseContentAssignments(await queryNotionDatabase(ASSIGNMENTS_DATABASE_ID)),
  ["content-assignments-v1"],
  { revalidate: 300, tags: ["content-assignments"] },
);
