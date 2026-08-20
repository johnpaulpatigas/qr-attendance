# QR-Based School Attendance System — Complete Development Prompt

Build a production-quality **QR-based school attendance system** primarily operated by teachers.

The system will use:

- React
- Vite
- TypeScript
- Tailwind CSS
- React Router
- Supabase
- PostgreSQL
- Supabase Auth
- Supabase Row Level Security (RLS)
- Supabase Edge Functions
- Firebase Cloud Messaging (FCM)
- Standard npm with npm workspaces

The system MUST be implemented as a **monorepo containing two separate frontend applications in one Git repository**:

1. **Teacher App** — primarily used by teachers to manage students, classes, QR codes, and attendance.
2. **Parent/Student App** — used by parents and students to view attendance and receive notifications.

Both applications share the same Supabase backend/database and shared packages.

Do NOT create separate repositories for the two applications.

Do NOT use pnpm, Yarn, Bun, Turborepo, or another package manager/build orchestrator unless explicitly instructed.

---

# 1. Core Concept

Teachers take attendance by scanning each student's QR code.

Each student has a unique **Learner's Reference Number (LRN)** provided by DepEd.

The LRN is the student's primary external identifier, but it must **NOT** be treated as a password, authentication credential, or secret.

Each student should have a unique internal UUID.

The QR code should contain only a minimal identifier that allows the backend to resolve the student.

Recommended payload:

```text
ATTENDANCE:<student_uuid>
```

Alternatively, if an LRN-derived identifier is required:

```text
ATTENDANCE:<stable-lrn-derived-identifier>
```

Do NOT expose unnecessary student information inside the QR code.

Do NOT encode:

- Student name
- Birth date
- Grade level
- Section
- Parent information
- Other personal information

The QR code only identifies the student.

The authenticated teacher account, class assignment, enrollment, and server-side authorization determine whether the attendance operation is allowed.

The QR code is an **identifier, not proof of identity**.

---

# 2. Technology Stack

## Frontend

- React
- Vite
- TypeScript
- Tailwind CSS
- React Router
- QR/barcode scanning library compatible with browser/mobile cameras
- PWA support if appropriate
- Responsive/mobile-first UI

## Backend

- Supabase
- PostgreSQL
- Supabase Auth
- Supabase Row Level Security
- Supabase Edge Functions
- Supabase Storage where appropriate

Do NOT introduce a separate Express/Node backend unless there is a compelling architectural reason.

Supabase is the primary backend.

## Notifications

Use:

- Firebase Cloud Messaging
- FCM device tokens stored in Supabase
- Supabase Edge Functions for server-side notification sending

Never expose Firebase Admin credentials or FCM server credentials to the frontend.

---

# 3. Monorepo Architecture — Mandatory

The project MUST be implemented as a **single Git monorepo**.

There must be exactly one Git repository at the project root.

The repository must contain both frontend applications.

Recommended structure:

```text
qr-attendance/
├── apps/
│   ├── teacher/
│   │   ├── src/
│   │   ├── public/
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   └── parent/
│       ├── src/
│       ├── public/
│       ├── package.json
│       └── vite.config.ts
│
├── packages/
│   ├── ui/
│   │   ├── src/
│   │   └── package.json
│   │
│   ├── types/
│   │   ├── src/
│   │   └── package.json
│   │
│   ├── validation/
│   │   ├── src/
│   │   └── package.json
│   │
│   ├── supabase/
│   │   ├── src/
│   │   └── package.json
│   │
│   └── config/
│       ├── eslint/
│       ├── typescript/
│       └── package.json
│
├── supabase/
│   ├── migrations/
│   ├── functions/
│   │   ├── record-attendance/
│   │   ├── import-sf1/
│   │   ├── send-attendance-notification/
│   │   └── ...
│   └── seed/
│
├── package.json
├── package-lock.json
├── tsconfig.json
├── .gitignore
├── .env.example
└── README.md
```

Use **standard npm with npm workspaces**.

The root `package.json` should define:

```json
{
  "private": true,
  "workspaces": ["apps/*", "packages/*"]
}
```

Each app/package should have its own `package.json` containing its direct dependencies.

Run:

```bash
npm install
```

from the root to install the monorepo dependencies.

