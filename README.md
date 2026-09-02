# Placement Scheduler

The Placement Week Scheduler is a full-stack TypeScript app for generating and replanning interview schedules during campus placement week. It creates a seeded placement dataset, builds a feasible interview timetable, displays scheduling KPIs, and lets users preview or commit replans when disruptions happen.

## Features

- Generate deterministic placement datasets from a seed.
- Schedule interviews across 4 days, 20 rooms, company panels, and 30-minute time slots.
- Track KPIs such as scheduled percentage, room utilization, panel utilization, failed interviews, and average wait time.
- Preview schedule changes before saving them.
- Commit replans for common placement-week disruptions:
  - Company arriving late
  - Panel dropping out
  - Student withdrawal
  - Room becoming unavailable
- Choose replanning policies:
  - Strict cancellation of disrupted slots
  - Extend day into evening slots
  - Drop lowest-priority company slots

## Tech Stack

- Client: React, TypeScript, Vite, Tailwind CSS, lucide-react
- Server: Node.js, Express, TypeScript
- Development: concurrently, nodemon, ts-node

## Project Structure

```text
.
|-- client/              # React + Vite frontend
|   |-- src/
|   |   |-- App.tsx      # Main scheduler UI
|   |   |-- api.ts       # API client helpers
|   |   `-- types.ts     # Frontend schedule types
|   `-- vite.config.ts   # Dev server and API proxy config
|-- server/              # Express API and scheduling logic
|   |-- src/
|   |   |-- index.ts     # API routes
|   |   |-- generator.ts # Seeded student/company/room dataset generator
|   |   |-- scheduler.ts # Initial schedule builder
|   |   |-- replanner.ts # Disruption replanning logic
|   |   |-- validator.ts # Schedule validation
|   |   `-- types.ts     # Backend schedule types
|-- package.json         # Root scripts
`-- package-lock.json
```

## Getting Started

### Prerequisites

- Node.js
- npm

### Install Dependencies

From the project root:

```bash
npm run install:all
```

### Run in Development

```bash
npm run dev
```

This starts both apps:

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:5001`

The Vite dev server proxies `/api` requests to the backend.

### Build

```bash
npm run build
```

This builds both the server and the client.

### Run the Built Server

```bash
npm run build --prefix server
npm start --prefix server
```

## API Endpoints

### `GET /api/schedule`

Returns the active schedule. If no schedule exists yet, the server lazily initializes one with the default seed.

### `POST /api/reset`

Generates a fresh schedule.

Request body:

```json
{
  "seed": "placement-week-2026"
}
```

### `POST /api/replan`

Previews or commits a replan after a disruption.

Request body:

```json
{
  "disruption": {
    "type": "COMPANY_LATE",
    "companyId": "company-1",
    "day": 0,
    "hoursLate": 2
  },
  "policy": "STRICT",
  "maxChurn": 10,
  "commit": false
}
```

Set `commit` to `true` to save the replanned schedule as the active in-memory state.

## Notes

- Schedule state is stored in memory on the server, so restarting the backend resets the active schedule.
- Seeds make generated data reproducible, which is helpful for testing and demos.
- The default backend port is `5001`; it can be changed with the `PORT` environment variable.
