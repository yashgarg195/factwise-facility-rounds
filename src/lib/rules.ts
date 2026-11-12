import { addDays, daysBetween, facilityDate, formatDate, formatTime } from "./dates.ts";
import {
  CAPACITY,
  FEVER_FREE_DAYS_REQUIRED,
  MORTALITY_BENCHMARK,
  ROLE_LABELS,
  type DoctorVisit,
  type FacilityState,
  type Patient,
  type Role,
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
    days.push(checkDay(state, p.id, addDays(today, -n)));
  }
  const todayCheck = checkDay(state, p.id, today);
  const blockers: string[] = [];
  for (const d of days) {
    if (d.result === "missing") blockers.push(`No reading on ${formatDate(d.date)}`);
    if (d.result === "fever") blockers.push(`Fever on ${formatDate(d.date)}`);
  }
  if (todayCheck.result === "fever") blockers.push("Fever recorded today");

  let streak = 0;
  const stayDays = Math.max(0, daysBetween(p.admittedOn, today));
  for (let n = 1; n <= stayDays; n++) {
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
  if (p.status === "pending_discharge") return { allowed: false, reason: "Discharge already recommended." };
  if (p.status !== "admitted") return { allowed: false, reason: "Patient is not active." };
  const e = eligibility(state, p, today);
  if (!e.eligible) return { allowed: false, reason: `Not eligible: ${e.blockers.join("; ")}.` };
  if (!visitFor(state, p.id, today)) {
    return { allowed: false, reason: "Complete today's visit before you recommend discharge." };
  }
  return { allowed: true };
}

export function canConfirmDischarge(state: FacilityState, p: Patient, today: string): Check {
  if (p.status === "discharged") return { allowed: false, reason: "Patient is already discharged." };
  if (p.status !== "pending_discharge") {
    return { allowed: false, reason: "A doctor has not recommended discharge." };
  }
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
  correction?: boolean;
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
  const existing = readingFor(state, p.id, today);
  const at = now.toISOString();

  if (existing && !input.correction) {
    return fail(
      `Today's temperature is already recorded (${existing.celsius.toFixed(1)} °C at ${formatTime(existing.recordedAt)}). Use "Correct reading" to change it.`,
    );
  }
  if (!existing && input.correction) return fail("There is no reading today to correct.");

  if (existing) {
    if (existing.celsius === parsed.value && existing.fever === input.fever) {
      return fail("The correction is the same as the saved reading.");
    }
    const corrected: TemperatureReading = {
      ...existing,
      celsius: parsed.value,
      fever: input.fever,
      correctedAt: at,
      previous: existing.previous ?? { celsius: existing.celsius, fever: existing.fever },
    };
    return {
      ok: true,
      state: { ...state, readings: state.readings.map((r) => (r.id === existing.id ? corrected : r)) },
      message: `Corrected today's reading for ${p.name}.`,
    };
  }

  const [id, nextRecordNumber] = nextId(state, "T");
  const reading: TemperatureReading = {
    id,
    patientId: p.id,
    date: today,
    celsius: parsed.value,
    fever: input.fever,
    recordedAt: at,
  };
  return {
    ok: true,
    state: { ...state, nextRecordNumber, readings: [...state.readings, reading] },
    message: `Saved ${parsed.value.toFixed(1)} °C (${input.fever ? "Fever" : "No fever"}) for ${p.name}.`,
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
  input: { patientId: string },
  now: Date,
): ActionResult {
  const roleError = requireRole(role, "doctor");
  if (roleError) return fail(roleError);
  const p = findActive(state, input.patientId);
  if (typeof p === "string") return fail(p);
  const today = facilityDate(now);
  const check = canRecommend(state, p, today);
  if (!check.allowed) return fail(check.reason ?? "Discharge cannot be recommended.");
  return {
    ok: true,
    state: {
      ...state,
      patients: updatePatient(state, p.id, {
        status: "pending_discharge",
        recommendation: { recommendedAt: now.toISOString(), facilityDate: today },
      }),
    },
    message: `Discharge recommended for ${p.name}. Sent to Administrator.`,
  };
}

export function withdrawRecommendation(
  state: FacilityState,
  role: Role,
  input: { patientId: string },
): ActionResult {
  const roleError = requireRole(role, "doctor");
  if (roleError) return fail(roleError);
  const p = findActive(state, input.patientId);
  if (typeof p === "string") return fail(p);
  if (p.status !== "pending_discharge") return fail("There is no recommendation to withdraw.");
  return {
    ok: true,
    state: { ...state, patients: updatePatient(state, p.id, { status: "admitted", recommendation: undefined }) },
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
