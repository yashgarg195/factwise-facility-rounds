import { addDays, daysBetween, facilityDate, formatDate, formatTime } from "./dates.ts";
import {
  CAPACITY,
  FEVER_FREE_DAYS_REQUIRED,
  MORTALITY_BENCHMARK,
  ROLE_LABELS,
  type DoctorVisit,
  type DischargeRecommendation,
  type FacilityState,
  type Patient,
  type Role,
  type ReadingVersion,
  type TemperatureReading,
} from "./types.ts";

// Demo validation only: values outside this range are almost surely typing errors.
export const TEMP_MIN_C = 34;
export const TEMP_MAX_C = 43;
export const NOTE_MAX_LENGTH = 500;

export type ActionResult =
  | { ok: true; state: FacilityState; message: string }
  | { ok: false; error: string };

const fail = (error: string): ActionResult => ({ ok: false, error });

// ---------- Queries ----------

export function isActive(p: Patient): boolean {
  return p.status === "admitted" || p.status === "pending_discharge";
}

export function activePatients(state: FacilityState): Patient[] {
  return state.patients.filter(isActive);
}

export function readingFor(state: FacilityState, patientId: string, date: string) {
  return state.readings.find((r) => r.patientId === patientId && r.date === date);
}

export function visitFor(state: FacilityState, patientId: string, date: string) {
  return state.visits.find((v) => v.patientId === patientId && v.date === date);
}

export type DoctorStatus = "waiting_for_temperature" | "ready_for_visit" | "visit_complete";

export const DOCTOR_STATUS_LABELS: Record<DoctorStatus, string> = {
  waiting_for_temperature: "Waiting for temperature",
  ready_for_visit: "Ready for visit",
  visit_complete: "Visit complete",
};

export function doctorStatus(state: FacilityState, p: Patient, today: string): DoctorStatus {
  if (visitFor(state, p.id, today)) return "visit_complete";
  if (readingFor(state, p.id, today)) return "ready_for_visit";
  return "waiting_for_temperature";
}

export type DayResult = "no_fever" | "fever" | "missing";

export interface DayCheck {
  date: string;
  result: DayResult;
  celsius?: number;
}

export interface Eligibility {
  eligible: boolean;
  /** The three completed facility days before today, oldest first. */
  days: DayCheck[];
  /** Today's result. Today never counts toward the streak. */
  today: DayCheck;
  blockers: string[];
  /** Consecutive completed No-fever days ending yesterday. */
  streak: number;
}

function checkDay(state: FacilityState, patientId: string, date: string): DayCheck {
  const r = readingFor(state, patientId, date);
  if (!r) return { date, result: "missing" };
  return { date, result: r.fever ? "fever" : "no_fever", celsius: r.celsius };
}

/**
 * "3 full days without a fever" = the 3 completed facility calendar days just before
 * today each have a recorded No-fever reading. A fever or a missing record breaks it.
 * A fever recorded today also blocks discharge.
 */
export function eligibility(state: FacilityState, p: Patient, today: string): Eligibility {
  const days: DayCheck[] = [];
  for (let n = FEVER_FREE_DAYS_REQUIRED; n >= 1; n--) {
    const date = addDays(today, -n);
    days.push(date > p.admittedOn ? checkDay(state, p.id, date) : { date, result: "missing" });
  }
  const todayCheck = checkDay(state, p.id, today);
  const blockers: string[] = [];
  for (const d of days) {
    if (d.date <= p.admittedOn) blockers.push(`${formatDate(d.date)} is on or before the admission date`);
    else if (d.result === "missing") blockers.push(`No reading on ${formatDate(d.date)}`);
    if (d.result === "fever") blockers.push(`Fever on ${formatDate(d.date)}`);
  }
  if (todayCheck.result === "fever") blockers.push("Fever recorded today");

  let streak = 0;
  const stayDays = Math.max(0, daysBetween(p.admittedOn, today));
  for (let n = 1; n < stayDays; n++) {
    if (checkDay(state, p.id, addDays(today, -n)).result !== "no_fever") break;
    streak++;
  }
  return { eligible: blockers.length === 0, days, today: todayCheck, blockers, streak };
}

export interface Check {
  allowed: boolean;
  reason?: string;
}

export function canRecommend(state: FacilityState, p: Patient, today: string): Check {
  if (!isActive(p)) return { allowed: false, reason: "Patient is not active." };
  if (p.status === "pending_discharge" && canConfirmDischarge(state, p, today).allowed) {
    return { allowed: false, reason: "Discharge already recommended." };
  }
  const e = eligibility(state, p, today);
  if (!e.eligible) return { allowed: false, reason: `Not eligible: ${e.blockers.join("; ")}.` };
  if (e.today.result === "missing") return { allowed: false, reason: "Record today's temperature before recommending discharge." };
  if (!visitFor(state, p.id, today)) {
    return { allowed: false, reason: "Complete today's visit before you recommend discharge." };
  }
  return { allowed: true };
}

