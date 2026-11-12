"use client";

import { useCallback, useEffect, useState } from "react";
import { FACILITY_TZ_LABEL, facilityDate, formatLongDate } from "@/lib/dates";
import {
  activePatients,
  canConfirmDischarge,
  canRecommend,
  doctorStatus,
  eligibility,
  occupancy,
  outcomes,
  readingFor,
  type ActionResult,
} from "@/lib/rules";
import { commitState, isStorageAvailable, resetDemo, useFacilityState, useNowMinute } from "@/lib/store";
import { MORTALITY_BENCHMARK, ROLE_LABELS, type FacilityState, type Patient, type Role } from "@/lib/types";
import { AdmitForm, DischargeQueue, Outcomes, WardMap } from "./AdminView";
import { DemoTag } from "./badges";
import { PatientPanel } from "./PatientPanel";
import { Worklist } from "./Worklist";
import { Button, ConfirmButton, Eyebrow, Logo, Note, Stroke } from "./ui";

type Toast = { id: number; text: string; tone: "success" | "error" };

const byDemoThenRoom = (a: Patient, b: Patient) => Number(!!b.isDemo) - Number(!!a.isDemo) || a.room - b.room;
const pct = (n: number | null) => (n === null ? "–" : `${(n * 100).toFixed(1)}%`);

