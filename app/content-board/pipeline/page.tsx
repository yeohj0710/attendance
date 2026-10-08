import type { Metadata } from "next";
import { PipelineBoard } from "@/components/content/PipelineBoard";

export const metadata: Metadata = { title: "채널 현황" };

export default function ContentPipelinePage() {
  return <PipelineBoard />;
}
