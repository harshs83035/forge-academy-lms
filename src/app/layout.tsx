import type { Metadata } from "next";
import "./globals.css";
import { BRAND } from "@/lib/utils";

export const metadata: Metadata = { title: { default: `${BRAND} — Learning Platform`, template: `%s · ${BRAND}` }, description: "Secure machinery training platform", robots: { index: false } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
