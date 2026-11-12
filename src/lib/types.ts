export type Role = "nurse" | "doctor" | "admin";

export const ROLE_LABELS: Record<Role, string> = {
  nurse: "Nurse",
  doctor: "Doctor",
  admin: "Administrator",
};

/** admitted and pending_discharge are "active" and occupy a bed. */
export type PatientStatus = "admitted" | "pending_discharge" | "discharged" | "deceased";

export interface DischargeRecommendation {
  recommendedAt: string;
  facilityDate: string;
  evidence?: ReadingVersion[];
  review?: { at: string; reason: string };
}

export type ReadingVersion = { date: string; revision: number };
type ReadingValues = { celsius: number; fever: boolean };
export type ReadingChange = { at: string; reason: string; previous: ReadingValues | null; next: ReadingValues };

export interface Patient {
  id: string;
  name: string;
  age: number;
  sex: "F" | "M";
  room: number;
  admittedOn: string;
  status: PatientStatus;
  isDemo?: boolean;
  recommendation?: DischargeRecommendation;
  recommendationHistory?: DischargeRecommendation[];
  dischargedAt?: string;
  deceasedAt?: string;
}

export interface TemperatureReading {
  id: string;
  patientId: string;
  date: string;
  celsius: number;
  fever: boolean;
  recordedAt: string;
  correctedAt?: string;
  previous?: { celsius: number; fever: boolean };
  changes?: ReadingChange[];
}

export interface DoctorVisit {
  id: string;
  patientId: string;
  date: string;
  completedAt: string;
  note?: string;
}

export interface FacilityState {
  version: 1;
  seededAt: string;
  nextPatientNumber: number;
  nextRecordNumber: number;
  patients: Patient[];
  readings: TemperatureReading[];
  visits: DoctorVisit[];
}

export const CAPACITY = 74;
export const MORTALITY_BENCHMARK = 0.15;
export const SUCCESS_BENCHMARK = 0.85;
export const FEVER_FREE_DAYS_REQUIRED = 3;
