import { VerifyClient } from "./verify-client";
import { VerifyShell } from "@/components/verify-shell";

export const metadata = { title: "Verify certificate" };
export default function VerifyPage() {
  return <VerifyShell><VerifyClient /></VerifyShell>;
}