The root `package-lock.json` must remain synchronized with `package.json`.

Do not create `.git` directories inside `apps/teacher` or `apps/parent`.

There must be one `.git` directory at the monorepo root.

---

# 4. Application Separation

## Teacher App

Location:

```text
apps/teacher
```

Responsibilities:

- Teacher authentication
- Teacher dashboard
- Class management
- Student management
- SF1 import
- Student search
- Student details
- QR generation
- QR viewing
- QR printing
- QR scanner
- Attendance sessions
- Attendance management
- Manual attendance corrections
- Attendance reports
- Teacher settings

The Teacher App must NOT contain parent/student-specific UI.

---

## Parent/Student App

Location:

```text
apps/parent
```

Responsibilities:

### Parent

- Parent authentication
- View linked children
- View today's attendance
- View attendance history
- View monthly attendance
- View attendance statistics
- Receive push notifications
- View notification history

### Student

- Student authentication
- View own attendance
- View attendance history
- View attendance statistics
- Receive notifications

The Parent/Student App must NOT contain teacher administration functionality.

The parent and student roles may share the same frontend application but must have different permissions and views.

---

# 5. Shared Packages

Do not unnecessarily duplicate code between the two applications.

Use shared packages where appropriate.

## `packages/types`

Contains shared TypeScript types:

- Student
- Parent
- User
- Teacher
- Class
- Section
- Attendance
- Attendance Session
- Notification
- API responses
- Supabase database types

Example:

```text
packages/types/src/
├── student.ts
├── parent.ts
├── user.ts
├── class.ts
├── attendance.ts
├── notification.ts
└── index.ts
```

---

## `packages/validation`

Contains shared validation schemas.

Use a schema validation library such as Zod where appropriate.

Examples:

- LRN validation
- QR payload validation
- Student validation
- Attendance validation
- SF1 row validation
- Authentication input validation

Both frontend applications and Edge Functions should use consistent validation rules where practical.

---

## `packages/ui`

Contains genuinely reusable UI primitives:

- Button
- Input
- Select
- Dialog
- Modal
- Toast
- Badge
- Card
- Table
- Loading states
- Empty states
- Error states

Do NOT put every component into the shared package.

Teacher-specific components stay in the Teacher App.

Parent/student-specific components stay in the Parent/Student App.

---

## `packages/supabase`

Contains shared non-privileged Supabase functionality:

- Typed Supabase client helpers
- Database type integration
- Shared query utilities
- Common safe data-access helpers

Never place service-role credentials or privileged server-side operations inside this frontend package.

---

## `packages/config`

Contains shared configuration where appropriate:

- TypeScript configuration
- ESLint configuration
- Formatting configuration
- Other project-wide development configuration

---

# 6. Shared Backend

Both applications use the same:

- Supabase project
- PostgreSQL database
- Supabase Auth
- Supabase Storage where needed
- Supabase Edge Functions

Architecture:

```text
                 ┌───────────────────┐
                 │   Supabase Auth    │
                 └─────────┬─────────┘
                           │
                 ┌─────────▼─────────┐
                 │ PostgreSQL + RLS  │
                 └─────────┬─────────┘
                           │
             ┌─────────────┴─────────────┐
             │                           │
      ┌──────▼───────┐           ┌──────▼───────┐
      │ Teacher App  │           │ Parent App   │
      └──────────────┘           └──────────────┘
```

Edge Functions:

```text
Teacher App
     │
     ▼
Supabase Edge Functions
     │
     ▼
PostgreSQL
     │
     ├── Students
     ├── Classes
     ├── Attendance
     └── Notifications
```

Do NOT create separate databases for the two applications.

---

# 7. DepEd SF1 Import

The system must accept a **DepEd School Form 1 (SF1)** file for initial student seeding.

Support:

- `.xlsx`
- `.xls` if technically practical
- `.csv` where appropriate

The importer must NOT blindly insert every row.

Workflow:

1. Teacher/admin selects SF1 file.
2. Parse the file.
3. Detect/map relevant columns.
4. Display a preview.
5. Validate records.
6. Detect duplicate LRNs.
7. Detect missing required fields.
8. Detect malformed LRNs.
9. Detect invalid values.
10. Display import errors.
11. Allow user to confirm import.
12. Insert/update students.
13. Generate student QR identities.
14. Produce import summary.

