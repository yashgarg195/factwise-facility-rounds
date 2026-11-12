"use client";

import { useEffect, useRef, useState } from "react";
import { addDays, daysBetween, facilityDate, formatDate, formatDateTime, formatTime } from "@/lib/dates";
import {
  NOTE_MAX_LENGTH,
  TEMP_MAX_C,
  TEMP_MIN_C,
  canConfirmDischarge,
  canRecommend,
  completeVisit,
  confirmDischarge,
  eligibility,
  feverSelectionWarning,
  isActive,
  parseTemperature,
  readingFor,
  recommendDischarge,
  recommendationEvidence,
  recordDeath,
  recordTemperature,
  visitFor,
  withdrawRecommendation,
  type ActionResult,
  type DayCheck,
} from "@/lib/rules";
import type { FacilityState, Patient, Role, TemperatureReading } from "@/lib/types";
import { FEVER_FREE_DAYS_REQUIRED } from "@/lib/types";
import { DemoTag, DischargeBadge, DoctorBadge, TemperatureBadge } from "./badges";
import { Button, Chip, ConfirmButton, Eyebrow, Note } from "./ui";

export type Run = (action: (state: FacilityState, now: Date) => ActionResult) => ActionResult;

interface PanelProps {
  state: FacilityState;
  role: Role;
  today: string;
  patient: Patient;
  run: Run;
  onClose: () => void;
}

export function PatientPanel({ state, role, today, patient, run, onClose }: PanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const active = isActive(patient);
  const dayOfStay = daysBetween(patient.admittedOn, today) + 1;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="panel-title">
      <button type="button" aria-label="Close patient details" className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="drawer relative flex h-full w-full max-w-[560px] flex-col overflow-y-auto bg-paper shadow-[var(--shadow-artifact)]">
        <header className="sticky top-0 z-10 border-b border-hairline bg-paper/95 px-6 pb-5 pt-5 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Eyebrow>
                Room {patient.room} · {patient.id}
              </Eyebrow>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h2 id="panel-title" className="display text-[32px]">
                  {patient.name}
                </h2>
                {patient.isDemo && <DemoTag />}
              </div>
              <p className="num mt-1 text-[15px] text-muted">
                {patient.age} yrs · {patient.sex === "F" ? "Female" : "Male"} · Admitted {formatDate(patient.admittedOn)}
                {active && ` · Day ${dayOfStay}`}
              </p>
            </div>
            <Button ref={closeRef} variant="quiet" size="sm" onClick={onClose} aria-label="Close">
              Close ✕
            </Button>
          </div>
          {active && (
            <div className="mt-3 flex flex-wrap gap-2">
              <TemperatureBadge state={state} patient={patient} today={today} />
              <DoctorBadge state={state} patient={patient} today={today} />
              <DischargeBadge state={state} patient={patient} today={today} />
            </div>
          )}
        </header>

        <div className="space-y-4 px-4 py-5 sm:px-6">
          {!active && (
            <section className="relative rounded-[24px] bg-mist p-5">
              <span className={`stamp ${patient.status === "discharged" ? "stamp-go" : "stamp-ink"}`}>
                {patient.status === "discharged" ? "Discharged" : "Deceased"}
              </span>
              <Eyebrow>Historical record</Eyebrow>
              <p className="mt-2 max-w-[34ch] pr-24 text-[15px] text-muted sm:pr-0">
                {patient.status === "discharged" && patient.dischargedAt && `Discharged ${formatDateTime(patient.dischargedAt)}. `}
                {patient.status === "deceased" && patient.deceasedAt && `Died ${formatDateTime(patient.deceasedAt)}. `}
                No actions are available.
              </p>
            </section>
          )}
          {active && role === "nurse" && <NurseActions state={state} patient={patient} today={today} run={run} />}
          {active && role === "doctor" && <DoctorActions state={state} patient={patient} today={today} run={run} />}
          {active && role === "admin" && <AdminActions state={state} patient={patient} today={today} run={run} />}
          {active && <EligibilityCard state={state} patient={patient} today={today} />}
          <ReadingHistory state={state} patient={patient} today={today} />
          {role !== "nurse" && <RecommendationHistory patient={patient} />}
          <VisitHistory state={state} patient={patient} />
        </div>
      </div>
    </div>
  );
}

