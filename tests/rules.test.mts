import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, facilityDate } from "../src/lib/dates.ts";
import {
  admitPatient,
  canRecommend,
  canConfirmDischarge,
  recommendationEvidence,
  completeVisit,
  confirmDischarge,
  doctorStatus,
  eligibility,
  occupancy,
  outcomes,
  recommendDischarge,
  recordTemperature,
  withdrawRecommendation,
  type ActionResult,
} from "../src/lib/rules.ts";
import { createSeedState } from "../src/lib/seed.ts";
import type { FacilityState } from "../src/lib/types.ts";

const NOW = new Date("2026-11-12T06:00:00Z"); // 11:30 IST
const later = (min: number) => new Date(NOW.getTime() + min * 60_000);
const TODAY = facilityDate(NOW);
const approval = (state: FacilityState, patientId: string) => ({ patientId, evidence: recommendationEvidence(state, patientId, TODAY) });
const amendment = (date = TODAY, expectedRevision: number | null = 0) => ({ date, expectedRevision, reason: "Transcription corrected" });

function ok(r: ActionResult): FacilityState {
  if (!r.ok) assert.fail(r.error);
  return r.state;
}
function err(r: ActionResult): string {
  assert.equal(r.ok, false, "expected the action to fail");
  return (r as { error: string }).error;
}
const byRoom = (s: FacilityState, room: number) =>
  s.patients.find((p) => p.room === room && (p.status === "admitted" || p.status === "pending_discharge"))!;

test("facility date uses IST, not UTC", () => {
  assert.equal(facilityDate(new Date("2026-11-12T19:00:00Z")), "2026-11-13"); // 00:30 IST
  assert.equal(facilityDate(new Date("2026-11-12T18:00:00Z")), "2026-11-12"); // 23:30 IST
});

test("seed: 74 active patients and a ready demo scenario", () => {
  const s = createSeedState(NOW);
  assert.deepEqual(occupancy(s), { occupied: 74, capacity: 74, available: 0, pending: 1 });
  const demo = byRoom(s, 1);
  assert.ok(demo.isDemo);
  assert.equal(doctorStatus(s, demo, TODAY), "waiting_for_temperature");
  assert.ok(eligibility(s, demo, TODAY).eligible);
  assert.equal(eligibility(s, demo, TODAY).streak, 3);
  assert.equal(eligibility(s, byRoom(s, 2), TODAY).blockers.length, 1);
  assert.match(eligibility(s, byRoom(s, 2), TODAY).blockers[0], /No reading/);
  assert.match(eligibility(s, byRoom(s, 3), TODAY).blockers[0], /Fever on/);
  assert.equal(doctorStatus(s, byRoom(s, 4), TODAY), "ready_for_visit");
  assert.equal(doctorStatus(s, byRoom(s, 5), TODAY), "visit_complete");
});