At minimum support:

- LRN
- Last Name
- First Name
- Middle Name
- Extension/Suffix
- Sex
- Birth Date
- Grade Level
- Section
- School Year

The importer must be flexible because actual SF1 spreadsheet layouts may vary.

Never use the student's name as the unique identifier.

Use:

```text
LRN = external student identifier
UUID = internal database identifier
```

Duplicate LRNs must be detected before insertion.

---

# 8. Database Design

Design a normalized PostgreSQL schema.

Use UUIDs as internal primary keys.

All schema changes must be represented as Supabase migrations.

---

## `profiles`

Stores authenticated users.

Fields:

- `id`
- `role`
- `full_name`
- `created_at`
- `updated_at`

Roles:

- `teacher`
- `admin`
- `parent`
- `student`

---

## `students`

Fields:

- `id UUID PRIMARY KEY`
- `lrn`
- `last_name`
- `first_name`
- `middle_name`
- `suffix`
- `sex`
- `birth_date`
- `grade_level`
- `section_id`
- `school_year_id`
- `qr_identifier`
- `created_at`
- `updated_at`

Constraints:

- LRN must be unique within the appropriate school/school-year context.
- `qr_identifier` must be unique.
- Do not store QR images unnecessarily.
- Generate QR codes dynamically.

---

## `parents`

Fields:

- `id`
- `profile_id`
- `contact_information`
- `created_at`
- `updated_at`

---

## `student_parents`

Many-to-many relationship between students and parents/guardians.

Fields:

- `student_id`
- `parent_id`
- `relationship`
- `is_primary`

A student may have multiple parent/guardian contacts.

A parent may have multiple linked children.

---

## `classes` / `sections`

Fields:

- `id`
- `grade_level`
- `section_name`
- `school_year_id`
- `teacher_id`

---

## `school_years`

Fields:

- `id`
- `name`
- `start_date`
- `end_date`
- `is_active`

---

## `attendance_sessions`

Fields:

- `id`
- `class_id`
- `teacher_id`
- `attendance_date`
- `session_type`
- `started_at`
- `ended_at`
- `created_at`

Possible session types:

- `morning`
- `afternoon`
- `whole_day`

---

## `attendance`

Fields:

- `id`
- `student_id`
- `class_id`
- `attendance_session_id`
- `attendance_date`
- `attendance_type`
- `status`
- `recorded_at`
- `recorded_by`
- `source`
- `notes`
- `created_at`
- `updated_at`

Possible statuses:

- `present`
- `late`
- `absent`
- `excused`

Possible sources:

- `qr_scan`
- `manual`
- `import`
- `correction`

Enforce a database-level uniqueness constraint preventing duplicate attendance for the same student/session.

Do not rely only on frontend checks.

---

## `attendance_events`

Use an event/audit table to preserve attendance history.

Fields:

- `id`
- `attendance_id`
- `student_id`
- `teacher_id`
- `event_type`
- `timestamp`
- `metadata`

Examples:

- `scanned`
- `marked_present`
- `marked_late`
- `corrected`
- `deleted`

Never silently modify attendance history.

---

## `device_tokens`

For FCM.

Fields:

- `id`
- `profile_id`
- `student_id` nullable
- `parent_id` nullable
- `fcm_token`
- `platform`
- `device_name`
- `is_active`
- `last_seen_at`
- `created_at`
- `updated_at`

FCM tokens must be treated as sensitive.

---

## `notification_logs`

Fields:

- `id`
- `recipient_profile_id`
- `student_id`
- `attendance_id`
- `notification_type`
- `status`
- `fcm_token`
- `error_message`
- `sent_at`
- `created_at`

Notification failure must never roll back successful attendance.

---

# 9. QR Code Generation

Every student must have a QR code accessible from the Teacher App.

Teacher functionality:

- View QR
- Download QR
- Print QR
- Print entire class's QR codes
- Search student
- Regenerate QR identifier if necessary

Recommended payload:

```text
ATTENDANCE:<qr_identifier>
```

The QR should contain only the minimum identifier required for lookup.

Do NOT encode personal information.