/** The one warm surface in the drawer: the action this role came here to do. */
function ActionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rise rounded-[24px] bg-cream p-5 ring-1 ring-inset ring-blush">
      <h3 className="display mb-4 text-[24px]">{title}</h3>
      {children}
    </section>
  );
}

function InfoCard({ title, children, stamp }: { title: string; children: React.ReactNode; stamp?: React.ReactNode }) {
  return (
    <section className="relative rounded-[24px] bg-mist p-5">
      {stamp}
      <h3 className="mb-4 text-[17px] font-medium">{title}</h3>
      {children}
    </section>
  );
}

type ActionProps = { state: FacilityState; patient: Patient; today: string; run: Run };

// ---------- Nurse ----------

function NurseActions({ state, patient, today, run }: ActionProps) {
  const reading = readingFor(state, patient.id, today);
  const [editDate, setEditDate] = useState<string | null>(null);

  if (editDate !== null) {
    const existing = readingFor(state, patient.id, editDate);
    return (
      <ActionCard title="Add or correct a dated reading">
        <label className="mb-4 block text-[15px] font-medium">
          Reading date
          <input type="date" min={patient.admittedOn} max={today} value={editDate} onChange={(event) => setEditDate(event.target.value)}
            className="mt-2 block rounded-[16px] border border-hairline bg-paper px-4 py-2" />
        </label>
        {editDate && editDate >= patient.admittedOn && editDate <= today ? (
          <TemperatureForm key={`${editDate}:${existing?.changes?.length ?? 0}`} patient={patient} existing={existing}
            amendmentDate={editDate} run={run} onDone={() => setEditDate(null)} onCancel={() => setEditDate(null)} />
        ) : <Button variant="ghost" onClick={() => setEditDate(null)}>Cancel</Button>}
      </ActionCard>
    );
  }
  if (reading) {
    const visited = !!visitFor(state, patient.id, today);
    return (
      <ActionCard title="Today's temperature">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="num font-serif text-[52px] leading-none">
              {reading.celsius.toFixed(1)}
              <span className="text-[24px] text-ash"> °C</span>
            </p>
            <p className="mt-2">
              <Chip kind={reading.fever ? "fever" : "go"}>{reading.fever ? "Fever" : "No fever"}</Chip>
            </p>
          </div>
          <p className="num text-[14px] text-muted">
            Recorded {formatTime(reading.recordedAt)}
            {reading.correctedAt && <><br />Corrected {formatTime(reading.correctedAt)}</>}
          </p>
        </div>
        <p className="mt-4 text-[15px] text-muted">Done for today. Do not measure again.</p>
        <div className="mt-4">
          <Button variant="ghost" size="sm" onClick={() => setEditDate(today)}>
            Correct reading
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditDate(addDays(today, -1))} disabled={today === patient.admittedOn}>
            Add or correct a past reading
          </Button>
          {visited && <p className="mt-2 text-[13px] text-sienna">The doctor already visited today. Tell the doctor about any correction.</p>}
        </div>
      </ActionCard>
    );
  }
  return (
    <ActionCard title="Record today's temperature">
      <TemperatureForm patient={patient} run={run} onDone={() => setEditDate(null)} />
      {today > patient.admittedOn && <Button className="mt-3" variant="ghost" size="sm" onClick={() => setEditDate(addDays(today, -1))}>
        Add or correct a past reading
      </Button>}
    </ActionCard>
  );
}