export function recommendationEvidence(state: FacilityState, patientId: string, today: string): ReadingVersion[] {
  return Array.from({ length: FEVER_FREE_DAYS_REQUIRED + 1 }, (_, offset) => {
    const date = addDays(today, -offset);
    return { date, revision: readingFor(state, patientId, date)?.changes?.length ?? 0 };
  });
}

function reviewReason(state: FacilityState, p: Patient, recommendation: DischargeRecommendation, today: string) {
  if (recommendation.review) return recommendation.review.reason;
  const laterFever = state.readings.find((r) => r.patientId === p.id && r.date > recommendation.facilityDate && r.date <= today && r.fever);
  if (laterFever) return `Fever recorded on ${formatDate(laterFever.date)} after recommendation.`;
  if (recommendation.evidence?.length !== FEVER_FREE_DAYS_REQUIRED + 1) {
    return "The doctor must review the readings for this older recommendation.";
  }
  for (const { date, revision } of recommendation.evidence) {
    const reading = readingFor(state, p.id, date);
    if (reading?.fever !== false || (reading.changes?.length ?? 0) !== revision) {
      return `The reviewed reading for ${formatDate(date)} changed. The doctor must review it.`;
    }
  }
  return null;
}

export function canConfirmDischarge(state: FacilityState, p: Patient, today: string): Check {
  if (p.status === "discharged") return { allowed: false, reason: "Patient is already discharged." };
  if (p.status !== "pending_discharge" || !p.recommendation) {
    return { allowed: false, reason: "A doctor has not recommended discharge." };
  }
  const reason = reviewReason(state, p, p.recommendation, today);
  if (reason) return { allowed: false, reason: `Recommendation is no longer valid: ${reason}` };
  const e = eligibility(state, p, today);
  if (!e.eligible) {
    return {
      allowed: false,
      reason: `Recommendation is no longer valid: ${e.blockers.join("; ")}. The doctor must review it.`,
    };
  }
  return { allowed: true };
}

export function parseTemperature(raw: string): { value?: number; error?: string } {
  const text = raw.trim().replace(",", ".");
  if (text === "") return { error: "Enter the temperature in °C." };
  if (!/^\d{2}(\.\d)?$/.test(text)) {
    return { error: "Use a number with at most one decimal place, for example 37.2." };
  }
  const value = Number(text);
  if (value < TEMP_MIN_C || value > TEMP_MAX_C) {
    return { error: `Temperature must be between ${TEMP_MIN_C} and ${TEMP_MAX_C} °C. Measure again.` };
  }
  return { value };
}

/** Soft check only. The nurse's explicit Fever / No fever choice is the record. */
export function feverSelectionWarning(celsius: number, fever: boolean): string | null {
  if (!fever && celsius >= 38) return `${celsius.toFixed(1)} °C is marked No fever. Check before you save.`;
  if (fever && celsius < 37.5) return `${celsius.toFixed(1)} °C is marked Fever. Check before you save.`;
  return null;
}

export function occupancy(state: FacilityState) {
  const active = activePatients(state);
  return {
    occupied: active.length,
    capacity: CAPACITY,
    available: CAPACITY - active.length,
    pending: active.filter((p) => p.status === "pending_discharge").length,
  };
}

export function outcomes(state: FacilityState) {
  const discharged = state.patients.filter((p) => p.status === "discharged");
  const deceased = state.patients.filter((p) => p.status === "deceased");
  const completed = discharged.length + deceased.length;
  const mortalityRate = completed ? deceased.length / completed : null;
  const successRate = completed ? discharged.length / completed : null;
  const stays = discharged.map((p) =>
    daysBetween(p.admittedOn, facilityDate(new Date(p.dischargedAt ?? p.admittedOn))),
  );
  return {
    discharged: discharged.length,
    deceased: deceased.length,
    completed,
    mortalityRate,
    successRate,
    mortalityAboveBenchmark: mortalityRate !== null && mortalityRate > MORTALITY_BENCHMARK,
    averageStayDays: stays.length ? stays.reduce((a, b) => a + b, 0) / stays.length : null,
  };
}

// ---------- Actions (the only way the UI changes data) ----------

function requireRole(role: Role, allowed: Role): string | null {
  if (role === allowed) return null;
  const article = allowed === "admin" ? "an" : "a";
  return `Only ${article} ${ROLE_LABELS[allowed]} can do this.`;
}

function findActive(state: FacilityState, patientId: string): Patient | string {
  const p = state.patients.find((x) => x.id === patientId);
  if (!p) return "Patient not found.";
  if (!isActive(p)) return `${p.name} is no longer active (${p.status}).`;
  return p;
}