The scanner must validate the QR format before sending it to the backend.

---

# 10. Teacher Attendance Workflow

The primary workflow must be extremely fast.

```text
Login
  ↓
Dashboard
  ↓
Select Class
  ↓
Start Attendance
  ↓
Scan QR
  ↓
Record Attendance
  ↓
Automatically Continue Scanning
```

Teacher opens:

**Attendance → Select Class → Select Date → Start Scanning**

Scanner screen should display:

- Camera preview
- Current class
- Current date
- Session type
- Present count
- Late count
- Absent count
- Unrecorded count
- Last scanned student
- Scan status
- Connection status

When a QR is scanned:

1. Decode QR.
2. Validate QR format.
3. Send identifier to `record-attendance` Edge Function.
4. Edge Function authenticates teacher.
5. Verify teacher role.
6. Verify teacher is assigned to selected class.
7. Resolve QR identifier to student.
8. Verify student belongs to selected class.
9. Verify attendance session.
10. Check existing attendance.
11. Create attendance record.
12. Create audit event.
13. Initiate parent notification.
14. Return result.

Success:

```text
✓ Juan Dela Cruz
Marked Present
7:42 AM
```

Duplicate:

```text
Already Recorded

Juan Dela Cruz
Present at 7:42 AM
```

Invalid:

```text
Invalid Student QR
```

Wrong class:

```text
Student Not Enrolled

This student does not belong to the selected class.
```

Unauthorized:

```text
Unauthorized

You are not authorized to record attendance for this class.
```

The scanner should automatically resume after the result is displayed.

---

# 11. Duplicate Attendance Protection

If the same QR is scanned repeatedly:

- Do not create duplicate records.
- Return the existing attendance.
- Show a clear status.

The database must enforce uniqueness.

The Edge Function must also handle race conditions where multiple requests arrive simultaneously.

---

# 12. Attendance Sessions

Support attendance sessions.

Example:

```text
Grade 12 - STEM A
August 20, 2026
Morning Attendance
```

Session fields:

- Class
- Teacher
- Date
- Session type
- Start time
- End time

Possible session types:

- Morning
- Afternoon
- Whole Day

This structure should allow future expansion.

---

# 13. Parent Notifications

After successful attendance recording, linked parents/guardians should receive an FCM push notification.

Example:

```text
Attendance Recorded

Juan Dela Cruz was marked PRESENT today at 7:42 AM.
```

Late:

```text
Attendance Update

Juan Dela Cruz was marked LATE today at 7:58 AM.
```

Do not expose unnecessary student information in notifications.

Architecture:

```text
Teacher App
     ↓
record-attendance Edge Function
     ↓
Create Attendance
     ↓
Create Audit Event
     ↓
Find Linked Parents
     ↓
Find Active FCM Tokens
     ↓
Send FCM Notification
     ↓
Parent/Student App
```

FCM Admin credentials must remain server-side.

Never put Firebase Admin credentials or private keys into Vite environment variables.

---

# 14. Notification Reliability

Attendance creation and notification delivery are separate operations.

Correct:

```text
Attendance successfully recorded
        ↓
Notification queued/sent
```

If FCM fails:

- Keep attendance.
- Log notification failure.
- Allow retry.
- Do not roll back attendance.

Notification delivery must never be a dependency for attendance persistence.

---

# 15. Parent/Student App

The Parent/Student App should provide role-based experiences.

## Parent

Parents can:

- View linked children
- Switch between children
- View today's attendance
- View attendance history
- View monthly attendance
- View attendance statistics
- View late records
- View absences
- Receive push notifications
- View notification history

## Student

Students can:

- View own attendance
- View attendance history
- View monthly attendance
- View attendance statistics
- Receive notifications

Parents must only access their linked children.

Students must only access their own records.

---

# 16. Teacher Dashboard

Create a clean dashboard showing:

- Today's attendance
- Total students
- Present
- Late
- Absent
- Unrecorded
- Recent scans
- Classes
- Active attendance sessions

Example:

```text
Today's Attendance

Grade 12 - STEM A

Present       31
Late           2
Absent         1
Unrecorded     3

[ Start Scanning ]
```

The primary action should be obvious.

---

# 17. Attendance History

Teachers can:

