# QR-Based School Attendance System

A production-quality QR-based school attendance system designed for DepEd schools, primarily operated by teachers with real-time push notifications for parents and students.

## Architecture

This repository is structured as an npm workspaces monorepo containing two frontend applications, shared packages, and a shared Supabase backend:

```text
qr-attendance/
├── apps/
│   ├── teacher/          # Teacher application (attendance scanning, class management, SF1 import)
│   └── parent/           # Parent/Student portal (attendance records, push notifications)
├── packages/
│   ├── ui/               # Reusable UI primitives (Button, Input, Modal, etc.)
│   ├── types/            # Shared TypeScript interfaces and domain types
│   ├── validation/       # Shared Zod schemas (LRN, QR payload, SF1, Auth)
│   ├── supabase/         # Typed Supabase client and query helpers
│   └── config/           # Shared TypeScript and ESLint configurations
└── supabase/
    ├── migrations/       # PostgreSQL migrations with RLS policies
    └── functions/        # Supabase Edge Functions (attendance, SF1, FCM)
```

## Tech Stack

- **Frontend:** React 18+, Vite, TypeScript, Tailwind CSS, React Router
- **Backend:** Supabase (PostgreSQL, Supabase Auth, Row Level Security, Edge Functions)
- **Push Notifications:** Firebase Cloud Messaging (FCM) via Supabase Edge Functions
- **Package Management:** Standard npm workspaces

## Security Principles

- **QR Code is an Identifier, Not Proof of Identity:** Attendance scanning enforces server-side authentication, class authorization, enrollment verification, and session validation.
- **Row Level Security (RLS):** All database tables enforce strict RLS policies ensuring teachers only access assigned classes and parents/students only access authorized records.
- **Credential Isolation:** Privileged credentials (Supabase service-role, Firebase Admin) never reach frontend applications and reside solely in Supabase Edge Functions.

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm (v9 or higher recommended)

### Installation

```bash
npm install
```

### Running Applications

```bash
# Run Teacher App
npm run dev --workspace=teacher

# Run Parent/Student App
npm run dev --workspace=parent
```

## License

Private / Proprietary