function TemperatureForm({
  patient,
  existing,
  amendmentDate,
  run,
  onDone,
  onCancel,
}: {
  patient: Patient;
  existing?: TemperatureReading;
  amendmentDate?: string;
  run: Run;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [celsius, setCelsius] = useState(existing ? existing.celsius.toFixed(1) : "");
  const [fever, setFever] = useState<boolean | null>(existing ? existing.fever : null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");

  const parsed = celsius ? parseTemperature(celsius) : {};
  const warning = parsed.value !== undefined && fever !== null ? feverSelectionWarning(parsed.value, fever) : null;

  const save = () => {
    const result = run((s, now) =>
      recordTemperature(s, "nurse", { patientId: patient.id, celsius, fever, amendment: amendmentDate ? {
        date: amendmentDate, reason, expectedRevision: existing ? existing.changes?.length ?? 0 : null,
      } : undefined }, now),
    );
    if (result.ok) onDone();
    else {
      setError(result.error);
      setConfirming(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const check = parseTemperature(celsius);
    if (check.error) return setError(check.error);
    if (fever === null) return setError("Select Fever or No fever.");
    if (amendmentDate && !reason.trim()) return setError("Enter a reason for the change.");
    if (amendmentDate) return setConfirming(true);
    save();
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div>
        <label htmlFor="temp" className="text-[15px] font-medium">
          Temperature
        </label>
        <div className="mt-2 flex items-baseline gap-2">
          <input
            id="temp"
            inputMode="decimal"
            autoComplete="off"
            placeholder="37.2"
            value={celsius}
            onChange={(e) => {
              setCelsius(e.target.value);
              setConfirming(false);
            }}
            aria-describedby="temp-help"
            aria-invalid={!!error}
            className="num h-16 w-36 rounded-[16px] border border-hairline bg-paper px-4 font-serif text-[36px] placeholder:text-smoke focus:border-ink focus:outline-none"
          />
          <span className="font-serif text-[24px] text-ash">°C</span>
        </div>
        <p id="temp-help" className="mt-2 text-[13px] text-ash">
          One decimal place. Accepted range {TEMP_MIN_C}–{TEMP_MAX_C} °C.
        </p>
      </div>
      <fieldset>
        <legend className="text-[15px] font-medium">Result</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-sm">
          {[
            { value: false, label: "No fever", on: "bg-go text-paper border-go" },
            { value: true, label: "Fever", on: "bg-sienna text-paper border-sienna" },
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              aria-pressed={fever === opt.value}
              onClick={() => {
                setFever(opt.value);
                setConfirming(false);
              }}
              className={`pill ${fever === opt.value ? opt.on : "pill-ghost border-hairline bg-paper"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </fieldset>
      {amendmentDate && <label className="block text-[15px] font-medium">Reason for change
        <textarea value={reason} onChange={(event) => { setReason(event.target.value); setConfirming(false); }} rows={2} maxLength={200}
          className="mt-2 w-full rounded-[16px] border border-hairline bg-paper px-4 py-3" />
      </label>}
      {warning && <Note tone="warn">{warning}</Note>}
      {error && <Note tone="error">{error}</Note>}
      {confirming && amendmentDate ? (
        <div role="alertdialog" className="rise rounded-[16px] bg-paper p-4 shadow-[var(--shadow-popover)]">
          <p className="num mb-3 text-[15px]">
            Save {celsius} °C ({fever ? "Fever" : "No fever"}) for {formatDate(amendmentDate)}? This may put discharge on hold.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={save}>
              Confirm correction
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Back
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="submit">
            {amendmentDate ? "Save dated reading" : "Save reading"} <span aria-hidden className="arrow">→</span>
          </Button>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      )}
    </form>
  );
}

// ---------- Doctor ----------

function DoctorActions({ state, patient, today, run }: ActionProps) {
  const reading = readingFor(state, patient.id, today);
  const visit = visitFor(state, patient.id, today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recommend = canRecommend(state, patient, today);
  const discharge = canConfirmDischarge(state, patient, today);

  const act = (fn: (s: FacilityState, now: Date) => ActionResult) => {
    setError(null);
    const r = run(fn);
    if (!r.ok) setError(r.error);
    return r;
  };

  return (
    <ActionCard title="Today's visit">
      <div className="space-y-4">
        {!reading && (
          <Note tone="warn">
            <strong className="font-medium">Waiting for temperature.</strong> A nurse must record today&apos;s reading before you can
            complete the visit.
          </Note>
        )}
        {reading && !visit && (
          <>
            <div className="flex items-center gap-3">
              <p className="num font-serif text-[40px] leading-none">
                {reading.celsius.toFixed(1)}
                <span className="text-[20px] text-ash"> °C</span>
              </p>
              <div className="text-[14px] text-muted">
                <Chip kind={reading.fever ? "fever" : "go"}>{reading.fever ? "Fever" : "No fever"}</Chip>
                <p className="num mt-1">Nurse, {formatTime(reading.recordedAt)}</p>
              </div>
            </div>
            <div>
              <label htmlFor="note" className="text-[15px] font-medium">
                Visit note <span className="font-normal text-ash">(optional)</span>
              </label>
              <textarea
                id="note"
                rows={3}
                maxLength={NOTE_MAX_LENGTH}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Treatment given, observations…"
                className="mt-2 w-full rounded-[16px] border border-hairline bg-paper px-4 py-3 text-[15px] placeholder:text-smoke focus:border-ink focus:outline-none"
              />
              <p className="num text-right text-[13px] text-ash">
                {note.length}/{NOTE_MAX_LENGTH}
              </p>
            </div>
            <Button onClick={() => act((s, now) => completeVisit(s, "doctor", { patientId: patient.id, note }, now))}>
              Complete visit <span aria-hidden className="arrow">→</span>
            </Button>
          </>
        )}
        {visit && (
          <Note tone="success">
            Visit completed at {formatTime(visit.completedAt)}.{visit.note && <> Note: “{visit.note}”</>}
          </Note>
        )}

        <div className="border-t border-blush pt-4">
          <h4 className="mb-3 text-[15px] font-medium">Discharge</h4>
          {patient.status === "pending_discharge" && patient.recommendation && (
            <div className="space-y-3">
              {discharge.allowed ? (
                <Note tone="info">
                  You recommended discharge on {formatDateTime(patient.recommendation.recommendedAt)}. Waiting for the Administrator to
                  confirm.
                </Note>
              ) : (
                <Note tone="error">
                  Recommendation from {formatDateTime(patient.recommendation.recommendedAt)}. {discharge.reason}
                </Note>
              )}
              <ConfirmButton
                size="sm"
                label="Withdraw recommendation"
                question="Withdraw the discharge recommendation?"
                confirmLabel="Withdraw"
                onConfirm={() => act((s, now) => withdrawRecommendation(s, "doctor", { patientId: patient.id }, now))}
              />
            </div>
          )}
          {(patient.status === "admitted" || !discharge.allowed) && (
            <div className="space-y-2">
              <Button
                variant={recommend.allowed ? "filled" : "ghost"}
                onClick={() => act((s, now) => recommendDischarge(s, "doctor", {
                  patientId: patient.id, evidence: recommendationEvidence(state, patient.id, today),
                }, now))}
                disabled={!recommend.allowed}
              >
                {patient.recommendation ? "Renew recommendation" : "Recommend discharge"}
              </Button>
              {!recommend.allowed && <p className="text-[14px] text-muted">{recommend.reason}</p>}
            </div>
          )}
        </div>
        {error && <Note tone="error">{error}</Note>}

        <details className="border-t border-blush pt-4 text-[14px]">
          <summary className="cursor-pointer text-muted">Record patient death</summary>
          <div className="mt-3 space-y-3">
            <p className="text-muted">Use only to record a death. This frees the bed and counts in the mortality rate. You cannot undo it.</p>
            <ConfirmButton
              variant="danger"
              size="sm"
              label="Record death"
              question={`Record the death of ${patient.name}? You cannot undo this.`}
              confirmLabel="Yes, record death"
              onConfirm={() => act((s, now) => recordDeath(s, "doctor", { patientId: patient.id }, now))}
            />
          </div>
        </details>
      </div>
    </ActionCard>
  );
}

// ---------- Administrator ----------

function AdminActions({ state, patient, today, run }: ActionProps) {
  const [error, setError] = useState<string | null>(null);
  const check = canConfirmDischarge(state, patient, today);
  return (
    <ActionCard title="Discharge">
      {patient.status !== "pending_discharge" ? (
        <p className="text-[15px] text-muted">No doctor recommendation yet. Only a doctor can recommend discharge.</p>
      ) : (
        <div className="space-y-3">
          {patient.recommendation && (
            <p className="text-[15px]">Doctor recommended discharge on {formatDateTime(patient.recommendation.recommendedAt)}.</p>
          )}
          {check.allowed ? (
            <Note tone="success">Reviewed readings and current eligibility are valid.</Note>
          ) : (
            <Note tone="error">{check.reason}</Note>
          )}
          <ConfirmButton
            disabled={!check.allowed}
            variant="filled"
            label="Confirm discharge"
            question={`Discharge ${patient.name} and free room ${patient.room}?`}
            confirmLabel="Confirm discharge"
            onConfirm={() => {
              setError(null);
              const r = run((s, now) => confirmDischarge(s, "admin", { patientId: patient.id }, now));
              if (!r.ok) setError(r.error);
            }}
          />
          {error && <Note tone="error">{error}</Note>}
        </div>
      )}
    </ActionCard>
  );
}

// ---------- Shared: eligibility timeline and history ----------

function DayNode({ check, label, isToday }: { check: DayCheck; label: string; isToday?: boolean }) {
  const look = {
    no_fever: { dot: "bg-go text-paper", mark: "✓", text: `${check.celsius?.toFixed(1)} °C` },
    fever: { dot: "bg-sienna text-paper", mark: "!", text: `${check.celsius?.toFixed(1)} °C` },
    missing: { dot: "border-2 border-dashed border-pop bg-paper text-pop", mark: "?", text: isToday ? "Awaiting" : "No reading" },
  }[check.result];
  return (
    <li className="relative z-[1] flex flex-col items-center gap-1.5 text-center">
      <span aria-hidden className={`grid size-9 place-items-center rounded-full text-[15px] font-medium ${look.dot} ${isToday ? "opacity-80" : ""}`}>
        {look.mark}
      </span>
      <span className="text-[13px] font-medium">{label}</span>
      <span className="num text-[12px] text-muted">
        {check.result === "fever" ? "Fever " : check.result === "no_fever" ? "No fever " : ""}
        {look.text}
      </span>
    </li>
  );
}

function EligibilityCard({ state, patient, today }: { state: FacilityState; patient: Patient; today: string }) {
  const e = eligibility(state, patient, today);
  const stamp = e.eligible ? (
    <span className="stamp stamp-go">3 days recorded</span>
  ) : e.today.result === "fever" ? (
    <span className="stamp stamp-pop">Fever</span>
  ) : null;
  return (
    <InfoCard title="Discharge eligibility" stamp={stamp}>
      <p className="mb-5 max-w-[38ch] pr-28 text-[15px] text-muted">
        {e.eligible ? (
          <>
            <strong className="font-medium text-go">3 completed days with no fever recorded.</strong>
          </>
        ) : (
          <>
            <strong className="font-medium text-sienna">Not eligible.</strong> {e.blockers.join("; ")}.
          </>
        )}
      </p>
      <ol className="relative grid grid-cols-4" aria-label="Last three completed days and today">
        <span aria-hidden className="absolute left-[12.5%] right-[12.5%] top-[18px] h-[2px] bg-hairline" />
        {e.days.map((d) => (
          <DayNode key={d.date} check={d} label={formatDate(d.date)} />
        ))}
        <DayNode check={e.today} label="Today" isToday />
      </ol>
      <p className="mt-5 text-[13px] leading-relaxed text-ash">
        Rule: the {FEVER_FREE_DAYS_REQUIRED} completed facility days (IST) before today must each have a No fever reading. The admission date is excluded. Today counts
        only after midnight. A fever today blocks discharge. Current streak: {e.streak} day{e.streak === 1 ? "" : "s"}.
      </p>
    </InfoCard>
  );
}

function ReadingHistory({ state, patient, today }: { state: FacilityState; patient: Patient; today: string }) {
  const last = isActive(patient) ? today : facilityDate(new Date(patient.dischargedAt ?? patient.deceasedAt ?? `${today}T12:00:00Z`));
  const first = [addDays(last, -9), patient.admittedOn].sort()[1];
  const days: string[] = [];
  const changes = state.readings.filter((r) => r.patientId === patient.id && r.changes?.length)
    .sort((a, b) => b.date.localeCompare(a.date));
  for (let d = last; d >= first; d = addDays(d, -1)) days.push(d);
  if (days.length === 0) return null;
  return (
    <InfoCard title="Temperature history">
      <table className="num w-full text-[14px]">
        <thead>
          <tr className="text-left text-[13px] text-ash">
            <th className="pb-2 font-normal">Date</th>
            <th className="pb-2 font-normal">Reading</th>
            <th className="pb-2 text-right font-normal">Recorded</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {days.map((d) => {
            const r = readingFor(state, patient.id, d);
            return (
              <tr key={d}>
                <td className="py-2 pr-2">{d === today ? "Today" : formatDate(d)}</td>
                <td className="py-2 pr-2">
                  {r ? (
                    <Chip kind={r.fever ? "fever" : "go"}>
                      {r.celsius.toFixed(1)} °C · {r.fever ? "Fever" : "No fever"}
                    </Chip>
                  ) : (
                    <Chip kind="todo">{d === today ? "Awaiting reading" : "No reading"}</Chip>
                  )}
                </td>
                <td className="py-2 text-right text-[13px] text-muted">
                  {r && formatTime(r.recordedAt)}
                  {r?.correctedAt && r.previous && (
                    <span className="block text-sienna">
                      corrected {formatTime(r.correctedAt)}, was {r.previous.celsius.toFixed(1)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {changes.length > 0 && <div className="mt-4 border-t border-hairline pt-3">
        <h4 className="font-medium">Dated reading changes</h4>
        <ul className="mt-2 divide-y divide-hairline text-[14px]">
          {changes.flatMap((reading) => [...(reading.changes ?? [])].reverse().map((change, index) =>
            <li key={`${reading.id}:${index}`} className="py-2">
              <p>{formatDate(reading.date)} · Saved {formatDateTime(change.at)}</p>
              <p className="text-muted">
                {change.previous ? `${change.previous.celsius.toFixed(1)} °C, ${change.previous.fever ? "Fever" : "No fever"}` : "Missing reading"}
                {" → "}{change.next.celsius.toFixed(1)} °C, {change.next.fever ? "Fever" : "No fever"} · {change.reason}
              </p>
            </li>))}
        </ul>
      </div>}
    </InfoCard>
  );
}

function RecommendationHistory({ patient }: { patient: Patient }) {
  const history = [...(patient.recommendationHistory ?? []), ...(patient.recommendation ? [patient.recommendation] : [])];
  if (!history.length) return null;
  return (
    <InfoCard title="Recommendation history">
      <ul className="divide-y divide-hairline text-[14px]">
        {history.reverse().map((entry, index) => <li key={`${entry.recommendedAt}:${index}`} className="py-2">
          <p>Recommended {formatDateTime(entry.recommendedAt)}</p>
          <p className="text-muted">{entry.review
            ? `${formatDateTime(entry.review.at)} · ${entry.review.reason}`
            : patient.status === "discharged" ? "Used for discharge" : entry.evidence ? "Readings reviewed" : "Reading versions unavailable"}</p>
        </li>)}
      </ul>
    </InfoCard>
  );
}

function VisitHistory({ state, patient }: { state: FacilityState; patient: Patient }) {
  const visits = state.visits
    .filter((v) => v.patientId === patient.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);
  return (
    <InfoCard title="Doctor visits">
      {visits.length === 0 ? (
        <p className="text-[15px] text-muted">No visits recorded.</p>
      ) : (
        <ol className="space-y-3 border-l-2 border-hairline pl-4 text-[14px]">
          {visits.map((v) => (
            <li key={v.id} className="relative">
              <span aria-hidden className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-ink" />
              <span className="num text-[13px] text-ash">
                {formatDate(v.date)} · {formatTime(v.completedAt)}
              </span>
              <p>{v.note ?? <span className="text-smoke">No note</span>}</p>
            </li>
          ))}
        </ol>
      )}
    </InfoCard>
  );
}