- Select class
- Select date
- Select date range
- Filter by status
- Search students
- View individual attendance
- Correct attendance manually

Manual corrections must create audit events.

Example:

```text
Teacher changed:

ABSENT → PRESENT

Reason:
Student arrived with valid excuse.

Changed by:
Teacher Name

Time:
8:12 AM
```

Never silently overwrite attendance history.

---

# 18. Reports

Implement:

- Daily attendance
- Weekly attendance
- Monthly attendance
- Student attendance history
- Class attendance summary
- Late students
- Absent students

Exports:

- CSV
- XLSX

Privileged report generation should use appropriate Supabase authorization or Edge Functions.

Do not bypass RLS simply to generate reports.

---

# 19. Supabase Security

Use Row Level Security extensively.

Frontend route guards are NOT the security boundary.

## Teacher

Can:

- Access assigned classes
- Access students in assigned classes
- Record attendance for assigned classes
- View attendance for assigned classes
- Correct attendance where authorized

Cannot:

- Access unrelated teacher classes
- Access arbitrary student data
- Access parent credentials
- Access FCM secrets

## Parent

Can:

- Access only linked children
- Access attendance belonging to linked children
- Manage their own notification/device registration

Cannot:

- Access other students
- Modify attendance
- Access teacher data

## Student

Can:

- Access own attendance
- Manage own device registration where appropriate

Cannot:

- Access other students
- Modify attendance

Never bypass RLS simply to make the application work.

---

# 20. Edge Functions

Use Edge Functions for security-sensitive server-side operations.

At minimum:

## `record-attendance`

Responsibilities:

- Authenticate user
- Validate teacher role
- Validate class assignment
- Validate QR identifier
- Resolve student
- Verify enrollment
- Verify attendance session
- Create attendance
- Create attendance event
- Initiate notification

## `import-sf1`

Responsibilities:

- Validate imported data
- Normalize records
- Detect duplicates
- Insert/update students
- Generate QR identifiers where necessary
- Return import results

## `send-attendance-notification`

Responsibilities:

- Resolve parent recipients
- Retrieve active FCM tokens
- Send notification
- Record delivery result

## `generate-student-qr`

Only use a dedicated Edge Function if QR generation requires server-side identifier generation/signing.

---

# 21. Offline / Poor Internet

Schools may have unreliable internet.

The Teacher App should tolerate temporary connectivity problems.

At minimum:

- Detect offline state.
- Clearly display connection status.
- Avoid silently losing scans.
- Provide safe local queueing where appropriate.
- Synchronize when connectivity returns.
- Prevent duplicate synchronization.

Do not create an insecure offline system that allows arbitrary attendance manipulation.

Offline scans must be reconciled server-side.

If offline attendance is implemented, use:

- Unique client-generated event IDs
- Timestamps
- Session identifiers
- Server-side validation
- Idempotency checks
- Conflict handling

---

# 22. UI/UX Requirements

The application should feel like a real school information system, not an AI-generated dashboard template.

Priorities:

- Mobile-first
- Fast interaction
- Clear visual hierarchy
- High contrast
- Accessible
- Large scanning controls
- Clear success/error states
- Minimal unnecessary animation
- Responsive desktop administration interface
- Scanner optimized for phones/tablets

The scanning interface is the most important interface.

Do not bury scanning behind unnecessary navigation.

The main attendance action should be immediately accessible.

---

# 23. Authentication

Use Supabase Auth.

Teacher authentication initially supports:

- Email/password
- Persistent sessions
- Logout
- Password recovery

Parent/student authentication uses the same Supabase Auth infrastructure but separate authorization rules.

Do NOT implement custom password authentication.

Do NOT store passwords in PostgreSQL manually.

---

# 24. Data Privacy

Treat student information as sensitive educational data.

Minimize what is stored and exposed.

Do not put personal information in QR codes.

Do not expose the entire student database to frontend clients.

Use:

- RLS
- Authenticated queries
- Server-side validation
- Least-privilege access
- Audit logs
- Minimal logging

Do not unnecessarily log:

- LRN
- Birth date
- Parent contact information
- Other personal data

---

# 25. Frontend Project Structure

Each application should use a feature-oriented React architecture.

Example:

