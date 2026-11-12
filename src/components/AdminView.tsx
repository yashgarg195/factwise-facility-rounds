"use client";

import { useState } from "react";
import { facilityDate, formatDate, formatDateTime } from "@/lib/dates";
import { activePatients, admitPatient, canConfirmDischarge, eligibility, occupancy, outcomes, readingFor } from "@/lib/rules";
import type { FacilityState, Patient } from "@/lib/types";
import { CAPACITY, MORTALITY_BENCHMARK, SUCCESS_BENCHMARK } from "@/lib/types";
import { DemoTag } from "./badges";
import type { Run } from "./PatientPanel";
import { Button, Chip, Eyebrow, Note, Stroke } from "./ui";

const pct = (n: number | null) => (n === null ? "–" : `${(n * 100).toFixed(1)}%`);

function Card({ title, aside, children, tone = "mist" }: { title: string; aside?: React.ReactNode; children: React.ReactNode; tone?: "mist" | "cream" }) {
  return (
    <section className={`rise rounded-[24px] p-5 sm:p-6 ${tone === "cream" ? "bg-cream ring-1 ring-inset ring-blush" : "bg-mist"}`}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-[22px]">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** One square per bed. Occupied = ink, pending discharge = pop, blocked = sienna, free = dashed. */
export function WardMap({ state, today, onOpen }: { state: FacilityState; today: string; onOpen: (id: string) => void }) {
  const byRoom = new Map(activePatients(state).map((p) => [p.room, p]));
  const occ = occupancy(state);
  return (
    <Card
      title="Ward map"
      aside={
        <span className="num text-[15px] text-muted">
          <strong className="font-medium text-ink" data-testid="occupancy">
            {occ.occupied}/{occ.capacity}
          </strong>{" "}
          beds occupied
        </span>
      }
    >
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(34px,1fr))] gap-1.5" aria-label="Beds">
        {Array.from({ length: CAPACITY }, (_, i) => {
          const room = i + 1;
          const p = byRoom.get(room);
          let look = "border-2 border-dashed border-smoke bg-paper text-ash";
          let label = `Room ${room}: free`;
          if (p) {
            const fever = readingFor(state, p.id, today)?.fever;
            if (p.status === "pending_discharge") {
              const ok = canConfirmDischarge(state, p, today).allowed;
              look = ok ? "bg-pop text-paper" : "bg-blush text-sienna ring-2 ring-inset ring-sienna";
              label = `Room ${room}: ${p.name}, ${ok ? "discharge pending" : "recommendation blocked"}`;
            } else {
              look = fever ? "bg-sienna text-paper" : "bg-ink text-paper";
              label = `Room ${room}: ${p.name}${fever ? ", fever today" : ""}`;
            }
          }
          return (
            <li key={room}>
              <button
                type="button"
                disabled={!p}
                title={label}
                aria-label={label}
                onClick={() => p && onOpen(p.id)}
                className={`bed num grid aspect-square w-full place-items-center rounded-[8px] text-[11px] disabled:cursor-default ${look}`}
              >
                {room}
              </button>
            </li>
          );
        })}
      </ul>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted">
        <li className="flex items-center gap-2"><span className="size-3 rounded-[4px] bg-ink" /> Occupied</li>
        <li className="flex items-center gap-2"><span className="size-3 rounded-[4px] bg-sienna" /> Fever today</li>
        <li className="flex items-center gap-2"><span className="size-3 rounded-[4px] bg-pop" /> Discharge pending</li>
        <li className="flex items-center gap-2"><span className="size-3 rounded-[4px] bg-blush ring-2 ring-inset ring-sienna" /> Blocked</li>
        <li className="flex items-center gap-2"><span className="size-3 rounded-[4px] border-2 border-dashed border-smoke" /> Free</li>
      </ul>
    </Card>
  );
}