test("full demo: nurse -> doctor -> administrator", () => {
  let s = createSeedState(NOW);
  const id = byRoom(s, 1).id;
  const before = outcomes(s);

  assert.match(err(completeVisit(s, "doctor", { patientId: id }, later(1))), /not recorded/);
  s = ok(recordTemperature(s, "nurse", { patientId: id, celsius: "36.8", fever: false }, later(2)));
  assert.match(err(recordTemperature(s, "nurse", { patientId: id, celsius: "36.9", fever: false }, later(3))), /already recorded/);
  assert.match(err(recommendDischarge(s, "doctor", approval(s, id), later(4))), /Complete today's visit/);
  s = ok(completeVisit(s, "doctor", { patientId: id, note: "Well." }, later(5)));
  assert.match(err(completeVisit(s, "doctor", { patientId: id }, later(6))), /already complete/);
  assert.match(err(confirmDischarge(s, "admin", { patientId: id }, later(6))), /has not recommended/);
  s = ok(recommendDischarge(s, "doctor", approval(s, id), later(7)));
  assert.match(err(confirmDischarge(s, "nurse", { patientId: id }, later(8))), /Only an Administrator/);
  s = ok(confirmDischarge(s, "admin", { patientId: id }, later(9)));
  assert.match(err(confirmDischarge(s, "admin", { patientId: id }, later(10))), /already discharged/);

  assert.equal(occupancy(s).occupied, 73);
  assert.equal(occupancy(s).available, 1);
  assert.equal(outcomes(s).discharged, before.discharged + 1);
  assert.equal(s.readings.filter((r) => r.patientId === id && r.date === TODAY).length, 1);
});

test("temperature validation and correction", () => {
  let s = createSeedState(NOW);
  const id = byRoom(s, 1).id;
  assert.match(err(recordTemperature(s, "nurse", { patientId: id, celsius: "", fever: false }, NOW)), /Enter/);
  assert.match(err(recordTemperature(s, "nurse", { patientId: id, celsius: "50", fever: false }, NOW)), /between/);
  assert.match(err(recordTemperature(s, "nurse", { patientId: id, celsius: "37.25", fever: false }, NOW)), /one decimal/);
  assert.match(err(recordTemperature(s, "nurse", { patientId: id, celsius: "37.0", fever: null }, NOW)), /Select Fever/);
  assert.match(err(recordTemperature(s, "doctor", { patientId: id, celsius: "37.0", fever: false }, NOW)), /Only a Nurse/);

  s = ok(recordTemperature(s, "nurse", { patientId: id, celsius: "38.4", fever: true }, NOW));
  s = ok(recordTemperature(s, "nurse", { patientId: id, celsius: "36.9", fever: false, amendment: amendment() }, later(5)));
  const r = s.readings.filter((x) => x.patientId === id && x.date === TODAY);
  assert.equal(r.length, 1);
  assert.equal(r[0].celsius, 36.9);
  assert.deepEqual(r[0].changes?.[0].previous, { celsius: 38.4, fever: true });
});

test("a fever after the recommendation blocks discharge until the doctor renews it", () => {
  let s = createSeedState(NOW);
  const id = byRoom(s, 1).id;
  s = ok(recordTemperature(s, "nurse", { patientId: id, celsius: "36.8", fever: false }, NOW));
  s = ok(completeVisit(s, "doctor", { patientId: id }, later(1)));
  s = ok(recommendDischarge(s, "doctor", approval(s, id), later(2)));
  s = ok(recordTemperature(s, "nurse", { patientId: id, celsius: "38.1", fever: true, amendment: amendment() }, later(3)));
  assert.match(err(confirmDischarge(s, "admin", { patientId: id }, later(4))), /no longer valid.*reviewed reading/);

  s = ok(withdrawRecommendation(s, "doctor", { patientId: id }, later(5)));
  assert.equal(canRecommend(s, s.patients.find((p) => p.id === id)!, TODAY).allowed, false);
  // The seeded stale recommendation in room 6 is blocked as well.
  assert.match(err(confirmDischarge(s, "admin", { patientId: byRoom(s, 6).id }, NOW)), /no longer valid/);
});

test("streak uses completed days only; today's No fever counts tomorrow", () => {
  let s = createSeedState(NOW);
  const id = byRoom(s, 3).id; // fever yesterday
  s = ok(recordTemperature(s, "nurse", { patientId: id, celsius: "36.7", fever: false }, NOW));
  const p = s.patients.find((x) => x.id === id)!;
  assert.equal(eligibility(s, p, TODAY).eligible, false);
  assert.equal(eligibility(s, p, TODAY).streak, 0);
  assert.equal(eligibility(s, p, addDays(TODAY, 1)).streak, 1);
});

test("dated corrections preserve review history and block a previously approved reading version", () => {
  let s = createSeedState(NOW);
  const id = byRoom(s, 1).id;
  const date = addDays(TODAY, -2);
  s = ok(recordTemperature(s, "nurse", { patientId: id, celsius: "36.8", fever: false }, NOW));
  s = ok(completeVisit(s, "doctor", { patientId: id }, later(1)));
  const original = approval(s, id);
  s = ok(recommendDischarge(s, "doctor", original, later(2)));
  s = ok(recordTemperature(s, "nurse", { patientId: id, celsius: "37.3", fever: false, amendment: amendment(date) }, later(3)));
  assert.match(err(confirmDischarge(s, "admin", { patientId: id }, later(4))), /reviewed reading/);
  assert.match(err(recommendDischarge(s, "doctor", original, later(4))), /readings changed/);
  s = ok(recommendDischarge(s, "doctor", approval(s, id), later(5)));
  assert.equal(byRoom(s, 1).recommendationHistory?.[0].recommendedAt, later(2).toISOString());
  assert.equal(s.readings.find((r) => r.patientId === id && r.date === date)?.changes?.[0].reason, amendment().reason);
  assert.equal(canConfirmDischarge(s, byRoom(s, 1), TODAY).allowed, true);
});

test("a later fever stays on hold after correction; missed follow-up days block confirmation", () => {
  let s = createSeedState(NOW);
  const id = byRoom(s, 1).id;
  s = ok(recordTemperature(s, "nurse", { patientId: id, celsius: "36.8", fever: false }, NOW));
  s = ok(completeVisit(s, "doctor", { patientId: id }, later(1)));
  s = ok(recommendDischarge(s, "doctor", approval(s, id), later(2)));
  const tomorrow = addDays(TODAY, 1);
  assert.equal(canConfirmDischarge(s, byRoom(s, 1), tomorrow).allowed, true);
  assert.match(canConfirmDischarge(s, byRoom(s, 1), addDays(TODAY, 2)).reason ?? "", /No reading/);
  const next = new Date(`${tomorrow}T06:00:00Z`);
  s = ok(recordTemperature(s, "nurse", { patientId: id, celsius: "38.2", fever: true }, next));
  s = ok(recordTemperature(s, "nurse", { patientId: id, celsius: "37.1", fever: false, amendment: amendment(tomorrow) }, next));
  assert.match(canConfirmDischarge(s, byRoom(s, 1), tomorrow).reason ?? "", /Fever recorded/);
});

test("a missing past reading can be added with a reason; the admission date stays excluded", () => {
  const s = createSeedState(NOW);
  const patient = byRoom(s, 2);
  const date = addDays(TODAY, -2);
  const input = { patientId: patient.id, celsius: "36.7", fever: false, amendment: amendment(date, null) };
  assert.match(err(recordTemperature(s, "nurse", { ...input, amendment: { ...input.amendment, reason: "" } }, NOW)), /reason/);
  const updated = ok(recordTemperature(s, "nurse", input, NOW));
  assert.equal(updated.readings.find((r) => r.patientId === patient.id && r.date === date)?.changes?.[0].previous, null);
  assert.equal(eligibility(updated, patient, TODAY).eligible, true);
  assert.equal(eligibility(updated, { ...patient, admittedOn: addDays(TODAY, -3) }, TODAY).eligible, false);
});

test("admission respects capacity and reuses the freed room", () => {
  let s = createSeedState(NOW);
  assert.match(err(admitPatient(s, "admin", { name: "New Person", age: "40", sex: "F" }, NOW)), /All 74 beds/);
  const id = byRoom(s, 1).id;
  s = ok(recordTemperature(s, "nurse", { patientId: id, celsius: "36.8", fever: false }, NOW));
  s = ok(completeVisit(s, "doctor", { patientId: id }, later(1)));
  s = ok(recommendDischarge(s, "doctor", approval(s, id), later(2)));
  s = ok(confirmDischarge(s, "admin", { patientId: id }, later(3)));
  assert.match(err(admitPatient(s, "admin", { name: "X", age: "40", sex: "F" }, NOW)), /name/);
  s = ok(admitPatient(s, "admin", { name: "New Person", age: "40", sex: "F" }, later(4)));
  assert.equal(s.patients.at(-1)!.room, 1);
  assert.equal(occupancy(s).available, 0);
});

test("outcomes handle zero completed cases and the benchmark flag", () => {
  const empty: FacilityState = { ...createSeedState(NOW), patients: [] };
  assert.equal(outcomes(empty).mortalityRate, null);
  const s = createSeedState(NOW);
  const o = outcomes(s);
  assert.equal(o.completed, 21);
  assert.equal(o.mortalityAboveBenchmark, false);
  const worse: FacilityState = {
    ...s,
    patients: s.patients.map((p, i) => (p.status === "discharged" && i % 3 === 0 ? { ...p, status: "deceased" } : p)),
  };
  assert.equal(outcomes(worse).mortalityAboveBenchmark, true);
});