```text
apps/teacher/src/
├── app/
│   ├── router/
│   └── providers/
│
├── components/
│   ├── layout/
│   └── ...
│
├── features/
│   ├── auth/
│   ├── attendance/
│   ├── students/
│   ├── classes/
│   ├── qr/
│   ├── sf1/
│   └── reports/
│
├── pages/
├── hooks/
├── lib/
└── styles/
```

Parent:

```text
apps/parent/src/
├── app/
│   ├── router/
│   └── providers/
│
├── components/
├── features/
│   ├── auth/
│   ├── attendance/
│   ├── children/
│   └── notifications/
│
├── pages/
├── hooks/
├── lib/
└── styles/
```

Do not create a single enormous `App.tsx`.

Keep business logic separated from UI components.

---

# 26. Environment Variables

Frontend variables may include:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_VAPID_KEY=
```

Never expose:

- Supabase service-role key
- Firebase Admin private key
- FCM server credentials
- Other privileged secrets

Server-side secrets belong in Supabase Edge Function secrets.

Provide:

```text
.env.example
```

and document which variables are used by:

- Teacher App
- Parent/Student App
- Supabase Edge Functions
- Firebase/FCM

Never commit real secrets.

---

# 27. Independent Deployment

The two applications must be independently buildable and deployable even though they share one repository.

Example:

```bash
npm run build --workspace=teacher
```

```bash
npm run build --workspace=parent
```

Development:

```bash
npm run dev --workspace=teacher
```

```bash
npm run dev --workspace=parent
```

Both applications may eventually use separate domains such as:

```text
teacher.example.com
parent.example.com
```

The exact hosting provider is not required at this stage.

---

# 28. Development Strategy

Do NOT build the entire application at once.

Build incrementally and validate each step.

## Phase 1 — Monorepo Foundation

- Initialize Git repository
- Initialize npm workspace
- Create Teacher App
- Create Parent/Student App
- Create shared packages
- Configure TypeScript
- Configure Tailwind
- Configure ESLint
- Configure routing
- Configure basic layouts
- Configure Supabase client

## Phase 2 — Authentication

- Supabase Auth
- Teacher login
- Parent login
- Student login
- Role handling
- Protected routes
- Logout
- Session persistence
- Password recovery

## Phase 3 — Database Foundation

- School years
- Sections/classes
- Profiles
- Students
- Parents
- Student-parent relationships
- Attendance sessions
- Attendance
- Attendance events
- Device tokens
- Notification logs
- RLS policies

## Phase 4 — Student Management

- Student listing
- Search
- Student details
- Class assignment
- QR identifier generation
- QR display
- QR printing

## Phase 5 — SF1 Import

- File upload
- Spreadsheet parsing
- Column detection
- Preview
- Validation
- Duplicate detection
- Import confirmation
- Database insertion/updating
- Import summary
- QR generation

## Phase 6 — Teacher Attendance

- Class selection
- Attendance session creation
- QR scanner
- QR validation
- Attendance Edge Function
- Duplicate prevention
- Attendance feedback
- Recent scan list
- Attendance counters
- Manual attendance

## Phase 7 — Parent/Student App

- Linked children
- Child selection
- Attendance history
- Attendance summary
- Monthly statistics
- Student self-view

## Phase 8 — FCM Notifications

- Firebase configuration
- FCM registration
- Device token management
- Notification Edge Function
- Attendance notifications
- Notification logs
- Failed notification handling

## Phase 9 — Reports

- Daily reports
- Weekly reports
- Monthly reports
- Student history
- Class summaries
- CSV export
- XLSX export

## Phase 10 — Security Hardening

- RLS audit
- Edge Function authorization
- Input validation
- Audit logs
- Idempotency
- Duplicate/replay protection
- Notification failure handling
- Permission testing
- Sensitive data exposure audit

## Phase 11 — Offline Reliability

Only after the online system is stable:

- Connection detection
- Local scan queue
- Synchronization
- Idempotency
- Conflict handling
- Offline UX

Do not build offline functionality before the core online workflow works correctly.

---

# 29. Critical Security Rule

The QR code is an identifier, NOT proof of identity.

Never implement:

```text
Scan QR
    ↓
Trust student ID
    ↓