export function DischargeQueue({ state, today, onOpen }: { state: FacilityState; today: string; onOpen: (id: string) => void }) {
  const pending = state.patients
    .filter((p) => p.status === "pending_discharge")
    .sort((a, b) => (a.recommendation?.recommendedAt ?? "").localeCompare(b.recommendation?.recommendedAt ?? ""));
  const ready = pending.filter((p) => canConfirmDischarge(state, p, today).allowed);
  const blocked = pending.filter((p) => !canConfirmDischarge(state, p, today).allowed);

  const row = (p: Patient, isBlocked: boolean) => (
    <li key={p.id} data-testid={`queue-${p.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="num font-serif text-[22px] leading-none">{p.room}</span>
          <span className="font-medium">{p.name}</span>
          {p.isDemo && <DemoTag />}
        </div>
        <div className="num mt-1 text-[13px] text-ash">
          Recommended {p.recommendation ? formatDateTime(p.recommendation.recommendedAt) : "–"}
        </div>
        {isBlocked && (
          <div className="mt-1 text-[13px] text-sienna">Blocked: {eligibility(state, p, today).blockers.join("; ")}. The doctor must review it.</div>
        )}
      </div>
      <Button size="sm" variant={isBlocked ? "ghost" : "filled"} onClick={() => onOpen(p.id)}>
        {isBlocked ? "View" : "Review & discharge"}
        {!isBlocked && <span aria-hidden className="arrow">→</span>}
      </Button>
    </li>
  );

  return (
    <Card title="Discharge queue" tone="cream" aside={<span className="text-[13px] text-ash">Oldest recommendation first</span>}>
      {pending.length === 0 ? (
        <p className="text-[15px] text-muted">No recommendations. A doctor recommends discharge after 3 full days without fever.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <Eyebrow>Ready to confirm · {ready.length}</Eyebrow>
            {ready.length === 0 ? (
              <p className="py-2 text-[15px] text-muted">None right now.</p>
            ) : (
              <ul className="divide-y divide-blush">{ready.map((p) => row(p, false))}</ul>
            )}
          </div>
          {blocked.length > 0 && (
            <div>
              <Eyebrow>Blocked: eligibility changed · {blocked.length}</Eyebrow>
              <ul className="divide-y divide-blush">{blocked.map((p) => row(p, true))}</ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function AdmitForm({ state, run }: { state: FacilityState; run: Run }) {
  const { available } = occupancy(state);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<"F" | "M" | "">("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = run((s, now) => admitPatient(s, "admin", { name, age, sex }, now));
    if (r.ok) {
      setName("");
      setAge("");
      setSex("");
      setError(null);
    } else setError(r.error);
  };

  const field = "mt-1.5 h-11 w-full rounded-[16px] border border-hairline bg-paper px-4 text-[15px] focus:border-ink focus:outline-none";

  return (
    <Card title="Admit a patient" aside={<span className="num text-[13px] text-ash" data-testid="available">{available} free</span>}>
      {available === 0 ? (
        <Note tone="info">All {CAPACITY} beds are occupied. Confirm a discharge to free a bed.</Note>
      ) : (
        <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-[1fr_5.5rem_8rem] sm:items-end">
          <label className="text-[14px] font-medium">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </label>
          <label className="text-[14px] font-medium">
            Age
            <input inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} className={field} />
          </label>
          <label className="text-[14px] font-medium">
            Sex
            <select value={sex} onChange={(e) => setSex(e.target.value as "F" | "M" | "")} className={field}>
              <option value="">Select</option>
              <option value="F">Female</option>
              <option value="M">Male</option>
            </select>
          </label>
          <div className="sm:col-span-3">
            <Button type="submit">
              Admit to the first free bed <span aria-hidden className="arrow">→</span>
            </Button>
          </div>
        </form>
      )}
      {error && (
        <div className="mt-3">
          <Note tone="error">{error}</Note>
        </div>
      )}
    </Card>
  );
}

export function Outcomes({ state, onOpen }: { state: FacilityState; onOpen: (id: string) => void }) {
  const out = outcomes(state);
  const recent = state.patients
    .filter((p) => p.status === "discharged" || p.status === "deceased")
    .sort((a, b) => (b.dischargedAt ?? b.deceasedAt ?? "").localeCompare(a.dischargedAt ?? a.deceasedAt ?? ""))
    .slice(0, 6);

  return (
    <Card title="Treatment outcomes" aside={<span className="text-[13px] text-ash">Completed cases only</span>}>
      {out.completed === 0 ? (
        <p className="text-[15px] text-muted">No completed cases yet. Rates appear after the first discharge or death.</p>
      ) : (
        <div className="space-y-6">
          {out.mortalityAboveBenchmark && (
            <Note tone="error">
              <strong className="font-medium">Mortality is above the 15% benchmark.</strong> Review treatment quality with the head doctor.
            </Note>
          )}
          <dl className="grid grid-cols-3 gap-4">
            {[
              { label: "Discharged", value: out.discharged, id: "discharged-count" },
              { label: "Deceased", value: out.deceased, id: "deceased-count" },
              { label: "Completed", value: out.completed, id: "completed-count" },
            ].map((s) => (
              <div key={s.id}>
                <dt className="text-[13px] text-ash">{s.label}</dt>
                <dd className="num font-serif text-[40px] leading-tight" data-testid={s.id}>
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="space-y-5">
            {[
              { label: "Success rate", value: out.successRate, bench: SUCCESS_BENCHMARK, good: (out.successRate ?? 0) >= SUCCESS_BENCHMARK, id: "success-rate", sign: "≥" },
              { label: "Mortality rate", value: out.mortalityRate, bench: MORTALITY_BENCHMARK, good: !out.mortalityAboveBenchmark, id: "mortality-rate", sign: "≤" },
            ].map((m) => (
              <div key={m.id}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className="font-medium">{m.label}</span>
                  <span className="num text-[15px]">
                    <span data-testid={m.id} className={`font-medium ${m.good ? "text-go" : "text-sienna"}`}>
                      {pct(m.value)}
                    </span>{" "}
                    <span className="text-ash">
                      target {m.sign} {pct(m.bench)}
                    </span>
                  </span>
                </div>
                <Stroke value={m.value ?? 0} tick={m.bench} tone={m.good ? "go" : "pop"} label={`${m.label} ${pct(m.value)}, target ${pct(m.bench)}`} />
              </div>
            ))}
          </div>
          <p className="text-[13px] text-ash">
            Mortality = deceased ÷ completed cases. Success = discharged ÷ completed cases. The black tick marks the benchmark.
            {out.averageStayDays !== null && ` Average stay of discharged patients: ${out.averageStayDays.toFixed(1)} days.`}
          </p>
        </div>
      )}
      {recent.length > 0 && (
        <div className="mt-6 border-t border-hairline pt-4">
          <Eyebrow>Recent completed cases</Eyebrow>
          <ul className="mt-2 divide-y divide-hairline text-[15px]">
            {recent.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                <button type="button" className="text-left underline-offset-4 hover:underline" onClick={() => onOpen(p.id)}>
                  {p.name} <span className="num text-[13px] text-ash">{p.id}</span>
                </button>
                <span className="flex items-center gap-3">
                  <span className="num text-[13px] text-ash">{formatDate(facilityDate(new Date(p.dischargedAt ?? p.deceasedAt ?? 0)))}</span>
                  <Chip kind={p.status === "discharged" ? "go" : "neutral"}>{p.status === "discharged" ? "Discharged" : "Deceased"}</Chip>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
