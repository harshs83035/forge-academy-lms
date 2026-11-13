import { BRAND } from "@/lib/utils";

export function GearIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2l1.6 2.3 2.7-.6.9 2.6 2.6.9-.6 2.7L21 12l-2.3 1.6.6 2.7-2.6.9-.9 2.6-2.7-.6L12 22l-1.6-2.3-2.7.6-.9-2.6-2.6-.9.6-2.7L3 12l2.3-1.6-.6-2.7 2.6-.9.9-2.6 2.7.6L12 2z" fill="#ff7a1a" />
      <circle cx="12" cy="12" r="3.6" fill="#0a1a3a" />
    </svg>
  );
}
export function Logo({ light = true }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <GearIcon />
      <span className={`text-lg font-extrabold tracking-tight ${light ? "text-white" : "text-navy-900"}`}>{BRAND}</span>
    </span>
  );
}