Mark attendance
```

Instead:

```text
Teacher Authentication
        ↓
Teacher Authorization
        ↓
QR Validation
        ↓
Student Lookup
        ↓
Class Enrollment Verification
        ↓
Attendance Session Verification
        ↓
Idempotency Check
        ↓
Attendance Creation
        ↓
Audit Event
        ↓
Notification
```

The backend must perform the important checks.

Never trust values supplied by the browser merely because the UI appears to enforce them.

---

# 30. Acceptance Criteria

The system is considered functionally complete when:

- Teacher can log in.
- Parent can log in.
- Student can log in.
- Teacher can create/manage classes.
- Teacher can import an SF1 file.
- SF1 data can be previewed before import.
- Invalid SF1 records are identified.
- Duplicate LRNs are detected.
- Students are correctly created/updated.
- Each student has a unique QR identifier.
- QR codes can be displayed.
- QR codes can be printed.
- Teacher can select a class.
- Teacher can start an attendance session.
- Teacher can scan a student's QR code.
- Student is correctly identified.
- Student enrollment is verified.
- Unauthorized attendance attempts are rejected.
- Duplicate attendance is prevented.
- Attendance is persisted in Supabase.
- Attendance events are audited.
- Linked parents can receive FCM notifications.
- Notification failures do not delete attendance.
- Parents can view their child's attendance.
- Students can view their own attendance.
- Teachers can view attendance history.
- Teachers can manually correct attendance.
- Manual corrections are audited.
- Reports can be generated.
- Reports can be exported.
- RLS prevents unauthorized data access.
- Privileged credentials never reach the frontend.
- Both apps build independently.
- Both apps use the same Supabase backend.
- Both apps share appropriate packages.
- The entire system exists in one Git repository.

---

# 31. Git Workflow — MANDATORY

Git is part of the development workflow, not something to do after development.

**Commit every meaningful implementation step.**

Do NOT wait until an entire feature, phase, or milestone is complete before committing.

Do NOT create one giant final commit.

The repository should have a clean, chronological development history showing how the system was built.

## Mandatory Workflow

Before making changes:

```bash
git status
```

Then:

```text
Implement ONE logical change
        ↓
Run validation
        ↓
Review diff
        ↓
Stage relevant files
        ↓
Commit
        ↓
Verify commit
        ↓
