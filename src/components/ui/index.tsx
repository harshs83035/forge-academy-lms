"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" | "dark"; size?: "sm" | "md" | "lg" };
export const Button = React.forwardRef<HTMLButtonElement, BtnProps>(({ className, variant = "primary", size = "md", ...p }, ref) => (
  <button ref={ref} {...p} className={cn(
    "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
    size === "sm" && "px-3 py-1.5 text-sm", size === "md" && "px-4 py-2.5 text-sm", size === "lg" && "px-6 py-3 text-base",
    variant === "primary" && "bg-brand text-white hover:bg-brand-600 shadow-sm",
    variant === "secondary" && "bg-white text-navy-900 border border-navy-100 hover:bg-navy-50",
    variant === "dark" && "bg-navy-900 text-white hover:bg-navy-800",
    variant === "ghost" && "text-navy-700 hover:bg-navy-100",
    variant === "danger" && "bg-red-600 text-white hover:bg-red-700",
    className)} />
));
Button.displayName = "Button";

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div {...p} className={cn("rounded-xl border border-navy-100 bg-white shadow-sm", className)} />
);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} {...p} className={cn("w-full rounded-lg border border-navy-100 bg-white px-3 py-2.5 text-sm placeholder:text-slate-400 focus:border-brand focus:outline-none", className)} />
));
Input.displayName = "Input";
export const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...p} className={cn("w-full rounded-lg border border-navy-100 bg-white px-3 py-2.5 text-sm focus:border-brand focus:outline-none", p.className)} />
);
export const Select = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} className={cn("w-full rounded-lg border border-navy-100 bg-white px-3 py-2.5 text-sm focus:border-brand focus:outline-none", p.className)} />
);
export const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="block space-y-1.5">
    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
    {children}
    {hint && <span className="block text-xs text-slate-500">{hint}</span>}
  </label>
);

const tones = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200", orange: "bg-brand-50 text-brand-600 border-orange-200",
  red: "bg-red-50 text-red-700 border-red-200", slate: "bg-navy-50 text-slate-600 border-navy-100", navy: "bg-navy-900 text-white border-navy-900",
};
export const Badge = ({ tone = "slate", className, ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) => (
  <span {...p} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)} />
);

export const ProgressBar = ({ value, className }: { value: number; className?: string }) => (
  <div className={cn("h-2 w-full overflow-hidden rounded-full bg-navy-100", className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
    <div className={cn("h-full rounded-full transition-all duration-500", value >= 100 ? "bg-emerald-500" : "bg-brand")} style={{ width: `${value}%` }} />
  </div>
);

export const Spinner = ({ className }: { className?: string }) => (
  <span className={cn("inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent", className)} />
);

export function EmptyState({ icon, title, hint, action }: { icon?: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-navy-100 bg-white px-6 py-14 text-center">
      {icon && <div className="text-slate-400">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {hint && <p className="max-w-sm text-sm text-slate-500">{hint}</p>}
      {action}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  React.useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/60 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cn("my-8 w-full rounded-2xl bg-white shadow-2xl", wide ? "max-w-3xl" : "max-w-lg")} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-between border-b border-navy-100 px-6 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-navy-50" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export const Alert = ({ tone = "red", children }: { tone?: "red" | "green" | "orange"; children: React.ReactNode }) => (
  <div role="alert" className={cn("rounded-lg border px-3 py-2 text-sm", tones[tone])}>{children}</div>
);
