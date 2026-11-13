import { VerifyClient } from "../verify-client";
import { VerifyShell } from "@/components/verify-shell";

export default async function VerifyById({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VerifyShell><VerifyClient initialId={decodeURIComponent(id)} /></VerifyShell>;
}
