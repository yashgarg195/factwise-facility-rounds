"use client";

import { useState, type ReactNode } from "react";

/** Status chip. Meaning: go = clear, fever = sienna on blush, todo = needs action, ink = handed over. */
export type ChipKind = "go" | "fever" | "todo" | "neutral" | "ink" | "blocked";

const CHIP: Record<ChipKind, { box: string; dot: string }> = {
  go: { box: "bg-gowash text-go", dot: "bg-go" },
  fever: { box: "bg-blush text-sienna", dot: "bg-sienna" },
  todo: { box: "bg-paper text-ink ring-1 ring-inset ring-pop/50", dot: "border-[1.5px] border-dashed border-pop bg-transparent" },
  neutral: { box: "bg-mist text-muted", dot: "bg-smoke" },
  ink: { box: "bg-ink text-paper", dot: "bg-pop" },
  blocked: { box: "bg-blush text-sienna ring-1 ring-inset ring-sienna/40", dot: "bg-pop" },
};

export function Chip({ kind = "neutral", children }: { kind?: ChipKind; children: ReactNode }) {
  const c = CHIP[kind];
  return (
    <span className={`num inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] leading-none ${c.box}`}>
      <span aria-hidden className={`inline-block size-2 shrink-0 rounded-full ${c.dot}`} />
      {children}
    </span>
  );
}

type ButtonVariant = "filled" | "ghost" | "danger" | "quiet";

export function Button({
  variant = "filled",
  size = "md",
  className = "",
  ...props
}: React.ComponentProps<"button"> & { variant?: ButtonVariant; size?: "md" | "sm" }) {
  return <button type="button" {...props} className={`pill pill-${variant} ${size === "sm" ? "pill-sm" : ""} ${className}`} />;
}

/** Two-step button: the first click asks, the second click acts. */
export function ConfirmButton({
  label,
  question,
  confirmLabel,
  onConfirm,
  variant = "ghost",
  size = "md",
  disabled,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  onConfirm: () => void;
  variant?: ButtonVariant;
  size?: "md" | "sm";
  disabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button variant={variant} size={size} disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }
  return (
    <div role="alertdialog" aria-label={question} className="rise rounded-[16px] bg-paper p-4 text-[15px] shadow-[var(--shadow-popover)]">
      <p className="mb-3">{question}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={variant === "danger" ? "danger" : "filled"}
          onClick={() => {
            setAsking(false);
            onConfirm();
          }}
        >
          {confirmLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function Note({ tone, children }: { tone: "info" | "warn" | "error" | "success"; children: ReactNode }) {
  const styles = {
    info: "bg-mist text-ink",
    warn: "bg-popwash text-sienna",
    error: "bg-blush text-sienna",
    success: "bg-gowash text-go",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : undefined} className={`rounded-[16px] px-4 py-3 text-[15px] leading-snug ${styles}`}>
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-ash">{children}</p>;
}

/** Thin progress stroke with an optional benchmark tick, in the style of the reference charts. */
export function Stroke({ value, tick, tone = "ink", label }: { value: number; tick?: number; tone?: "ink" | "go" | "pop" | "sienna"; label: string }) {
  const color = { ink: "var(--color-ink)", go: "var(--color-go)", pop: "var(--color-pop)", sienna: "var(--color-sienna)" }[tone];
  const v = Math.max(0, Math.min(1, value));
  return (
    <svg viewBox="0 0 300 16" preserveAspectRatio="none" className="h-4 w-full overflow-visible" role="img" aria-label={label}>
      <path d="M2 8 H298" stroke="rgba(23,25,28,0.12)" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" fill="none" />
      {v > 0 && (
        <path
          key={v}
          className="stroke-in"
          d={`M2 8 H${2 + 296 * v}`}
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          fill="none"
        />
      )}
      {tick !== undefined && (
        <path d={`M${2 + 296 * tick} 1 V15`} stroke="var(--color-ink)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5 text-[18px] font-medium tracking-[-0.01em]">
      <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden>
        <rect width="32" height="32" rx="9" fill="currentColor" />
        <g fill="#fbe1d1">
          <rect x="7" y="15" width="3" height="10" rx="1.5" />
          <rect x="12.5" y="10" width="3" height="15" rx="1.5" />
          <rect x="18" y="13" width="3" height="12" rx="1.5" />
        </g>
        <circle cx="24" cy="9" r="3" fill="#d4572a" />
      </svg>
      Facility Rounds
    </span>
  );
}
