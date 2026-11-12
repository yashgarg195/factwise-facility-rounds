# FeverTrack: quarantine and treatment centre prototype

A prototype for a 74-bed quarantine and treatment facility. Nurses record one temperature per patient per day. Doctors visit after the reading. Administrators confirm discharges, free beds, and track outcomes. All data is synthetic.

## Run locally

Requires Node.js 20.9 or later.

```bash
npm install
npm run dev        # development server at http://localhost:3000
npm test           # rules-layer tests (Node built-in test runner)
npm run build      # static export to ./out
npm start          # serve ./out
```

## Demo (about 2 minutes)

1. **Nurse** (default view). Click **Record temperature** on "Next up" (Asha Verma, room 1, tagged *demo*). Enter `36.8`, select **No fever**, save.
2. **Doctor.** Asha is now "Ready for visit". Open her record and read the eligibility timeline (3 completed No-fever days). Click **Complete visit**, then **Recommend discharge**.
3. **Administrator.** Asha is first in the discharge queue. Click **Review & discharge** and confirm. Occupancy moves from 74/74 to 73/74, one bed is free, and the discharged count goes up by one.

Use **Reset demo** in the header to restore the seed. Seed dates are relative to today, so the demo works on any day.

Edge cases in the seed: room 2 (a missing reading breaks the streak), room 3 (fever yesterday), room 4 (reading done, visit pending), room 5 (reading and visit done), room 6 (recommendation blocked by a fever today).

## Structure

| Path | Purpose |
|---|---|
| `src/lib/rules.ts` | Business rules. Every write goes through these functions. They check role and patient state. |
| `src/lib/seed.ts` | Deterministic synthetic seed, relative to the facility date. |
| `src/lib/store.ts` | `localStorage` persistence with an in-memory fallback. |
| `src/lib/dates.ts` | Facility calendar (Asia/Kolkata, IST). |
| `src/components/` | UI: worklist, patient drawer, administrator panels. |
| `tests/rules.test.mts` | Rule tests. |

## Deploy

See `DEPLOY.md`.