export function FacilityApp() {
  const state = useFacilityState();
  const nowMinute = useNowMinute();
  const [role, setRole] = useState<Role>("nurse");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const run = useCallback(
    (action: (s: FacilityState, now: Date) => ActionResult): ActionResult => {
      if (!state) return { ok: false, error: "Data is still loading." };
      const result = action(state, new Date());
      if (result.ok) {
        commitState(result.state);
        setToast({ id: Date.now(), text: result.message, tone: "success" });
      } else {
        setToast({ id: Date.now(), text: result.error, tone: "error" });
      }
      return result;
    },
    [state],
  );
  const closePanel = useCallback(() => setSelectedId(null), []);

  if (!state || !nowMinute) {
    return (
      <div className="grid min-h-screen place-items-center text-muted">
        <span className="flex items-center gap-3">
          <span className="live-dot is-pulsing" /> Loading ward data…
        </span>
      </div>
    );
  }

  const today = facilityDate(new Date(nowMinute));
  const active = activePatients(state);
  const q = query.trim().toLowerCase();
  const visible = q
    ? active.filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || String(p.room) === q)
    : active;
  const selected = selectedId ? state.patients.find((p) => p.id === selectedId) : undefined;
  const occ = occupancy(state);
  const out = outcomes(state);

  const awaiting = active.filter((p) => !readingFor(state, p.id, today)).sort(byDemoThenRoom);
  const recorded = active.length - awaiting.length;
  const feverToday = active.filter((p) => readingFor(state, p.id, today)?.fever).length;
  const ready = active.filter((p) => doctorStatus(state, p, today) === "ready_for_visit").sort(byDemoThenRoom);
  const visited = active.filter((p) => doctorStatus(state, p, today) === "visit_complete").length;
  const toRecommend = active.filter((p) => canRecommend(state, p, today).allowed).sort(byDemoThenRoom);
  const eligibleNotRecommended = active.filter((p) => p.status === "admitted" && eligibility(state, p, today).eligible).length;
  const readyDischarges = active
    .filter((p) => p.status === "pending_discharge" && canConfirmDischarge(state, p, today).allowed)
    .sort((a, b) => (a.recommendation?.recommendedAt ?? "").localeCompare(b.recommendation?.recommendedAt ?? ""));

  type Kpi = { label: string; value: string; note?: string; bar?: number; tick?: number; tone?: "ink" | "go" | "pop" | "sienna"; alert?: boolean };
  const workspace: {
    eyebrow: string;
    title: string;
    kpis: Kpi[];
    next?: Patient;
    nextLabel: string;
    nextReason: string;
  } = {
    nurse: {
      eyebrow: "Nurse workspace",
      title: "Daily temperature round",
      kpis: [
        { label: "Readings today", value: `${recorded}/${active.length}`, bar: recorded / Math.max(1, active.length) },
        { label: "Awaiting reading", value: String(awaiting.length), note: awaiting.length ? "Listed first below" : "Round complete", alert: awaiting.length > 0 },
        { label: "Fever today", value: String(feverToday), note: `of ${recorded} readings` },
        { label: "Beds occupied", value: `${occ.occupied}/${occ.capacity}` },
      ],
      next: awaiting[0],
      nextLabel: "Record temperature",
      nextReason: "No reading today",
    },
    doctor: {
      eyebrow: "Doctor workspace",
      title: "Daily visits",
      kpis: [
        { label: "Ready for visit", value: String(ready.length), note: "Temperature recorded", alert: ready.length > 0 },
        { label: "Waiting for temperature", value: String(awaiting.length), note: "Nurse has not measured yet" },
        { label: "Visits today", value: `${visited}/${active.length}`, bar: visited / Math.max(1, active.length) },
        { label: "Eligible, not recommended", value: String(eligibleNotRecommended), note: "3 full days without fever" },
      ],
      next: ready[0] ?? toRecommend[0],
      nextLabel: ready[0] ? "Start visit" : "Review discharge",
      nextReason: ready[0] ? "Temperature recorded, no visit yet" : "Eligible and visited today",
    },
    admin: {
      eyebrow: "Administrator workspace",
      title: "Beds, discharges and outcomes",
      kpis: [
        { label: "Beds occupied", value: `${occ.occupied}/${occ.capacity}`, bar: occ.occupied / occ.capacity },
        { label: "Available beds", value: String(occ.available) },
        { label: "Discharges to confirm", value: String(readyDischarges.length), note: `${occ.pending} pending in total`, alert: readyDischarges.length > 0 },
        {
          label: "Mortality rate",
          value: pct(out.mortalityRate),
          note: `Target ≤ ${pct(MORTALITY_BENCHMARK)} · success ${pct(out.successRate)}`,
          bar: out.mortalityRate ?? 0,
          tick: MORTALITY_BENCHMARK,
          tone: out.mortalityAboveBenchmark ? ("pop" as const) : ("go" as const),
        },
      ],
      next: readyDischarges[0],
      nextLabel: "Review & discharge",
      nextReason: "Oldest doctor recommendation",
    },
  }[role];

  return (
    <div className="min-h-screen">
      <a href="#work" className="absolute -top-24 left-4 z-50 rounded-full bg-ink px-4 py-2 text-paper focus:top-4">
        Skip to the worklist
      </a>
      <header className="sticky top-0 z-30 border-b border-hairline bg-paper/90 backdrop-blur">
        <div className="mx-auto grid max-w-[1280px] grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 px-[clamp(16px,4vw,40px)] py-3 lg:grid-cols-[1fr_auto_1fr]">
          <div className="flex min-w-0 items-center gap-4">
            <Logo />
            <span className="hidden rounded-full bg-mist px-2.5 py-1 text-[12px] text-muted md:inline">Prototype · synthetic data</span>
          </div>
          <div className="col-span-2 row-start-2 flex items-center gap-3 lg:col-span-1 lg:row-start-auto">
            <span className="hidden text-[13px] text-ash sm:inline">Viewing as</span>
            <div className="inline-flex rounded-full bg-mist p-1" role="group" aria-label="Switch role (demo)">
              {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={role === r}
                  onClick={() => {
                    setRole(r);
                    setSelectedId(null);
                  }}
                  className={`min-h-9 rounded-full px-4 text-[14px] transition-colors ${
                    role === r ? "bg-ink text-paper" : "text-muted hover:text-ink"
                  }`}
                >
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <ConfirmButton
              size="sm"
              variant="quiet"
              label="Reset demo"
              question="Reset all demo data? Your changes in this browser will be lost."
              confirmLabel="Reset"
              onConfirm={() => {
                resetDemo();
                setSelectedId(null);
                setQuery("");
                setToast({ id: Date.now(), text: "Demo data reset.", tone: "success" });
              }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-[clamp(16px,4vw,40px)]">
        {!isStorageAvailable() && (
          <div className="pt-4">
            <Note tone="warn">This browser blocks local storage. Changes stay until you close or refresh the page.</Note>
          </div>
        )}

        <section key={role} className="space-y-4 pb-5 pt-6" aria-labelledby="workspace-title">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <Eyebrow>{workspace.eyebrow}</Eyebrow>
              <h1 id="workspace-title" className="display mt-1 text-[30px]">
                {workspace.title}
              </h1>
            </div>
            <p className="num text-[14px] text-ash">
              {formatLongDate(today)} · {FACILITY_TZ_LABEL}
            </p>
          </div>

          <dl className="grid grid-cols-2 overflow-hidden rounded-[20px] bg-mist lg:grid-cols-4">
            {workspace.kpis.map((k, i) => (
              <div
                key={k.label}
                className={`px-5 py-4 ${i % 2 === 1 ? "border-l border-paper" : ""} ${i >= 2 ? "border-t border-paper lg:border-t-0" : ""} ${
                  i === 2 ? "lg:border-l" : ""
                }`}
              >
                <dt className="flex items-center gap-2 text-[13px] text-ash">
                  {k.alert && <span className="live-dot is-pulsing" aria-hidden />}
                  {k.label}
                </dt>
                <dd className="num mt-1 font-serif text-[30px] leading-none">{k.value}</dd>
                {k.bar !== undefined && (
                  <div className="mt-2.5">
                    <Stroke value={k.bar} tick={k.tick} tone={k.tone ?? "ink"} label={`${k.label}: ${k.value}`} />
                  </div>
                )}
                {k.note && <p className="mt-1.5 text-[13px] text-muted">{k.note}</p>}
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-cream px-4 py-3 ring-1 ring-inset ring-blush">
            {workspace.next ? (
              <>
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-[13px] font-medium uppercase tracking-[0.08em] text-pop">Next up</span>
                  <span className="num font-serif text-[22px] leading-none">{workspace.next.room}</span>
                  <span className="font-medium">{workspace.next.name}</span>
                  {workspace.next.isDemo && <DemoTag />}
                  <span className="text-[14px] text-muted">· {workspace.nextReason}</span>
                </div>
                <Button size="sm" onClick={() => setSelectedId(workspace.next!.id)} data-testid="next-up">
                  {workspace.nextLabel} <span aria-hidden className="arrow">→</span>
                </Button>
              </>
            ) : (
              <span className="text-[15px] text-muted">Nothing is waiting for you right now.</span>
            )}
          </div>
        </section>

        <div id="work" className="scroll-mt-28 space-y-4 pb-16">
          {role === "admin" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-4">
                <DischargeQueue state={state} today={today} onOpen={setSelectedId} />
                <WardMap state={state} today={today} onOpen={setSelectedId} />
                <AdmitForm state={state} run={run} />
              </div>
              <Outcomes state={state} onOpen={setSelectedId} />
            </div>
          )}
          <Worklist
            key={role}
            state={state}
            role={role}
            today={today}
            patients={visible}
            onOpen={setSelectedId}
            query={query}
            onQuery={setQuery}
            title={role === "nurse" ? "Temperature worklist" : role === "doctor" ? "Visit worklist" : "Active patients"}
          />
        </div>
      </main>

      <footer className="bg-cream">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-[clamp(16px,4vw,40px)] py-8 text-[14px] text-muted">
          <Logo />
          <p className="max-w-[60ch]">
            Prototype with synthetic data. Data stays in this browser. The role switcher replaces login for the demo. Facility day = {FACILITY_TZ_LABEL}{" "}
            calendar day.
          </p>
        </div>
      </footer>

      {selected && <PatientPanel state={state} role={role} today={today} patient={selected} run={run} onClose={closePanel} />}

      {toast && (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className={`rise fixed bottom-5 left-1/2 z-50 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-full px-5 py-3 text-[15px] text-paper shadow-[var(--shadow-artifact)] ${
            toast.tone === "success" ? "bg-ink" : "bg-sienna"
          }`}
        >
          <span aria-hidden className={`size-2 shrink-0 rounded-full ${toast.tone === "success" ? "bg-go" : "bg-pop"}`} />
          {toast.text}
        </div>
      )}
    </div>
  );
}