function nextId(state: FacilityState, prefix: string): [string, number] {
  return [`${prefix}-${state.nextRecordNumber}`, state.nextRecordNumber + 1];
}

function updatePatient(state: FacilityState, id: string, patch: Partial<Patient>): Patient[] {
  return state.patients.map((p) => (p.id === id ? { ...p, ...patch } : p));
}

export interface TemperatureInput {
  patientId: string;
  celsius: string;
  fever: boolean | null;
  amendment?: { date: string; reason: string; expectedRevision: number | null };
}

export function recordTemperature(
  state: FacilityState,
  role: Role,
  input: TemperatureInput,
  now: Date,
): ActionResult {
  const roleError = requireRole(role, "nurse");
  if (roleError) return fail(roleError);
  const p = findActive(state, input.patientId);
  if (typeof p === "string") return fail(p);
  const parsed = parseTemperature(input.celsius);
  if (parsed.error || parsed.value === undefined) return fail(parsed.error ?? "Invalid temperature.");
  if (input.fever === null) return fail("Select Fever or No fever.");

  const today = facilityDate(now);
  const date = input.amendment?.date ?? today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < p.admittedOn || date > today || addDays(date, 0) !== date) {
    return fail("Choose a valid date from admission through today.");
  }
  const existing = readingFor(state, p.id, date);
  const at = now.toISOString();
  const values = { celsius: parsed.value, fever: input.fever };
  const amendment = input.amendment;

  if (existing && !amendment) {
    return fail(
      `Today's temperature is already recorded (${existing.celsius.toFixed(1)} °C at ${formatTime(existing.recordedAt)}). Use "Correct reading" to change it.`,
    );
  }
  const reason = amendment?.reason.trim();
  if (amendment) {
    if (!reason || reason.length > 200) return fail("Enter a reason of 1 to 200 characters.");
    if (amendment.expectedRevision !== (existing ? existing.changes?.length ?? 0 : null)) {
      return fail("This reading changed. Reopen it and review the latest values.");
    }
    if (existing?.celsius === values.celsius && existing.fever === values.fever) return fail("The correction is the same as the saved reading.");
  }

  const [id, nextRecordNumber] = existing ? [existing.id, state.nextRecordNumber] : nextId(state, "T");
  const previous = existing ? { celsius: existing.celsius, fever: existing.fever } : null;
  const reading: TemperatureReading = {
    ...existing,
    id,
    patientId: p.id,
    date,
    ...values,
    recordedAt: existing?.recordedAt ?? at,
    ...(reason && {
      correctedAt: at,
      changes: [...(existing?.changes ?? []), { at, reason, previous, next: values }],
    }),
  };
  const readings = existing ? state.readings.map((r) => r.id === id ? reading : r) : [...state.readings, reading];
  const next = { ...state, nextRecordNumber, readings };
  if (p.recommendation && !p.recommendation.review) {
    const hold = reviewReason(next, p, p.recommendation, today);
    if (hold) next.patients = updatePatient(next, p.id, { recommendation: { ...p.recommendation, review: { at, reason: hold } } });
  }
  return {
    ok: true,
    state: next,
    message: amendment ? `Saved the reading for ${formatDate(date)} for ${p.name}.`
      : `Saved ${parsed.value.toFixed(1)} °C (${input.fever ? "Fever" : "No fever"}) for ${p.name}.`,
  };
}

export function completeVisit(
  state: FacilityState,
  role: Role,
  input: { patientId: string; note?: string },
  now: Date,
): ActionResult {
  const roleError = requireRole(role, "doctor");
  if (roleError) return fail(roleError);
  const p = findActive(state, input.patientId);
  if (typeof p === "string") return fail(p);
  const today = facilityDate(now);
  if (!readingFor(state, p.id, today)) {
    return fail("Today's temperature is not recorded yet. A nurse must record it before the visit.");
  }
  const done = visitFor(state, p.id, today);
  if (done) return fail(`Today's visit is already complete (${formatTime(done.completedAt)}).`);
  const note = input.note?.trim() ?? "";
  if (note.length > NOTE_MAX_LENGTH) return fail(`Keep the note to ${NOTE_MAX_LENGTH} characters or fewer.`);

  const [id, nextRecordNumber] = nextId(state, "V");
  const visit: DoctorVisit = {
    id,
    patientId: p.id,
    date: today,
    completedAt: now.toISOString(),
    ...(note ? { note } : {}),
  };
  return {
    ok: true,
    state: { ...state, nextRecordNumber, visits: [...state.visits, visit] },
    message: `Visit complete for ${p.name}.`,
  };
}

