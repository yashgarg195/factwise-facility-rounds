import { addDays, daysBetween, facilityDate, facilityInstant } from "./dates.ts";
import type { DoctorVisit, FacilityState, Patient, TemperatureReading } from "./types.ts";
import { CAPACITY } from "./types.ts";

// Synthetic names only. No real patient data.
const FIRST_F = ["Priya", "Kavya", "Meera", "Ananya", "Divya", "Neha", "Pooja", "Riya", "Sneha", "Isha", "Lakshmi", "Fatima", "Sara", "Nisha", "Aditi", "Tara"];
const FIRST_M = ["Rahul", "Arjun", "Vikram", "Rohan", "Karan", "Imran", "Suresh", "Amit", "Nikhil", "Manoj", "Joseph", "Farhan", "Dev", "Varun", "Kabir", "Sanjay"];
const LAST = ["Sharma", "Iyer", "Nair", "Reddy", "Khan", "Patel", "Gupta", "Das", "Menon", "Singh", "Joshi", "Bose", "Pillai", "Kulkarni", "Mehta", "Rao", "Thomas", "Chopra", "Banerjee", "Hegde"];

const DOCTOR_NOTES = [
  "Hydration good. Continue current treatment.",
  "Fever trending down. Continue antipyretics.",
  "Mild cough. Monitor oxygen saturation.",
  "Appetite better today.",
  "Started second-line treatment.",
];

