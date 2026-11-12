"use client";

import { useState } from "react";
import { canRecommend, doctorStatus, readingFor } from "@/lib/rules";
import type { FacilityState, Patient, Role } from "@/lib/types";
import { DemoTag, DischargeBadge, DoctorBadge, TemperatureBadge } from "./badges";
import { Button } from "./ui";

const GRID = "lg:grid-cols-[3.5rem_minmax(11rem,1.2fr)_minmax(13rem,1.2fr)_minmax(11rem,1fr)_minmax(11rem,1fr)_11rem]";

type Filter = { id: string; label: string; test: (p: Patient) => boolean };

function filtersFor(role: Role, state: FacilityState, today: string): Filter[] {
  const all: Filter = { id: "all", label: "All", test: () => true };
  if (role === "nurse") {
    return [
      all,
      { id: "awaiting", label: "Awaiting reading", test: (p) => !readingFor(state, p.id, today) },
      { id: "recorded", label: "Recorded today", test: (p) => !!readingFor(state, p.id, today) },
      { id: "fever", label: "Fever today", test: (p) => !!readingFor(state, p.id, today)?.fever },
    ];
  }
  if (role === "doctor") {
    return [
      all,
      { id: "ready", label: "Ready for visit", test: (p) => doctorStatus(state, p, today) === "ready_for_visit" },
      { id: "waiting", label: "Waiting for temperature", test: (p) => doctorStatus(state, p, today) === "waiting_for_temperature" },
      { id: "complete", label: "Visit complete", test: (p) => doctorStatus(state, p, today) === "visit_complete" },
      { id: "eligible", label: "Ready to recommend", test: (p) => canRecommend(state, p, today).allowed },
    ];
  }
  return [
    all,
    { id: "pending", label: "Pending discharge", test: (p) => p.status === "pending_discharge" },
    { id: "fever", label: "Fever today", test: (p) => !!readingFor(state, p.id, today)?.fever },
  ];
}

const DOCTOR_ORDER = { ready_for_visit: 0, waiting_for_temperature: 1, visit_complete: 2 } as const;
const worklistOrders = [
  ["priority", "Queue priority"], ["room-asc", "Room, low to high"], ["room-desc", "Room, high to low"], ["name", "Patient name, A–Z"],
] as const;
type WorklistOrder = typeof worklistOrders[number][0];

function sortFor(role: Role, state: FacilityState, today: string, order: WorklistOrder) {
  const rank = (p: Patient) => {
    if (role === "nurse") return readingFor(state, p.id, today) ? 1 : 0;
    if (role === "doctor") return canRecommend(state, p, today).allowed ? -1 : DOCTOR_ORDER[doctorStatus(state, p, today)];
    return 0;
  };
  return (a: Patient, b: Patient) => {
    const room = a.room - b.room;
    if (order === "room-asc") return room;
    if (order === "room-desc") return -room;
    if (order === "name") return a.name.localeCompare(b.name) || room;
    return rank(a) - rank(b) || Number(!!b.isDemo) - Number(!!a.isDemo) || room;
  };
}

function actionFor(role: Role, state: FacilityState, p: Patient, today: string) {
  if (role === "nurse") {
    return readingFor(state, p.id, today)
      ? { label: "View / correct", variant: "ghost" as const }
      : { label: "Record temperature", variant: "filled" as const };
  }
  if (role === "doctor") {
    const s = doctorStatus(state, p, today);
    if (s === "ready_for_visit") return { label: "Start visit", variant: "filled" as const };
    if (canRecommend(state, p, today).allowed) return { label: "Review discharge", variant: "filled" as const };
    return { label: "Open", variant: "ghost" as const };
  }
  return { label: "View", variant: "ghost" as const };
}

export function Worklist({
  state,
  role,
  today,
  patients,
  onOpen,
  title,
  query,
  onQuery,
}: {
  state: FacilityState;
  role: Role;
  today: string;
  patients: Patient[];
  onOpen: (id: string) => void;
  title: string;
  query: string;
  onQuery: (q: string) => void;
}) {
  const filters = filtersFor(role, state, today);
  const [filterId, setFilterId] = useState("all");
  const [sortOrder, setSortOrder] = useState<WorklistOrder>("priority");
  const filter = filters.find((f) => f.id === filterId) ?? filters[0];
  const rows = patients.filter(filter.test).sort(sortFor(role, state, today, sortOrder));

  return (
    <section className="rounded-[24px] bg-mist p-2 sm:p-3" aria-labelledby="worklist-title">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-3 pb-3 pt-2">
        <div>
          <h2 id="worklist-title" className="display text-[24px]">
            {title} <span className="num text-[17px] text-ash">{rows.length}</span>
          </h2>
        </div>
        <div className="w-full sm:w-80">
          <label htmlFor="search" className="sr-only">
            Search patients
          </label>
          <input
            id="search"
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search name, patient ID or room"
            className="h-11 w-full rounded-[16px] border border-hairline bg-paper px-4 text-[15px] placeholder:text-smoke focus:border-ink focus:outline-none"
          />
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter patients">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={f.id === filter.id}
              onClick={() => setFilterId(f.id)}
              className={`pill pill-sm ${f.id === filter.id ? "pill-filled" : "pill-ghost border-hairline bg-paper"}`}
            >
              {f.label} <span className="num opacity-60">{patients.filter(f.test).length}</span>
            </button>
          ))}
        </div>
          <label className="flex flex-wrap items-center gap-2 text-[13px] text-muted">Sort patients by
            <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as WorklistOrder)}
              className="max-w-full rounded-full border border-hairline bg-paper px-3 py-2 text-ink">
              {worklistOrders.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-[20px] bg-paper">
        <div className={`hidden gap-4 border-b border-hairline px-5 py-3 text-[13px] text-ash lg:grid ${GRID}`}>
          <div>Room</div>
          <div>Patient</div>
          <div>Temperature today</div>
          <div>Doctor visit</div>
          <div>Discharge</div>
          <div className="sr-only">Action</div>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-muted">No patients match this view.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {rows.map((p) => {
              const action = actionFor(role, state, p, today);
              return (
                <li
                  key={p.id}
                  data-testid={`row-${p.id}`}
                  className={`grid grid-cols-[2.75rem_1fr] gap-x-4 gap-y-2 px-5 py-3 transition-colors hover:bg-fog lg:items-center ${GRID} ${
                    p.isDemo ? "bg-cream" : ""
                  }`}
                >
                  <div className="num row-span-3 font-serif text-[22px] leading-none text-ink lg:row-span-1">{p.room}</div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{p.name}</span>
                      {p.isDemo && <DemoTag />}
                    </div>
                    <div className="num text-[13px] text-ash">
                      {p.id} · {p.age}
                      {p.sex}
                    </div>
                  </div>
                  <div className="col-start-2 flex flex-wrap items-center gap-2 lg:contents">
                    <div><TemperatureBadge state={state} patient={p} today={today} /></div>
                    <div><DoctorBadge state={state} patient={p} today={today} /></div>
                    <div><DischargeBadge state={state} patient={p} today={today} /></div>
                  </div>
                  <div className="col-start-2 lg:col-start-auto lg:text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onOpen(p.id)}
                      className="w-full lg:w-auto"
                      aria-label={`${action.label}: ${p.name}`}
                    >
                      {action.label}
                      {action.variant === "filled" && <span aria-hidden className="arrow">→</span>}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