Continue
```

After each meaningful step:

```bash
git status
git diff
git add <specific-files>
git commit -m "..."
git status
git log -1 --oneline
```

Prefer staging specific files instead of blindly doing:

```bash
git add .
```

Do not accidentally commit unrelated changes.

---

# 32. Git Commit Granularity

Commits should be small, focused, and logically reversible.

Examples:

```text
chore: initialize git repository
```

```text
chore: initialize npm monorepo
```

```text
chore: add teacher application
```

```text
chore: add parent application
```

```text
chore: add shared types package
```

```text
chore: add shared validation package
```

```text
chore: configure shared ui package
```

```text
chore: configure Supabase client
```

```text
feat: add teacher authentication
```

```text
feat: add parent authentication
```

```text
feat: create school year schema
```

```text
feat: create student schema
```

```text
feat: create attendance schema
```

```text
feat: add student qr identifiers
```

```text
feat: add qr code display
```

```text
feat: add sf1 parser
```

```text
feat: add sf1 validation
```

```text
feat: add sf1 import workflow
```

```text
feat: add attendance session
```

```text
feat: add qr scanner
```

```text
feat: add attendance recording edge function
```

```text
fix: prevent duplicate attendance records
```

```text
feat: add attendance audit events
```

```text
feat: add fcm device registration
```

```text
feat: send attendance notifications
```

```text
fix: handle notification delivery failures
```

The exact commit message can vary, but it must clearly describe the change.

---

# 33. Database Git Workflow

Every database change must be represented by a migration.

Example:

```text
feat: create profiles table
```

```text
feat: create students table
```

```text
feat: create parent relationships
```

```text
feat: create attendance tables
```

```text
feat: add attendance rls policies
```

Do not make undocumented schema changes directly in the Supabase dashboard.

Migration files must be committed to Git.

---

# 34. Dependency Git Workflow

Whenever dependencies change:

- Update `package.json`.
- Update `package-lock.json`.
- Validate the affected workspace.
- Commit both files as part of the logical dependency change.

Do not unnecessarily delete or regenerate `package-lock.json`.

Use npm commands so the lockfile remains synchronized.

---

# 35. Validation Before Commits

Run appropriate validation before every commit.

Depending on the change, this may include:

- TypeScript type checking
- ESLint
- Unit tests
- Build
- Supabase migration validation
- Edge Function validation
- Manual UI testing

Do not blindly commit broken code.

If a feature is intentionally incomplete but the current implementation step is valid, it may be committed, but clearly state what remains unfinished.

---

# 36. Git Safety

Never use destructive Git commands unless explicitly instructed.

Do NOT use:

```bash
git reset --hard
```

```bash
git clean -fd
```

```bash
git push --force
```

Do not rewrite or squash previous commits unless explicitly instructed.

Do not delete previous work simply because a new implementation is preferred.

Before moving to a new development phase, ensure the previous phase has been committed.

At the end of every meaningful implementation step, report:

```text
Commit: <commit-hash>
Message: <commit-message>
Changes: <brief summary>
Validation: <what was tested>
```

---

# 37. Monorepo Git Requirements

The entire project must use one Git repository.

Do NOT create:

```text
apps/teacher/.git
```

or:

```text
apps/parent/.git
```

The only Git repository must be:

```text
qr-attendance/.git
```

The Git history should represent the entire project.

Shared package changes, Teacher App changes, Parent/Student App changes, Supabase migrations, and Edge Functions all belong to the same Git history.

---

# 38. Avoid Premature Abstraction

The monorepo should encourage code reuse, but do NOT create abstractions simply for the sake of sharing code.

Share:

- Types
- Validation
- UI primitives
- Supabase types
- Safe utilities
- Configuration
- Infrastructure

Keep application-specific business logic inside the application that owns it.

Good:

```text
packages/types
packages/validation
packages/ui
packages/supabase
```

Bad:

```text
packages/everything
```

Do not create a giant shared package containing unrelated Teacher and Parent functionality.

The Teacher App and Parent/Student App should remain independently understandable.

---

# 39. Development Quality Rules

Do not use mock data once the corresponding Supabase feature exists.

Do not create fake authentication.

Do not hardcode student data.

Do not store privileged credentials in the frontend.

Do not bypass RLS to make something work.

Do not put business-critical authorization logic exclusively in React.

Do not treat the LRN as a password or authentication token.

Do not duplicate attendance records.

Do not silently overwrite attendance history.

Do not send notifications directly from the browser using privileged Firebase credentials.

Do not expose unnecessary personal information.

Keep the code strongly typed.

Use reusable components where appropriate.

Keep database operations separated from UI components.

Use Supabase migrations for database changes.

Document environment variables.

Test important authorization boundaries.

Commit every meaningful implementation step.

Before implementing a feature, consider its:

- Database implications
- Security implications
- RLS implications
- Edge Function requirements
- UI implications
- Error handling
- Git commit boundary

The final result must be a **real working Supabase-backed attendance platform**, not a static prototype, mockup, or collection of fake screens.

---

# 40. Final Architecture

The intended architecture is:

```text
                         ONE GIT REPOSITORY
                         qr-attendance/
                                │
               ┌────────────────┴────────────────┐
               │                                 │
         apps/teacher                       apps/parent
               │                                 │
        Teacher Experience             Parent/Student Experience
               │                                 │
               └──────────────┬──────────────────┘
                              │
                     Shared npm packages
                  ┌───────────┼───────────┐
                  │           │           │
                 UI         Types     Validation
                              │
                              ▼
                         Supabase
               ┌──────────────┼──────────────┐
               │              │              │
           PostgreSQL      Supabase Auth   Edge Functions
               │                             │
               │                             ├── Attendance
               │                             ├── SF1 Import
               │                             └── Notifications
               │
               ▼
        Row Level Security
               │
               ├───────────────┐
               │               │
         Teacher Data     Parent/Student Data
                               │
                               ▼
                              FCM
                               │
                               ▼
                       Parent/Student App
```

The system should prioritize **correctness, security, maintainability, fast teacher workflows, and a clean Git history** over unnecessary features or architectural complexity.