/** Deterministic random numbers so every reset gives the same demo. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSeedState(now: Date): FacilityState {
  const rand = mulberry32(20261112);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const between = (lo: number, hi: number) => Math.round((lo + rand() * (hi - lo)) * 10) / 10;
  const today = facilityDate(now);

  // Seeded "today" events must be in the past, even right after midnight.
  const dayStart = new Date(facilityInstant(today, 0, 0)).getTime();
  const elapsed = Math.max(60_000, now.getTime() - dayStart);
  const todayAt = (fraction: number) => new Date(dayStart + elapsed * fraction).toISOString();

  const patients: Patient[] = [];
  const readings: TemperatureReading[] = [];
  const visits: DoctorVisit[] = [];
  let record = 1;
  let patientNumber = 1001;

  const addReading = (patientId: string, date: string, fever: boolean, celsius?: number) => {
    readings.push({
      id: `T-${record++}`,
      patientId,
      date,
      fever,
      celsius: celsius ?? (fever ? between(38.0, 39.6) : between(36.3, 37.3)),
      recordedAt: date === today ? todayAt(0.3) : facilityInstant(date, 8 + Math.floor(rand() * 3), Math.floor(rand() * 60)),
    });
  };
  const addVisit = (patientId: string, date: string, note?: string) => {
    visits.push({
      id: `V-${record++}`,
      patientId,
      date,
      completedAt: date === today ? todayAt(0.6) : facilityInstant(date, 12 + Math.floor(rand() * 4), Math.floor(rand() * 60)),
      ...(note ? { note } : {}),
    });
  };
  const newPatient = (room: number, admittedDaysAgo: number, extra: Partial<Patient> = {}): Patient => {
    const sex = rand() < 0.5 ? "F" : "M";
    const p: Patient = {
      id: `P-${patientNumber++}`,
      name: `${pick(sex === "F" ? FIRST_F : FIRST_M)} ${pick(LAST)}`,
      age: 18 + Math.floor(rand() * 60),
      sex,
      room,
      admittedOn: addDays(today, -admittedDaysAgo),
      status: "admitted",
      ...extra,
    };
    patients.push(p);
    return p;
  };
  /** History from admission to yesterday. fevers = days-ago values that had a fever. */
  const history = (p: Patient, opts: { fevers: number[]; missing?: number[]; skipVisits?: number[] }) => {
    for (let date = p.admittedOn; date < today; date = addDays(date, 1)) {
      const ago = daysBetween(date, today);
      if (opts.missing?.includes(ago)) continue;
      addReading(p.id, date, opts.fevers.includes(ago));
      if (!opts.skipVisits?.includes(ago)) addVisit(p.id, date, rand() < 0.4 ? pick(DOCTOR_NOTES) : undefined);
    }
  };

  // Room 1: the guided demo patient. 3 completed No-fever days, today pending.
  const demo = newPatient(1, 6, { name: "Asha Verma", age: 34, sex: "F", isDemo: true });
  history(demo, { fevers: [6, 5, 4] });

  // Room 2: a missing reading two days ago breaks the streak.
  const missing = newPatient(2, 7);
  history(missing, { fevers: [7, 6, 5], missing: [2] });

  // Room 3: a fever yesterday breaks the streak.
  const fever = newPatient(3, 6);
  history(fever, { fevers: [6, 5, 1] });

  // Room 4: today's temperature is already recorded; the doctor has not visited.
  const recorded = newPatient(4, 5);
  history(recorded, { fevers: [5, 4, 3, 2] });
  addReading(recorded.id, today, true, 38.4);

  // Room 5: today's reading and visit are both complete.
  const visited = newPatient(5, 4);
  history(visited, { fevers: [4, 3, 2, 1] });
  addReading(visited.id, today, true, 38.9);
  addVisit(visited.id, today, "Fever persists. Escalated treatment.");

  // Room 6: recommended yesterday, but a fever today makes the recommendation stale.
  const stale = newPatient(6, 9, {
    status: "pending_discharge",
    recommendation: {
      recommendedAt: facilityInstant(addDays(today, -1), 14, 10),
      facilityDate: addDays(today, -1),
      evidence: [1, 2, 3, 4].map((offset) => ({ date: addDays(today, -offset), revision: 0 })),
      review: { at: todayAt(0.2), reason: "Fever recorded after recommendation. The doctor must review it." },
    },
  });
  history(stale, { fevers: [9, 8, 7, 6] });
  addReading(stale.id, today, true, 38.2);

  // Rooms 7..74: a realistic mix. Most still have fevers; a few are recovering.
  for (let room = 7; room <= CAPACITY; room++) {
    const stay = 1 + Math.floor(rand() * 12);
    const p = newPatient(room, stay);
    const recoverAfter = 2 + Math.floor(rand() * 10); // days of fever after admission
    for (let date = p.admittedOn; date < today; date = addDays(date, 1)) {
      const dayOfStay = daysBetween(p.admittedOn, date);
      if (rand() < 0.06) continue; // a missed reading, like the paper journal today
      const hasFever = dayOfStay < recoverAfter ? rand() < 0.85 : rand() < 0.08;
      addReading(p.id, date, hasFever);
      if (rand() < 0.93) addVisit(p.id, date, rand() < 0.3 ? pick(DOCTOR_NOTES) : undefined);
    }
    if (rand() < 0.3) {
      addReading(p.id, today, stay < recoverAfter ? rand() < 0.8 : rand() < 0.1);
      if (rand() < 0.4) addVisit(p.id, today, rand() < 0.3 ? pick(DOCTOR_NOTES) : undefined);
    }
  }

  // Completed cases for the outcomes view: 18 discharged, 3 deceased (14.3% mortality).
  for (let i = 0; i < 21; i++) {
    const endAgo = 1 + Math.floor(rand() * 25);
    const stay = 5 + Math.floor(rand() * 9);
    const end = addDays(today, -endAgo);
    const deceased = i % 7 === 3;
    newPatient(0, endAgo + stay, {
      status: deceased ? "deceased" : "discharged",
      ...(deceased
        ? { deceasedAt: facilityInstant(end, 6, 40) }
        : { dischargedAt: facilityInstant(end, 16, 20) }),
    });
  }
  // Historical rooms are not shown as occupied; give them a past room number for the record.
  patients.forEach((p, i) => {
    if (p.room === 0) p.room = 1 + (i % CAPACITY);
  });

  return {
    version: 1,
    seededAt: now.toISOString(),
    nextPatientNumber: patientNumber,
    nextRecordNumber: record,
    patients,
    readings,
    visits,
  };
}