export function recommendDischarge(
  state: FacilityState,
  role: Role,
  input: { patientId: string; evidence: ReadingVersion[] },
  now: Date,
): ActionResult {
  const roleError = requireRole(role, "doctor");
  if (roleError) return fail(roleError);
  const p = findActive(state, input.patientId);
  if (typeof p === "string") return fail(p);
  const today = facilityDate(now);
  const check = canRecommend(state, p, today);
  if (!check.allowed) return fail(check.reason ?? "Discharge cannot be recommended.");
  const evidence = recommendationEvidence(state, p.id, today);
  if (input.evidence.length !== evidence.length || evidence.some(({ date, revision }, index) =>
    date !== input.evidence[index].date || revision !== input.evidence[index].revision)) {
    return fail("The readings changed. Review the latest readings before recommending discharge.");
  }
  const at = now.toISOString();
  return {
    ok: true,
    state: {
      ...state,
      patients: updatePatient(state, p.id, {
        status: "pending_discharge",
        recommendationHistory: archiveRecommendation(p, at, "Replaced after doctor review."),
        recommendation: { recommendedAt: at, facilityDate: today, evidence },
      }),
    },
    message: `Discharge recommended for ${p.name}. Sent to Administrator.`,
  };
}

function archiveRecommendation(p: Patient, at: string, reason: string) {
  const history = p.recommendationHistory ?? [];
  const recommendation = p.recommendation;
  return recommendation ? [...history, { ...recommendation, review: recommendation.review ?? { at, reason } }] : history;
}

export function withdrawRecommendation(
  state: FacilityState,
  role: Role,
  input: { patientId: string },
  now: Date,
): ActionResult {
  const roleError = requireRole(role, "doctor");
  if (roleError) return fail(roleError);
  const p = findActive(state, input.patientId);
  if (typeof p === "string") return fail(p);
  if (p.status !== "pending_discharge") return fail("There is no recommendation to withdraw.");
  return {
    ok: true,
    state: { ...state, patients: updatePatient(state, p.id, {
      status: "admitted", recommendation: undefined,
      recommendationHistory: archiveRecommendation(p, now.toISOString(), "Withdrawn by the doctor."),
    }) },
    message: `Recommendation withdrawn for ${p.name}. You can recommend again when the patient is eligible.`,
  };
}

export function confirmDischarge(
  state: FacilityState,
  role: Role,
  input: { patientId: string },
  now: Date,
): ActionResult {
  const roleError = requireRole(role, "admin");
  if (roleError) return fail(roleError);
  const p = state.patients.find((x) => x.id === input.patientId);
  if (!p) return fail("Patient not found.");
  const check = canConfirmDischarge(state, p, facilityDate(now));
  if (!check.allowed) return fail(check.reason ?? "Discharge cannot be confirmed.");
  return {
    ok: true,
    state: {
      ...state,
      patients: updatePatient(state, p.id, { status: "discharged", dischargedAt: now.toISOString() }),
    },
    message: `${p.name} discharged. Room ${p.room} is now free.`,
  };
}

export function recordDeath(
  state: FacilityState,
  role: Role,
  input: { patientId: string },
  now: Date,
): ActionResult {
  const roleError = requireRole(role, "doctor");
  if (roleError) return fail(roleError);
  const p = findActive(state, input.patientId);
  if (typeof p === "string") return fail(p);
  return {
    ok: true,
    state: {
      ...state,
      patients: updatePatient(state, p.id, {
        status: "deceased",
        deceasedAt: now.toISOString(),
        recommendation: undefined,
        recommendationHistory: archiveRecommendation(p, now.toISOString(), "Closed when death was recorded."),
      }),
    },
    message: `Death recorded for ${p.name}. Room ${p.room} is now free.`,
  };
}

export interface AdmitInput {
  name: string;
  age: string;
  sex: "F" | "M" | "";
}

export function admitPatient(state: FacilityState, role: Role, input: AdmitInput, now: Date): ActionResult {
  const roleError = requireRole(role, "admin");
  if (roleError) return fail(roleError);
  const { available } = occupancy(state);
  if (available <= 0) return fail(`All ${CAPACITY} beds are occupied. Discharge a patient first.`);
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 60) return fail("Enter the patient's name (2 to 60 characters).");
  if (!/^\d{1,3}$/.test(input.age.trim()) || Number(input.age) > 120) {
    return fail("Enter an age from 0 to 120.");
  }
  if (input.sex !== "F" && input.sex !== "M") return fail("Select the patient's sex.");

  const usedRooms = new Set(activePatients(state).map((p) => p.room));
  let room = 1;
  while (usedRooms.has(room)) room++;
  const patient: Patient = {
    id: `P-${state.nextPatientNumber}`,
    name,
    age: Number(input.age),
    sex: input.sex,
    room,
    admittedOn: facilityDate(now),
    status: "admitted",
  };
  return {
    ok: true,
    state: { ...state, nextPatientNumber: state.nextPatientNumber + 1, patients: [...state.patients, patient] },
    message: `${name} admitted to room ${room}.`,
  };
}
