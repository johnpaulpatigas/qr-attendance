# QR-Based School Attendance System

A production-grade, full-stack monorepo for automated school attendance management designed for Philippine public and private schools, adhering to Department of Education (DepEd) standards.

---

## Architecture Overview

The system is built as a single Git monorepo using npm workspaces, React 18, TypeScript, Tailwind CSS, and Supabase (PostgreSQL, Row Level Security, Auth, Edge Functions) with Firebase Cloud Messaging (FCM) push notifications.

```
qr-attendance/
├── apps/
│   ├── teacher/              # Teacher PWA (QR Scanner, SF1 Importer, SF2 Reports, Student Directory)
│   └── parent/               # Parent & Student Portal (Live Daily Status, History, Stats, Alerts)
├── packages/
│   ├── types/                # Domain TypeScript interfaces and database models
│   ├── validation/           # Zod schemas, 12-digit LRN rules, QR payload validators
│   ├── ui/                   # Shared reusable design system (Button, Modal, Table, Badge, Card, etc.)
│   └── supabase/             # Typed Supabase client singleton & auth helpers
└── supabase/
    ├── migrations/           # 5 modular PostgreSQL schema & RLS migrations
    └── functions/
        ├── record-attendance/     # Edge Function: server-side JWT auth, enrollment checks, duplicate prevention
        └── send-fcm-notification/ # Edge Function: FCM push dispatch to linked parents & delivery audit logs
```

---

## Key Features

### 1. Teacher Application (apps/teacher — Port 3000)
- **High-Speed QR Barcode Scanner:** Real-time mobile back-camera and desktop webcam stream with animated laser viewfinder, 2-second debounce filter, and synthesized Web Audio scan chimes.
- **Instant Attendance Feedback:** Visual alert banners (Present, Late, Already Recorded, Invalid QR, Student Not Enrolled).
- **Live Session Metrics:** Real-time counters for Present, Late, Absent, and Unrecorded students.
- **DepEd School Form 1 (SF1) Importer:** Parses .xlsx, .xls, and .csv files; auto-detects headers; validates 12-digit LRNs; detects duplicate LRN collisions; and auto-generates QR identifiers.
- **DepEd School Form 2 (SF2) Generator:** Generates monthly attendance registers segregated by Male/Female learners with official codes (/, T, X), Average Daily Attendance (ADA), attendance rate percentages, .xlsx spreadsheet export, and landscape A4 printable registers.
- **Offline Scan Queue & Auto-Reconciliation:** Tolerates spotty or disconnected school Wi-Fi by caching enrolled student rosters and queueing scans locally with client UUID idempotency keys. Automatically flushes and syncs to Supabase upon reconnection with live connection badges.
- **Student QR ID Passes:** Single-student printable ID badges with QR codes and whole-class batch printing.
- **Manual Attendance & Audit Trails:** Manual status corrections requiring explicit reason logs persisted in attendance_events.

### 2. Parent & Student Portal (apps/parent — Port 3001)
- **Multi-Child Switching:** Parents with multiple enrolled children can switch active profiles seamlessly.
- **Today's Live Status:** Real-time view of daily morning and afternoon scans, exact time-in timestamps, and recording teacher name.
- **Monthly Attendance History:** Chronological log of past attendance records with status badges and notes.
- **Punctuality & Attendance Statistics:** Cumulative attendance rate %, tardiness rate %, total school days, and present/late/absent counters.
- **FCM Push Notifications & Delivery Logs:** Real-time background notifications delivered via Service Worker whenever a student's QR is scanned.

### 3. Backend & Security (supabase/)
- **Strict 12-Digit Numeric LRN Validation:** Enforced by database regex constraints (^\d{12}$) and Zod schemas.
- **Zero Duplicate Scans:** Guaranteed by database unique constraints (UNIQUE(student_id, attendance_session_id) and UNIQUE(student_id, attendance_date, attendance_type)).
- **Privacy-Preserving QR Codes:** QR codes encode only ATTENDANCE:<uuid> without sensitive PII.
- **Server-Side Authorization:** Edge Functions verify teacher class assignments before recording attendance.
- **Row Level Security (RLS):** Parents access only their linked children; teachers access only assigned sections.
- **Immutable Audit Events:** Every scan and manual correction is recorded in attendance_events.

---

## Getting Started

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd qr-attendance

# Install all monorepo dependencies
npm install
```

### Environment Configuration
Copy .env.example to create local .env files where needed:

```bash
cp .env.example .env
```

Client frontend variables (safe for client apps):
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_FIREBASE_API_KEY=your-firebase-api-key
VITE_FIREBASE_PROJECT_ID=your-firebase-project-id
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_VAPID_KEY=your-vapid-public-key
```

Server-side Edge Function secrets (never exposed to clients):
```env
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
FCM_SERVER_KEY=your-firebase-server-key
```

---

## Development Commands

| Command | Description |
|---|---|
| `npm run dev` | Start both Teacher App (port 3000) and Parent App (port 3001) concurrently |
| `npm run dev:teacher` | Start Teacher App dev server on http://localhost:3000 |
| `npm run dev:parent` | Start Parent App dev server on http://localhost:3001 |
| `npm run typecheck` | Run TypeScript typechecking across all 6 workspaces |
| `npm test` | Run Vitest unit & integration test suite |
| `npm run build` | Build production bundles for all apps and packages |

---

## Database Migrations

Apply SQL migrations in sequential order using the Supabase CLI:

```bash
# Apply all database schema and RLS migrations
supabase db push
# Or apply individually:
supabase migration apply 20260820000001_create_profiles_and_school_years.sql
supabase migration apply 20260820000002_create_class_sections.sql
supabase migration apply 20260820000003_create_students_and_parents.sql
supabase migration apply 20260820000004_create_attendance_and_events.sql
supabase migration apply 20260820000005_create_device_tokens_and_notifications.sql
```

---

## Edge Functions Deployment

```bash
# Deploy record-attendance Edge Function
supabase functions deploy record-attendance --no-verify-jwt

# Deploy send-fcm-notification Edge Function
supabase functions deploy send-fcm-notification --no-verify-jwt

# Set Edge Function secrets
supabase secrets set FCM_SERVER_KEY="your-fcm-server-key"
```

---

## Testing & Validation

The system includes automated tests for LRN constraints, QR serialization, SF1 row parsing, and correction rules:

```bash
npm test
```

All 17 tests validate:
- 12-digit numeric LRN validation.
- ATTENDANCE:<uuid> QR payload encoding and decoding.
- SF1 row parser and error diagnostic generator.
- Minimum reason length (3 chars) for manual attendance corrections.
- Authentication schemas.

---

## DepEd Form Compliance

- **School Form 1 (SF1):** Ingests official learner masterlists, automatically extracts LRN, names, sex, birth dates, and grade/section.
- **School Form 2 (SF2):** Generates compliant monthly daily attendance registers with separate male/female tables, daily presence (/), tardiness (T), absence (X), Average Daily Attendance (ADA), and attendance rates. Exportable as .xlsx or landscape printable documents.
