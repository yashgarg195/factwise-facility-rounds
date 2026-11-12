"use client";

import { formatTime } from "@/lib/dates";
import { DOCTOR_STATUS_LABELS, doctorStatus, eligibility, readingFor, type DoctorStatus } from "@/lib/rules";
import type { FacilityState, Patient } from "@/lib/types";
import { FEVER_FREE_DAYS_REQUIRED } from "@/lib/types";
import { Chip, type ChipKind } from "./ui";

type Props = { state: FacilityState; patient: Patient; today: string };

export function TemperatureBadge({ state, patient, today }: Props) {
  const r = readingFor(state, patient.id, today);
  if (!r) return <Chip kind="todo">Awaiting reading</Chip>;
  return (
    <Chip kind={r.fever ? "fever" : "go"}>
      {r.celsius.toFixed(1)} °C · {r.fever ? "Fever" : "No fever"}
      <span className="opacity-70">· {formatTime(r.recordedAt)}</span>
    </Chip>
  );
}

const DOCTOR_KIND: Record<DoctorStatus, ChipKind> = {
  waiting_for_temperature: "neutral",
  ready_for_visit: "todo",
  visit_complete: "go",
};

export function DoctorBadge({ state, patient, today }: Props) {
  const s = doctorStatus(state, patient, today);
  return <Chip kind={DOCTOR_KIND[s]}>{DOCTOR_STATUS_LABELS[s]}</Chip>;
}

export function DischargeBadge({ state, patient, today }: Props) {
  const e = eligibility(state, patient, today);
  if (patient.status === "pending_discharge") {
    return e.eligible ? <Chip kind="ink">Discharge pending</Chip> : <Chip kind="blocked">Recommendation blocked</Chip>;
  }
  if (patient.status === "discharged") return <Chip kind="go">Discharged</Chip>;
  if (patient.status === "deceased") return <Chip kind="neutral">Deceased</Chip>;
  if (e.eligible) return <Chip kind="go">Eligible for discharge</Chip>;
  return <FeverFreeDots streak={Math.min(e.streak, FEVER_FREE_DAYS_REQUIRED)} />;
}

/** Three small pips: how many of the required fever-free days are done. */
export function FeverFreeDots({ streak }: { streak: number }) {
  return (
    <span className="num inline-flex items-center gap-2 text-[13px] text-muted" title={`${streak} of ${FEVER_FREE_DAYS_REQUIRED} fever-free days`}>
      <span aria-hidden className="inline-flex gap-1">
        {Array.from({ length: FEVER_FREE_DAYS_REQUIRED }, (_, i) => (
          <span key={i} className={`inline-block h-2 w-4 rounded-full ${i < streak ? "bg-go" : "bg-mist ring-1 ring-inset ring-hairline"}`} />
        ))}
      </span>
      {streak}/{FEVER_FREE_DAYS_REQUIRED} fever-free days
    </span>
  );
}

export function DemoTag() {
  return (
    <span className="inline-block -rotate-3 rounded-md border-[1.5px] border-pop px-1.5 font-serif text-[13px] italic leading-tight text-pop">
      demo
    </span>
  );
}
