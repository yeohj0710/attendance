import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./content.css";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ContentLayout({ children }: { children: ReactNode }) {
  return children;
}
