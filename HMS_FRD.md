# Enterprise Hospital Management System (HMS)
## Functional Requirements Document (FRD) — Implementation-Ready Specification

**Document Version:** 1.0
**Classification:** Internal / Engineering
**Prepared For:** Backend & Frontend Engineering Teams
**Architecture Style:** Modular Monolith → Service-Oriented, API-First, Event-Driven (Socket.IO + BullMQ)

---

## 1. Purpose & Scope

This FRD defines the complete functional, data, API, security, and workflow specification for an Enterprise Hospital Management System (HMS). It is written to allow backend engineers to begin schema migration and API implementation immediately, and frontend engineers to build against a stable contract. No source code is included — only specifications, contracts, schemas, and flows.

## 2. Technology Architecture

| Layer | Technology |
|---|---|
| Backend Runtime | Node.js (LTS) + Express.js |
| Frontend | Next.js (App Router), React Query/TanStack Query recommended |
| Primary Relational DB | PostgreSQL (via Prisma ORM) |
| Document/Flexible DB | MongoDB (via Mongoose) — used for chat, logs, unstructured clinical notes, AI transcripts |
| Cache / Session / Rate-limit | Redis |
| Job Queue / Scheduling | BullMQ (Redis-backed) |
| Real-time Layer | Socket.IO (WebSocket + polling fallback) |
| Object Storage | AWS S3 (reports, scans, prescriptions, documents, avatars) |
| Auth Tokens | JWT (Access + Refresh), Redis-backed session/blacklist |
| Notification Channels | Email (SES/SMTP), SMS (DLT-compliant provider), Push (FCM), In-app (Socket.IO) |

### 2.1 Polyglot Persistence Strategy
- **PostgreSQL (System of Record):** Users, Roles, Permissions, Departments, Doctors, Patients, Appointments, OPD, IPD, Ward, Beds, Ambulance, Prescription (structured), Lab Orders, Pharmacy, Inventory, Billing, Payments — i.e., anything transactional, relational, or requiring ACID + referential integrity.
- **MongoDB (Flexible/High-write/Unstructured):** Chat messages, Patient Chat threads, AI Chatbot conversations, AI Prescription raw model I/O, Notification logs, Audit trail (append-only), Activity logs, Uploaded file metadata mirrors, Report generation logs.
- **Redis:** Session store, JWT refresh/blacklist, OTP store, rate limiting, bed/queue real-time counters, Socket.IO adapter (pub/sub for horizontal scaling), cache for read-heavy lookups (department list, role list), distributed locks (bed allocation, OT scheduling).
- **S3:** All binary/document artifacts. Only S3 keys/URLs are stored in Postgres/Mongo, never binary blobs.

## 3. Global Conventions (Apply to Every Module Below)

### 3.1 Authentication & Authorization
- All APIs (except `/auth/login`, `/auth/register-patient`, `/auth/refresh`, `/auth/forgot-password`) require `Authorization: Bearer <accessToken>`.
- Authorization is enforced via RBAC middleware checking `role` + `permission` claims embedded in JWT and re-validated against Postgres `roles`/`permissions` tables (cache-through Redis, 5 min TTL).
- Multi-tenant ready: every table carries `hospital_id` (nullable for single-tenant deployments) for future scaling.

### 3.2 Standard Request Headers
```
Authorization: Bearer <token>
Content-Type: application/json
X-Request-Id: <uuid>          // for tracing, generated client-side or by gateway
X-Hospital-Id: <uuid>         // optional, multi-branch context
```

### 3.3 Standard Response Envelope
```json
// Success
{ "success": true, "data": { }, "meta": { "requestId": "uuid" } }
// Failure
{ "success": false, "error": { "code": "ERR_CODE", "message": "Human readable", "details": [] }, "meta": { "requestId": "uuid" } }
```

### 3.4 Standard Error Codes (used across all modules)
| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request body/query failed schema validation |
| `UNAUTHENTICATED` | 401 | Missing/invalid/expired token |
| `FORBIDDEN` | 403 | Valid token, insufficient permission |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Unique constraint / state conflict (e.g., double-booking) |
| `RATE_LIMITED` | 429 | Too many requests (Redis token bucket) |
| `INTERNAL_ERROR` | 500 | Unhandled server exception |
| `DEPENDENCY_FAILURE` | 502 | Downstream service (S3, SMS, AI provider) failure |

### 3.5 Audit Log Standard (applies to every mutating API)
Every `CREATE`/`UPDATE`/`DELETE`/`STATUS_CHANGE` operation writes an immutable record to MongoDB collection `audit_logs`:
```json
{
  "actorId": "uuid", "actorRole": "string", "action": "CREATE|UPDATE|DELETE|STATUS_CHANGE|LOGIN|EXPORT",
  "module": "string", "entityType": "string", "entityId": "uuid",
  "before": {}, "after": {}, "ip": "string", "userAgent": "string",
  "timestamp": "ISODate", "requestId": "uuid"
}
```

### 3.6 Activity Log Standard
Lighter-weight, user-facing "recent activity" feed, stored in MongoDB `activity_logs`, used for dashboards/timelines (e.g., patient timeline, doctor activity feed). Retained 12 months; audit logs retained indefinitely (compliance).

### 3.7 Pagination Standard (all list APIs)
Query params: `page` (default 1), `limit` (default 20, max 100), `sortBy`, `sortOrder` (`asc|desc`), plus module-specific filters.
Response `meta` includes `{ page, limit, totalItems, totalPages }`.

### 3.8 Soft Delete Standard
All Postgres tables use `deleted_at TIMESTAMP NULL` (soft delete). Hard delete is restricted to `SUPER_ADMIN` via a separate purge job, gated behind audit-logged confirmation.

### 3.9 Global User Roles (referenced throughout; full RBAC matrix in Section 30)
`SUPER_ADMIN`, `HOSPITAL_ADMIN`, `DOCTOR`, `NURSE`, `RECEPTIONIST`, `LAB_TECHNICIAN`, `PHARMACIST`, `BILLING_STAFF`, `INVENTORY_MANAGER`, `AMBULANCE_DISPATCHER`, `AMBULANCE_DRIVER`, `PATIENT`, `IT_SUPPORT`.

---

## 4. MODULE: Authentication

### 4.1 Module Description
Handles identity verification, session issuance, credential lifecycle, OTP-based patient login, password recovery, and multi-role login for staff and patients. Central gatekeeper for every other module.

### 4.2 Features
- Email/phone + password login for staff
- OTP (SMS/Email) login for patients
- JWT access + refresh token issuance
- Refresh token rotation with Redis blacklist
- Forgot/reset password flow
- Account lockout after repeated failures
- Device/session management (view & revoke active sessions)
- Two-factor authentication (optional, TOTP) for Admin/Doctor roles

### 4.3 User Roles
All roles interact with Authentication. `SUPER_ADMIN` additionally manages global auth policy (lockout thresholds, token TTL).

### 4.4 Functional Requirements
- FR-AUTH-01: System shall authenticate staff via email/phone + password.
- FR-AUTH-02: System shall authenticate patients via OTP sent to registered mobile.
- FR-AUTH-03: System shall issue short-lived access tokens (15 min) and long-lived refresh tokens (7 days).
- FR-AUTH-04: System shall rotate refresh tokens on every use; reuse of a rotated token invalidates the entire session family.
- FR-AUTH-05: System shall lock an account for 15 minutes after 5 consecutive failed attempts.
- FR-AUTH-06: System shall allow password reset via time-limited signed link (30 min expiry).
- FR-AUTH-07: System shall log every login/logout/failed attempt to audit logs.

### 4.5 Business Rules
- BR-01: OTP valid for 5 minutes, max 3 verification attempts per OTP.
- BR-02: A staff user cannot have more than 5 concurrent active sessions.
- BR-03: Patients authenticate only via OTP (no password by default) unless they explicitly set one.
- BR-04: Role is embedded in JWT at issuance and is immutable for token lifetime — role changes require re-login.

### 4.6 Validation Rules
- Phone: E.164 format. Email: RFC 5322. Password: min 8 chars, 1 upper, 1 number, 1 symbol.
- OTP: 6-digit numeric, single-use.

### 4.7 API List / Route / Method / Purpose / Request / Response
| # | Method | Route | Purpose |
|---|---|---|---|
|1| POST | `/api/v1/auth/login` | Staff email/phone + password login |
|2| POST | `/api/v1/auth/otp/request` | Request OTP (patient or staff MFA) |
|3| POST | `/api/v1/auth/otp/verify` | Verify OTP and issue tokens |
|4| POST | `/api/v1/auth/refresh` | Rotate refresh token, issue new access token |
|5| POST | `/api/v1/auth/logout` | Revoke current session |
|6| POST | `/api/v1/auth/logout-all` | Revoke all sessions for user |
|7| POST | `/api/v1/auth/forgot-password` | Trigger reset-password email/SMS |
|8| POST | `/api/v1/auth/reset-password` | Set new password using reset token |
|9| GET | `/api/v1/auth/sessions` | List active sessions for current user |
|10| DELETE | `/api/v1/auth/sessions/:sessionId` | Revoke a specific session |

**POST /api/v1/auth/login**
- Auth: none. Request: `{ identifier: string, password: string, deviceInfo?: object }`
- Response: `{ accessToken, refreshToken, user: { id, name, role, permissions[] } }`
- Validation: identifier required (email or E.164 phone), password required.
- Business Logic: lookup user by identifier → verify bcrypt hash → check `is_active`, `is_locked` → issue tokens → store refresh token hash in Redis (`session:{userId}:{sessionId}`) → write audit log `LOGIN`.
- Errors: `UNAUTHENTICATED` (bad creds), `FORBIDDEN` (locked/inactive account).

**POST /api/v1/auth/otp/request**
- Request: `{ phone: string, purpose: "LOGIN"|"RESET" }` → Response: `{ otpId, expiresAt }`
- Business Logic: generate 6-digit OTP → store in Redis `otp:{otpId}` TTL 300s with attempt counter → dispatch via SMS provider (BullMQ job `send-otp-sms`).

**POST /api/v1/auth/otp/verify**
- Request: `{ otpId, code }` → Response: `{ accessToken, refreshToken, user }`
- Business Logic: compare code, decrement attempts on mismatch, on 3rd failure invalidate OTP; on success, upsert patient user record if first login, issue tokens.

**POST /api/v1/auth/refresh**
- Request: `{ refreshToken }` → Response: `{ accessToken, refreshToken }`
- Business Logic: verify signature + Redis presence → check rotation family not blacklisted → issue new pair → blacklist old refresh token.

### 4.8 Database Tables (PostgreSQL)
`users`, `user_sessions`, `password_reset_tokens`, `login_attempts`
- `users(id uuid PK, name, email UNIQUE, phone UNIQUE, password_hash, role_id FK->roles, is_active bool, is_locked bool, failed_attempts int, last_login_at, created_at, updated_at, deleted_at)`
- `user_sessions(id uuid PK, user_id FK, refresh_token_hash, device_info jsonb, ip, is_revoked bool, expires_at, created_at)`
- `password_reset_tokens(id uuid PK, user_id FK, token_hash, expires_at, used_at)`
- `login_attempts(id uuid PK, user_id FK NULLABLE, identifier, success bool, ip, created_at)`

### 4.9 Relationships
`users.role_id → roles.id` (N:1); `user_sessions.user_id → users.id` (N:1, cascade delete on user purge).

### 4.10 Mongo Collections
`audit_logs` (login/logout events), `activity_logs`.

### 4.11 Redis Usage
- `session:{userId}:{sessionId}` → refresh token hash, TTL 7d
- `otp:{otpId}` → { code, attempts }, TTL 300s
- `lockout:{userId}` → failed attempt counter, TTL 900s
- `blacklist:{refreshTokenId}` → rotated/revoked tokens

### 4.12 Background Jobs (BullMQ)
- `send-otp-sms`, `send-reset-email`, `purge-expired-sessions` (cron, daily)

### 4.13 Notifications
- SMS: OTP code. Email: password reset link, new-device login alert.

### 4.14 Socket Events
- `auth:session-revoked` (emitted to force client logout when admin revokes a session)

### 4.15 Error Handling
Standard envelope; specific: `ERR_OTP_EXPIRED`, `ERR_OTP_INVALID`, `ERR_ACCOUNT_LOCKED`.

### 4.16 Audit Logs
`LOGIN`, `LOGOUT`, `LOGIN_FAILED`, `PASSWORD_RESET`, `SESSION_REVOKED`.

### 4.17 Activity Logs
"Logged in from Chrome on Windows", "Password changed".

### 4.18 Sequence Flow (Login)
1. Client → POST /auth/login → 2. Server validates credentials → 3. Server checks lockout in Redis → 4. Server issues JWT pair → 5. Server persists session in Redis → 6. Server writes audit log → 7. Response to client → 8. Client stores tokens (httpOnly cookie recommended).

### 4.19 State Diagram (Session)
`ANONYMOUS → AUTHENTICATING → AUTHENTICATED → (REFRESHING ⇄ AUTHENTICATED) → REVOKED/EXPIRED → ANONYMOUS`

### 4.20 Edge Cases
- Concurrent refresh calls with same token (race) → only first succeeds, second gets `CONFLICT`, forces re-login.
- OTP requested repeatedly → rate-limited to 1 per 60s per phone (Redis).
- Clock skew between servers → tokens validated with 30s leeway.

### 4.21 Permission Matrix (module-level)
| Action | SUPER_ADMIN | HOSPITAL_ADMIN | STAFF (all) | PATIENT |
|---|---|---|---|---|
| Login | ✅ | ✅ | ✅ | ✅ (OTP only) |
| View own sessions | ✅ | ✅ | ✅ | ✅ |
| Revoke others' sessions | ✅ | ✅ (own hospital) | ❌ | ❌ |
| Configure auth policy | ✅ | ❌ | ❌ | ❌ |

### 4.22 Acceptance Criteria
- Given valid credentials, login returns access+refresh tokens within 500ms p95.
- Given 5 failed attempts, account locks for 15 minutes and returns `ERR_ACCOUNT_LOCKED`.
- Given an expired OTP, verify returns `ERR_OTP_EXPIRED` and does not issue tokens.
- Given a rotated refresh token reused, all sessions in that family are revoked.

---

## 5. MODULE: Users

### 5.1 Module Description
Manages the lifecycle of all system user accounts (staff) distinct from clinical role-specific profiles (Doctor/Patient have extended profile tables referencing `users`).

### 5.2 Features
CRUD staff users, profile management, avatar upload, activate/deactivate, role assignment, bulk import (CSV), search/filter.

### 5.3 User Roles
`SUPER_ADMIN`, `HOSPITAL_ADMIN` manage users; all roles can view/edit own profile.

### 5.4 Functional Requirements
- FR-USR-01: Admin can create a staff user with a role assignment.
- FR-USR-02: System sends invitation email with temp-password/setup link on creation.
- FR-USR-03: Admin can deactivate/reactivate a user; deactivated users cannot authenticate.
- FR-USR-04: Users can update their own profile (name, phone, avatar) but not their own role.
- FR-USR-05: Admin can bulk-import users via CSV with row-level validation report.

### 5.5 Business Rules
- BR-01: Email/phone unique across the system.
- BR-02: A user cannot deactivate themselves.
- BR-03: Deleting a user is always a soft-delete; hard delete requires SUPER_ADMIN + reason.

### 5.6 Validation Rules
Name required (2–100 chars); email valid & unique; phone E.164 & unique; role_id must reference an existing active role; avatar ≤ 5MB, image mime types only.

### 5.7–5.10 API List
| # | Method | Route | Purpose |
|---|---|---|---|
|1| POST | `/api/v1/users` | Create staff user |
|2| GET | `/api/v1/users` | List/search users (paginated, filter by role/department/status) |
|3| GET | `/api/v1/users/:id` | Get user detail |
|4| PATCH | `/api/v1/users/:id` | Update user profile/role |
|5| DELETE | `/api/v1/users/:id` | Soft-delete/deactivate user |
|6| POST | `/api/v1/users/:id/avatar` | Upload avatar to S3 |
|7| POST | `/api/v1/users/bulk-import` | CSV bulk import |
|8| GET | `/api/v1/users/me` | Get own profile |
|9| PATCH | `/api/v1/users/me` | Update own profile |

**POST /api/v1/users** — Request: `{ name, email, phone, roleId, departmentId? }` — Response: `{ id, name, email, role, status: "PENDING_ACTIVATION" }` — Business Logic: create user with random temp password hash → enqueue `send-invitation-email` → audit log `CREATE`.

### 5.11 Database Tables
`users` (shared with Auth), `user_profiles(id, user_id FK, avatar_url, address, dob, gender, emergency_contact jsonb)`, `user_invitations(id, user_id FK, token_hash, expires_at, accepted_at)`.

### 5.12 Relationships
`user_profiles.user_id → users.id` (1:1); `users.department_id → departments.id` (N:1, nullable).

### 5.13 Mongo Collections
`audit_logs`, `activity_logs`, `bulk_import_reports` (row-level success/failure detail per import job).

### 5.14 Redis Usage
Cache `user:{id}:permissions` (5 min TTL) for fast RBAC checks; invalidated on role change.

### 5.15 Background Jobs
`send-invitation-email`, `process-bulk-import` (async CSV row processing with progress tracked via Redis + Socket event).

### 5.16 Notifications
Email invite, SMS on account activation, in-app notification to admin on bulk-import completion.

### 5.17 Socket Events
`users:bulk-import-progress`, `users:status-changed`.

### 5.18 Error Handling
`ERR_DUPLICATE_EMAIL`, `ERR_INVALID_ROLE`, `ERR_CANNOT_DEACTIVATE_SELF`.

### 5.19–5.20 Audit / Activity Logs
`CREATE`, `UPDATE`, `DEACTIVATE`, `REACTIVATE`, `ROLE_CHANGE`, `BULK_IMPORT`.

### 5.21 Sequence Flow (Create User)
Admin submits form → API validates uniqueness → creates row → uploads avatar (optional, separate call) → enqueues invitation email → returns 201 → Socket notifies admin dashboard user-count widget.

### 5.22 State Diagram
`PENDING_ACTIVATION → ACTIVE ⇄ DEACTIVATED → (soft) DELETED`

### 5.23 Edge Cases
Bulk import with duplicate emails within same file → only first row processed, rest flagged as errors in report; concurrent role update vs permission cache → cache invalidated synchronously before response.

### 5.24 Permission Matrix
| Action | SUPER_ADMIN | HOSPITAL_ADMIN | Others |
|---|---|---|---|
| Create user | ✅ | ✅ | ❌ |
| Deactivate user | ✅ | ✅ | ❌ |
| Edit own profile | ✅ | ✅ | ✅ |
| Bulk import | ✅ | ✅ | ❌ |

### 5.25 Acceptance Criteria
- Creating a user with an existing email returns `409 ERR_DUPLICATE_EMAIL`.
- Deactivated user's login attempt returns `403 FORBIDDEN`.
- Bulk import of 500 rows completes with per-row status report within SLA and emits progress events.

---

## 6. MODULE: Roles

### 6.1 Module Description
Defines RBAC roles and granular permissions used across all modules; drives dynamic UI rendering and API authorization.

### 6.2 Features
CRUD roles, assign permissions to roles (matrix UI), clone role, view role usage count.

### 6.3 User Roles
`SUPER_ADMIN` full control; `HOSPITAL_ADMIN` can create hospital-scoped custom roles (not system roles).

### 6.4 Functional Requirements
- FR-ROLE-01: System ships with fixed system roles that cannot be deleted (`SUPER_ADMIN`, `DOCTOR`, `PATIENT`, etc.).
- FR-ROLE-02: Admin can create custom roles composed of existing permission keys.
- FR-ROLE-03: Permission changes propagate to active sessions within 5 minutes (cache TTL) or immediately via Socket-forced re-auth for sensitive changes.

### 6.5 Business Rules
- BR-01: System roles (`is_system=true`) are immutable/non-deletable.
- BR-02: A role in use by ≥1 user cannot be deleted (must reassign first).

### 6.6 Validation Rules
Role name unique, 3–50 chars; permission keys must exist in `permissions` master table.

### 6.7 API List
| # | Method | Route | Purpose |
|---|---|---|---|
|1| POST | `/api/v1/roles` | Create role |
|2| GET | `/api/v1/roles` | List roles |
|3| GET | `/api/v1/roles/:id` | Role detail with permissions |
|4| PATCH | `/api/v1/roles/:id` | Update role/permissions |
|5| DELETE | `/api/v1/roles/:id` | Delete unused custom role |
|6| GET | `/api/v1/permissions` | List all permission keys (master list) |

**PATCH /api/v1/roles/:id** — Request: `{ name?, permissionKeys?: string[] }` — Business Logic: diff old vs new permissions → update `role_permissions` join → invalidate Redis cache for all users holding that role → audit log with before/after diff.

### 6.8 Database Tables
`roles(id, name UNIQUE, description, is_system bool, created_at)`, `permissions(id, key UNIQUE, module, description)`, `role_permissions(role_id FK, permission_id FK, PK(role_id,permission_id))`.

### 6.9 Relationships
`role_permissions` is the M:N join between `roles` and `permissions`. `users.role_id → roles.id`.

### 6.10 Mongo Collections
`audit_logs`.

### 6.11 Redis Usage
`permissions:role:{roleId}` cached permission set, invalidated on update.

### 6.12 Background Jobs
None (synchronous); optional `notify-affected-users` job to push forced-reauth Socket event to all sessions of affected role.

### 6.13 Notifications
In-app alert to affected users: "Your permissions have changed, please re-login."

### 6.14 Socket Events
`roles:permissions-updated { roleId }`

### 6.15 Error Handling
`ERR_SYSTEM_ROLE_IMMUTABLE`, `ERR_ROLE_IN_USE`.

### 6.16–6.17 Audit / Activity Logs
`CREATE`, `UPDATE`, `DELETE` with full permission diff stored in `before/after`.

### 6.18 Sequence Flow
Admin edits permission matrix checkboxes → single PATCH with full desired permission set → server computes diff → transactional update of join table → cache bust → socket broadcast.

### 6.19 State Diagram
`DRAFT (client-side only) → ACTIVE → (locked if is_system) | DELETED (if unused)`

### 6.20 Edge Cases
Removing a permission currently relied on by an in-progress request (race) — accepted risk, mitigated by short cache TTL; attempt to delete `SUPER_ADMIN` role → hard blocked at DB constraint + app layer.

### 6.21 Permission Matrix
| Action | SUPER_ADMIN | HOSPITAL_ADMIN |
|---|---|---|
| Manage system roles | ✅ | ❌ |
| Manage custom roles | ✅ | ✅ |

### 6.22 Acceptance Criteria
- Attempt to delete a system role returns `403 ERR_SYSTEM_ROLE_IMMUTABLE`.
- Permission change is reflected for new API calls within cache TTL window (≤5 min), verified via test that hits protected endpoint before/after.

---

## 7. MODULE: Departments

### 7.1 Module Description
Master data for hospital departments/specialties (Cardiology, Orthopedics, etc.), used to organize doctors, OPD queues, wards, and billing categories.

### 7.2 Features
CRUD departments, assign HOD (head of department), department-wise doctor listing, active/inactive toggle.

### 7.3 User Roles
`SUPER_ADMIN`, `HOSPITAL_ADMIN` manage; all staff read.

### 7.4 Functional Requirements
- FR-DEPT-01: Admin can create a department with name, code, description, HOD.
- FR-DEPT-02: Department code is used as prefix for OPD token numbers (e.g., `CARD-001`).
- FR-DEPT-03: Deactivating a department blocks new appointment creation against it but preserves history.

### 7.5 Business Rules
- BR-01: Department code unique, uppercase, 2–10 chars.
- BR-02: A department cannot be deleted if it has active doctors/wards linked; must be deactivated instead.

### 7.6 Validation Rules
Name required unique; code regex `^[A-Z0-9]{2,10}$`; HOD must be a user with role `DOCTOR`.

### 7.7 API List
| # | Method | Route | Purpose |
|---|---|---|---|
|1| POST | `/api/v1/departments` | Create department |
|2| GET | `/api/v1/departments` | List departments |
|3| GET | `/api/v1/departments/:id` | Detail incl. doctor count, active wards |
|4| PATCH | `/api/v1/departments/:id` | Update |
|5| DELETE | `/api/v1/departments/:id` | Deactivate/soft-delete |
|6| GET | `/api/v1/departments/:id/doctors` | Doctors in department |

### 7.8 Database Tables
`departments(id, name UNIQUE, code UNIQUE, description, hod_user_id FK NULLABLE, is_active bool, created_at, deleted_at)`

### 7.9 Relationships
`doctors.department_id → departments.id`; `wards.department_id → departments.id`; `appointments.department_id → departments.id` (denormalized for query speed).

### 7.10 Mongo Collections
`audit_logs`.

### 7.11 Redis Usage
`departments:list` cached (10 min TTL, invalidated on write) — read-heavy, low-write master data.

### 7.12 Background Jobs
None.

### 7.13 Notifications
None (internal admin operation); optional email to newly assigned HOD.

### 7.14 Socket Events
`departments:updated` (refresh dropdowns across active admin sessions).

### 7.15 Error Handling
`ERR_DUPLICATE_CODE`, `ERR_DEPARTMENT_IN_USE`.

### 7.16–7.17 Audit / Activity Logs
`CREATE`, `UPDATE`, `DEACTIVATE`.

### 7.18 Sequence Flow
Admin creates department → validate uniqueness → persist → bust cache → broadcast socket → available immediately in doctor/appointment dropdowns.

### 7.19 State Diagram
`ACTIVE ⇄ INACTIVE → DELETED (only if zero dependents)`

### 7.20 Edge Cases
Renaming a department after token numbers already generated with old code prefix — historical tokens retain original prefix (immutable), only new tokens use updated code.

### 7.21 Permission Matrix
| Action | SUPER_ADMIN | HOSPITAL_ADMIN | Others |
|---|---|---|---|
| CRUD | ✅ | ✅ | ❌ (read-only) |

### 7.22 Acceptance Criteria
- Deactivating a department with active doctors succeeds but blocks new appointment creation returning `ERR_DEPARTMENT_INACTIVE`.

---

## 8. MODULE: Doctors

### 8.1 Module Description
Extended clinical profile for users with role `DOCTOR`: specialization, qualifications, consultation fee, schedule/availability, OPD slots.

### 8.2 Features
Doctor profile CRUD, weekly availability/slot configuration, leave management, department assignment, consultation fee configuration, doctor search by specialization.

### 8.3 User Roles
`SUPER_ADMIN`, `HOSPITAL_ADMIN` manage profiles; `DOCTOR` manages own availability/leaves; `RECEPTIONIST`/`PATIENT` read for booking.

### 8.4 Functional Requirements
- FR-DOC-01: Admin creates doctor profile linked to a `users` record with role DOCTOR.
- FR-DOC-02: Doctor defines weekly recurring availability (day, start-time, end-time, slot-duration) per department/clinic.
- FR-DOC-03: Doctor can mark leave/unavailability for date ranges, auto-blocking new bookings in that window.
- FR-DOC-04: System computes real-time available slot list for booking based on availability minus existing appointments minus leaves.

### 8.5 Business Rules
- BR-01: Slot duration configurable per doctor (default 15 min).
- BR-02: A doctor cannot be double-booked for overlapping OPD and IPD rounds at the same timestamp (soft-warning, not hard-block, since doctors may override).
- BR-03: License/registration number unique per doctor.

### 8.6 Validation Rules
Registration number required, alphanumeric; specialization from controlled vocabulary; consultation fee ≥ 0; slot duration 5–120 minutes.

### 8.7 API List
| # | Method | Route | Purpose |
|---|---|---|---|
|1| POST | `/api/v1/doctors` | Create doctor profile |
|2| GET | `/api/v1/doctors` | List/search (by dept, specialization, availability today) |
|3| GET | `/api/v1/doctors/:id` | Doctor detail |
|4| PATCH | `/api/v1/doctors/:id` | Update profile/fee |
|5| POST | `/api/v1/doctors/:id/availability` | Set weekly availability |
|6| POST | `/api/v1/doctors/:id/leave` | Mark leave |
|7| GET | `/api/v1/doctors/:id/slots?date=` | Get computed available slots for a date |
|8| DELETE | `/api/v1/doctors/:id` | Deactivate |

**GET /api/v1/doctors/:id/slots?date=YYYY-MM-DD**
- Business Logic: fetch weekly availability template for that weekday → subtract existing `appointments` (status not CANCELLED) → subtract `doctor_leaves` overlapping date → return free slot array; result cached in Redis for 60s to absorb booking-page traffic bursts.

### 8.8 Database Tables
`doctors(id, user_id FK UNIQUE, department_id FK, registration_no UNIQUE, specialization, qualifications jsonb, consultation_fee numeric, experience_years int, bio text, is_active bool)`
`doctor_availability(id, doctor_id FK, weekday smallint, start_time, end_time, slot_duration_minutes, clinic_room)`
`doctor_leaves(id, doctor_id FK, start_date, end_date, reason, created_at)`

### 8.9 Relationships
`doctors.user_id → users.id` (1:1); `doctors.department_id → departments.id` (N:1); `doctor_availability.doctor_id`, `doctor_leaves.doctor_id → doctors.id` (1:N).

### 8.10 Mongo Collections
`audit_logs`, `activity_logs` (doctor's daily activity feed: patients seen, prescriptions issued).

### 8.11 Redis Usage
`doctor:{id}:slots:{date}` cache (60s TTL); `doctor:{id}:profile` cache (10 min TTL).

### 8.12 Background Jobs
`recompute-slot-cache` (triggered on appointment booking/cancellation to eagerly refresh cache), `leave-conflict-notify` (notify reception when leave overlaps existing bookings — requires rescheduling).

### 8.13 Notifications
Doctor notified of new booking; reception notified when doctor marks leave that conflicts with existing appointments (with list of affected patients to reschedule).

### 8.14 Socket Events
`doctors:availability-updated`, `doctors:slots-changed { doctorId, date }`

### 8.15 Error Handling
`ERR_DUPLICATE_REGISTRATION`, `ERR_LEAVE_CONFLICT` (warning, not blocking), `ERR_INVALID_SLOT_DURATION`.

### 8.16–8.17 Audit / Activity Logs
`CREATE`, `UPDATE`, `AVAILABILITY_SET`, `LEAVE_MARKED`.

### 8.18 Sequence Flow (Slot Booking Support)
Patient opens booking UI → GET `/doctors/:id/slots?date=` → cache checked → if miss, compute from availability minus bookings/leaves → cache write → return to client → client presents slot grid.

### 8.19 State Diagram (Doctor Profile)
`ACTIVE ⇄ ON_LEAVE ⇄ INACTIVE`

### 8.20 Edge Cases
Doctor marks leave for a date with existing confirmed appointments → system flags all affected appointments as `NEEDS_RESCHEDULE` and notifies reception + patients, does not auto-cancel.
Overlapping availability windows entered by mistake → validation rejects overlapping ranges for same weekday.

### 8.21 Permission Matrix
| Action | SUPER_ADMIN | HOSPITAL_ADMIN | DOCTOR (self) | RECEPTIONIST | PATIENT |
|---|---|---|---|---|---|
| Create/Deactivate profile | ✅ | ✅ | ❌ | ❌ | ❌ |
| Set availability/leave | ✅ | ✅ | ✅ | ❌ | ❌ |
| View slots | ✅ | ✅ | ✅ | ✅ | ✅ |

### 8.22 Acceptance Criteria
- Given a doctor's availability and 3 booked slots, `/slots` returns exactly the remaining free slots, excluding cancelled-appointment slots which are marked free again.
- Marking leave over existing bookings sets those appointments to `NEEDS_RESCHEDULE` and triggers notifications within 30s (async job).

---

## 9. MODULE: Patients

### 9.1 Module Description
Master patient record (MPI - Master Patient Index): demographics, medical history summary, insurance, emergency contacts — the anchor entity for OPD, IPD, billing, lab, pharmacy.

### 9.2 Features
Patient registration (walk-in & self-service), UHID generation, demographic/medical history management, document uploads (ID proof, insurance card), family/dependent linking, merge duplicate patient records.

### 9.3 User Roles
`RECEPTIONIST` registers walk-ins; `PATIENT` self-registers via portal; `DOCTOR`/`NURSE` read + update medical history; `HOSPITAL_ADMIN` full access; `SUPER_ADMIN` cross-hospital.

### 9.4 Functional Requirements
- FR-PAT-01: System generates a unique UHID (Unique Health ID) on registration, format `HMS-{YY}-{sequence}`.
- FR-PAT-02: Registration captures demographics, blood group, allergies, chronic conditions, emergency contact.
- FR-PAT-03: Patient can self-register via OTP login and complete profile.
- FR-PAT-04: Admin/reception can search patients by UHID, name, phone, or Aadhaar/national ID (masked display).
- FR-PAT-05: System supports merging two duplicate patient records (audit-logged, irreversible) preserving all historical clinical data under the surviving UHID.

### 9.5 Business Rules
- BR-01: UHID is immutable once generated.
- BR-02: Phone number unique per active patient record (soft-deleted duplicates excluded from uniqueness check).
- BR-03: Minors (age < 18) require a linked guardian patient/user record.

### 9.6 Validation Rules
Name required; DOB required, not in future; blood group from enum (`A+,A-,B+,B-,AB+,AB-,O+,O-,UNKNOWN`); phone E.164; national ID format validated per country config.

### 9.7 API List
| # | Method | Route | Purpose |
|---|---|---|---|
|1| POST | `/api/v1/patients` | Register new patient |
|2| GET | `/api/v1/patients` | Search/list patients |
|3| GET | `/api/v1/patients/:id` | Full patient profile + timeline |
|4| PATCH | `/api/v1/patients/:id` | Update demographics/medical history |
|5| POST | `/api/v1/patients/:id/documents` | Upload ID/insurance doc to S3 |
|6| POST | `/api/v1/patients/merge` | Merge duplicate records |
|7| GET | `/api/v1/patients/:id/timeline` | Aggregated visit/appointment/lab/prescription timeline |
|8| GET | `/api/v1/patients/me` | Patient self-profile (portal) |

**POST /api/v1/patients**
- Request: `{ name, dob, gender, phone, email?, bloodGroup?, address, emergencyContact: {name, phone, relation}, allergies?: string[], guardianPatientId?: uuid }`
- Response: `{ id, uhid, name, ... }`
- Business Logic: generate UHID via Postgres sequence per year → create patient row → if `guardianPatientId` provided validate age<18 → audit log `CREATE`.

### 9.8 Database Tables
`patients(id, uhid UNIQUE, user_id FK NULLABLE, name, dob, gender, phone UNIQUE, email, blood_group, address jsonb, emergency_contact jsonb, allergies text[], chronic_conditions text[], guardian_patient_id FK NULLABLE self-ref, is_active bool, created_at, deleted_at)`
`patient_documents(id, patient_id FK, doc_type ENUM(ID_PROOF,INSURANCE,OTHER), s3_key, uploaded_by FK users, created_at)`
`patient_merge_logs(id, surviving_patient_id FK, merged_patient_id FK, performed_by FK, reason, created_at)`

### 9.9 Relationships
`patients.user_id → users.id` (1:1, nullable for walk-in-only patients without portal login); `patients.guardian_patient_id → patients.id` (self-referential, N:1); referenced by `appointments`, `opd_visits`, `ipd_admissions`, `prescriptions`, `lab_orders`, `bills`.

### 9.10 Mongo Collections
`audit_logs`, `activity_logs`, `patient_timeline_cache` (denormalized read-optimized aggregation of cross-module events for fast timeline rendering, rebuilt async on each new clinical event).

### 9.11 Redis Usage
`patient:{uhid}:lookup` cache for fast search-by-UHID (5 min TTL); duplicate-phone check uses a Redis SETNX-based short-lived lock during registration to avoid race-condition duplicate creation.

### 9.12 Background Jobs
`rebuild-patient-timeline` (on any related-module write, enqueue timeline rebuild for that patient), `s3-document-scan` (virus scan uploaded ID docs).

### 9.13 Notifications
SMS with UHID on successful registration; email registration confirmation if email provided.

### 9.14 Socket Events
`patients:registered` (reception dashboard live counter), `patients:merged`.

### 9.15 Error Handling
`ERR_DUPLICATE_PHONE`, `ERR_INVALID_GUARDIAN`, `ERR_MERGE_CONFLICT`.

### 9.16–9.17 Audit / Activity Logs
`CREATE`, `UPDATE`, `DOCUMENT_UPLOAD`, `MERGE` (full before/after of both records).

### 9.18 Sequence Flow (Registration)
Reception fills form → API acquires Redis lock on phone → validates uniqueness → generates UHID from Postgres sequence → inserts row → releases lock → enqueues timeline init job → SMS sent → response with UHID → printed on ID card.

### 9.19 State Diagram
`REGISTERED → ACTIVE ⇄ INACTIVE → (rare) MERGED_AWAY`

### 9.20 Edge Cases
Two receptionists register same phone number simultaneously → Redis lock ensures only one succeeds, second gets `ERR_DUPLICATE_PHONE` with existing UHID suggested for lookup instead.
Merging patients with active IPD admission on the "losing" record → merge blocked with `ERR_MERGE_CONFLICT` until admission is discharged/reassigned.

### 9.21 Permission Matrix
| Action | SUPER_ADMIN | HOSPITAL_ADMIN | RECEPTIONIST | DOCTOR/NURSE | PATIENT (self) |
|---|---|---|---|---|---|
| Register | ✅ | ✅ | ✅ | ❌ | ✅ (self) |
| View any patient | ✅ | ✅ | ✅ | ✅ | ❌ |
| Update medical history | ✅ | ✅ | ❌ | ✅ | ❌ |
| Merge records | ✅ | ✅ | ❌ | ❌ | ❌ |

### 9.22 Acceptance Criteria
- Registration returns a UHID matching pattern `HMS-\d{2}-\d+` and is unique.
- Duplicate phone registration attempt returns `409 ERR_DUPLICATE_PHONE` with the existing UHID in error details.
- Merge operation preserves all appointments/prescriptions/bills of the merged record under the surviving UHID and is fully reversible-by-audit-trail (not by API).

---

## 10. MODULE: Appointments

### 10.1 Module Description
Manages scheduling of patient-doctor consultations (OPD-bound), the entry point converting a booking into an OPD visit on the appointment date.

### 10.2 Features
Book/reschedule/cancel appointment, doctor slot validation, queue token generation, reminders, walk-in vs online booking, waitlist.

### 10.3 User Roles
`RECEPTIONIST`, `PATIENT` (self-book), `DOCTOR` (view own), `HOSPITAL_ADMIN`.

### 10.4 Functional Requirements
- FR-APT-01: Patient/reception books an appointment against an available doctor slot.
- FR-APT-02: System prevents double-booking of the same slot (transactional check).
- FR-APT-03: Appointment can be rescheduled or cancelled up to a configurable cutoff (default 1 hour before).
- FR-APT-04: On the visit date, an appointment transitions into an OPD visit token when patient checks in.
- FR-APT-05: System sends reminder notifications 24h and 1h before appointment.

### 10.5 Business Rules
- BR-01: Slot booking is atomic — enforced via unique constraint `(doctor_id, appointment_date, slot_start_time)` plus advisory DB lock.
- BR-02: Cancellation within cutoff window requires admin override.
- BR-03: No-show after grace period (default 15 min past slot) auto-marks appointment `NO_SHOW`.

### 10.6 Validation Rules
Appointment date/time must be within doctor's future availability; patient and doctor must both be active.

### 10.7 API List
| # | Method | Route | Purpose |
|---|---|---|---|
|1| POST | `/api/v1/appointments` | Create appointment (patient → `PENDING` request; staff → `BOOKED` directly) |
|2| GET | `/api/v1/appointments` | List/filter (by patient, doctor, date, status) |
|3| GET | `/api/v1/appointments/:id` | Detail |
|4| PATCH | `/api/v1/appointments/:id/approve` | Approve `PENDING` request → `BOOKED` + notify patient/doctor |
|5| PATCH | `/api/v1/appointments/:id/reject` | Reject `PENDING` request → `REJECTED` + notify patient with reason |
|6| PATCH | `/api/v1/appointments/:id/reschedule` | Reschedule (patient → back to `PENDING`; staff → direct `BOOKED`) |
|7| PATCH | `/api/v1/appointments/:id/cancel` | Cancel |
|8| POST | `/api/v1/appointments/:id/check-in` | Convert to OPD visit + issue token |
|9| GET | `/api/v1/appointments/queue?doctorId=&date=` | Live queue for a doctor's day |
|10| PATCH | `/api/v1/appointments/:id/complete` | Mark done: `BOOKED`/`CHECKED_IN` → `COMPLETED` (doctor: own only) |

**POST /api/v1/appointments**
- Request: `{ patientId?, doctorId, departmentId, date, slotStartTime, reason?, mode: "IN_PERSON"|"TELECONSULT" }`
- Response: `{ id, status: "PENDING"|"BOOKED", tokenPrefix }` — `patientId` is forced to the caller's own Patient record for `PATIENT` role.
- Business Logic: verify doctor active + not on leave + department active + slot free → insert row (`PENDING` for patient self-service, `BOOKED` for staff) → on `BOOKED` reserve unique `slotKey`; on `PENDING` notify receptionists.

### 10.8 Database Tables
`appointments(id, patient_id FK, doctor_id FK, department_id FK, appointment_date date, slot_start_time time, slot_end_time time, mode ENUM, status ENUM(PENDING,BOOKED,CHECKED_IN,COMPLETED,CANCELLED,REJECTED,NO_SHOW,NEEDS_RESCHEDULE), reason text, created_by FK users, reviewed_by FK users, decision_note text, created_at, updated_at)`
UNIQUE constraint: `slot_key` (non-null only while `BOOKED` — `PENDING` rows reserve no slot).

### 10.9 Relationships
`appointments.patient_id → patients.id`, `.doctor_id → doctors.id`, `.department_id → departments.id`; 1:1 optional link to `opd_visits.appointment_id` once checked in.

### 10.10 Mongo Collections
`audit_logs`, `activity_logs`.

### 10.11 Redis Usage
Advisory-lock pattern backed by Redis `SET NX PX` as a fast pre-check before DB transaction (defense in depth against race); queue live-count `queue:{doctorId}:{date}` incremented on check-in.

### 10.12 Background Jobs
`send-appointment-reminder-24h`, `send-appointment-reminder-1h`, `auto-mark-no-show` (cron, every 5 min, scans past-grace-period CONFIRMED appointments).

### 10.13 Notifications
SMS/Email/Push confirmation, reminders, cancellation notice to both patient and doctor.

### 10.14 Socket Events
`appointments:requested` (new pending request → admins/reception), `appointments:booked`, `appointments:rejected`, `appointments:cancelled`, `appointments:queue-updated { doctorId, date, queue[] }`

### 10.15 Error Handling
`ERR_SLOT_TAKEN` (409), `ERR_CANCEL_WINDOW_PASSED`, `ERR_DOCTOR_UNAVAILABLE`.

### 10.16–10.17 Audit / Activity Logs
`CREATE`, `RESCHEDULE`, `CANCEL`, `CHECK_IN`, `NO_SHOW`.

### 10.18 Sequence Flow (Booking → Check-in)
1. Client requests slots → 2. Client books → advisory lock → insert → 3. Reminders scheduled → 4. Day-of: patient checks in at reception → 5. `check-in` API creates `opd_visits` row + generates token number → 6. Socket pushes updated queue to doctor's dashboard & waiting-room display.

### 10.19 State Diagram
`CONFIRMED → CHECKED_IN → COMPLETED`
`CONFIRMED → CANCELLED`
`CONFIRMED → NO_SHOW` (auto, cron)
`CONFIRMED → NEEDS_RESCHEDULE` (triggered by doctor leave)

### 10.20 Edge Cases
Two patients hitting the same slot simultaneously → Redis pre-lock + DB unique constraint guarantees only one wins; loser gets `ERR_SLOT_TAKEN` and is shown next available slot.
Patient checks in for wrong doctor's queue (data entry) → reception can void check-in and re-issue token, original token marked `VOID` (not deleted, audit-preserved).

### 10.21 Permission Matrix
| Action | SUPER_ADMIN | HOSPITAL_ADMIN | RECEPTIONIST | DOCTOR | PATIENT (self) |
|---|---|---|---|---|---|
| Book | ✅ | ✅ | ✅ | ❌ | ✅ |
| Cancel/Reschedule | ✅ | ✅ | ✅ | ❌ | ✅ (own, pre-cutoff) |
| Check-in | ✅ | ✅ | ✅ | ❌ | ❌ |
| View queue | ✅ | ✅ | ✅ | ✅ (own) | ❌ |

### 10.22 Acceptance Criteria
- Concurrent booking requests for the identical slot: exactly one `201`, all others `409 ERR_SLOT_TAKEN`.
- No-show auto-transition occurs within 5 minutes of grace-period expiry.
- Check-in creates exactly one `opd_visits` row and emits one queue-update socket event.

---

## 11. MODULE: OPD (Outpatient Department)

### 11.1 Module Description
Manages the outpatient consultation workflow from check-in token through consultation, vitals capture, diagnosis, and visit closure.

### 11.2 Features
Token/queue management, vitals capture (nurse), consultation notes (doctor), diagnosis (ICD-10 coded), referral to specialist, visit closure, link to prescription/lab orders.

### 11.3 User Roles
`RECEPTIONIST` (check-in), `NURSE` (vitals), `DOCTOR` (consultation), `HOSPITAL_ADMIN`.

### 11.4 Functional Requirements
- FR-OPD-01: Check-in generates a queue token (`{deptCode}-{seq}`) reset daily per department.
- FR-OPD-02: Nurse records vitals (BP, pulse, temp, SpO2, weight, height) before doctor consultation.
- FR-OPD-03: Doctor records chief complaint, examination notes, diagnosis (ICD-10), and closes the visit.
- FR-OPD-04: Visit can spawn a Prescription, Lab Order(s), or IPD admission referral.
- FR-OPD-05: Live queue display updates in real time as tokens are called/completed.

### 11.5 Business Rules
- BR-01: Vitals must be recorded before visit status can move to `IN_CONSULTATION`.
- BR-02: A visit cannot be closed without at least one diagnosis or explicit "no diagnosis" note.
- BR-03: Token numbering resets to 1 at midnight per department.

### 11.6 Validation Rules
Vitals within physiologically plausible ranges (soft warning if outside, e.g., temp 30–45°C); diagnosis code must exist in ICD-10 reference table.

### 11.7 API List
| # | Method | Route | Purpose |
|---|---|---|---|
|1| POST | `/api/v1/opd/visits/:appointmentId/vitals` | Record vitals |
|2| GET | `/api/v1/opd/visits/:id` | Visit detail |
|3| PATCH | `/api/v1/opd/visits/:id/start-consultation` | Doctor calls token, starts consult |
|4| PATCH | `/api/v1/opd/visits/:id/diagnosis` | Save diagnosis/notes |
|5| PATCH | `/api/v1/opd/visits/:id/close` | Close visit |
|6| GET | `/api/v1/opd/queue?departmentId=&date=` | Live department queue |
|7| POST | `/api/v1/opd/visits/:id/refer-ipd` | Refer to IPD admission |

### 11.8 Database Tables
`opd_visits(id, appointment_id FK UNIQUE, patient_id FK, doctor_id FK, department_id FK, token_number varchar, status ENUM(WAITING,VITALS_DONE,IN_CONSULTATION,COMPLETED,REFERRED_IPD), checked_in_at, consultation_started_at, closed_at)`
`opd_vitals(id, visit_id FK, bp_systolic, bp_diastolic, pulse, temperature, spo2, weight, height, recorded_by FK, recorded_at)`
`opd_diagnoses(id, visit_id FK, icd10_code, description, notes text, diagnosed_by FK, created_at)`

### 11.9 Relationships
`opd_visits.appointment_id → appointments.id` (1:1); `opd_vitals.visit_id`, `opd_diagnoses.visit_id → opd_visits.id` (1:N); links out to `prescriptions.opd_visit_id`, `lab_orders.opd_visit_id`, `ipd_admissions.referred_from_visit_id`.

### 11.10 Mongo Collections
`audit_logs`, `activity_logs`, `patient_timeline_cache` update triggers.

### 11.11 Redis Usage
`opd:queue:{departmentId}:{date}` — sorted set of tokens by check-in time, used to drive the waiting-room display with O(log n) updates; `opd:token-counter:{departmentId}:{date}` atomic INCR for token sequence.

### 11.12 Background Jobs
`reset-daily-token-counters` (cron, midnight), `stale-visit-alert` (flags visits stuck in WAITING > 2h for admin review).

### 11.13 Notifications
Push/SMS to patient when token is 3 positions away ("almost your turn"); doctor dashboard alert on new patient in queue.

### 11.14 Socket Events
`opd:queue-updated { departmentId, queue[] }`, `opd:token-called { visitId, tokenNumber }`, `opd:visit-closed`

### 11.15 Error Handling
`ERR_VITALS_REQUIRED`, `ERR_DIAGNOSIS_REQUIRED_TO_CLOSE`, `ERR_INVALID_ICD10`.

### 11.16–11.17 Audit / Activity Logs
`VITALS_RECORDED`, `CONSULTATION_STARTED`, `DIAGNOSIS_SAVED`, `VISIT_CLOSED`, `REFERRED_IPD`.

### 11.18 Sequence Flow (Full OPD)
1. Reception checks in → token issued (Redis INCR) → 2. Nurse records vitals → status `VITALS_DONE` → 3. Doctor calls next token (socket) → status `IN_CONSULTATION` → 4. Doctor examines, records diagnosis → 5. Doctor optionally creates Prescription/Lab Order/IPD referral → 6. Doctor closes visit → status `COMPLETED` → 7. Visit flows to Billing for consultation charge.

### 11.19 State Diagram
`WAITING → VITALS_DONE → IN_CONSULTATION → COMPLETED`
`IN_CONSULTATION → REFERRED_IPD`

### 11.20 Edge Cases
Doctor closes visit without diagnosis → blocked unless "no diagnosis / follow-up only" flag explicitly set.
Patient leaves after vitals but before consultation (walkout) → admin can mark visit `ABANDONED` (extension of COMPLETED terminal branch) after timeout, excluded from doctor's active queue.

### 11.21 Permission Matrix
| Action | RECEPTIONIST | NURSE | DOCTOR | HOSPITAL_ADMIN |
|---|---|---|---|---|
| Check-in | ✅ | ❌ | ❌ | ✅ |
| Record vitals | ❌ | ✅ | ✅ | ✅ |
| Consultation/diagnosis | ❌ | ❌ | ✅ | ✅ (view only) |
| Close visit | ❌ | ❌ | ✅ | ✅ |

### 11.22 Acceptance Criteria
- Token numbers are sequential and unique per department per day, reset at midnight.
- Queue socket updates propagate to all subscribed clients within 1s of a state change.
- Visit cannot reach `COMPLETED` without vitals recorded and diagnosis (or explicit waiver) present.

---

## 12. MODULE: IPD (Inpatient Department)

### 12.1 Module Description
Manages hospital admission lifecycle: admission, ward/bed assignment, daily rounds/progress notes, nursing charting, discharge summary.

### 12.2 Features
Admission (from OPD referral, emergency, or direct), bed assignment, doctor rounds & progress notes, nursing vitals charting, medication administration record (MAR) link to prescriptions, discharge planning & summary generation.

### 12.3 User Roles
`DOCTOR`, `NURSE`, `HOSPITAL_ADMIN`, `RECEPTIONIST` (admission desk), `BILLING_STAFF` (discharge clearance).

### 12.4 Functional Requirements
- FR-IPD-01: Admission requires bed availability check and assignment at creation.
- FR-IPD-02: System generates an admission number (`IPD-{YY}-{seq}`).
- FR-IPD-03: Doctor records daily rounds/progress notes against the admission.
- FR-IPD-04: Nurse charts vitals at configurable intervals (e.g., every 4h).
- FR-IPD-05: Discharge requires: billing clearance, pending-medication reconciliation, discharge summary sign-off by attending doctor.
- FR-IPD-06: On discharge, bed is released and made available for reassignment.

### 12.5 Business Rules
- BR-01: A patient cannot have two simultaneous active IPD admissions.
- BR-02: Bed transfer (ward-to-ward) creates a transfer record, does not close the admission.
- BR-03: Discharge is blocked while billing status is `PENDING` (billing must clear first, or admin override with reason).

### 12.6 Validation Rules
Bed must be `AVAILABLE` at assignment time; attending doctor required; discharge summary mandatory fields: diagnosis, treatment summary, follow-up instructions.

### 12.7 API List
| # | Method | Route | Purpose |
|---|---|---|---|
|1| POST | `/api/v1/ipd/admissions` | Admit patient |
|2| GET | `/api/v1/ipd/admissions` | List (by ward, status, doctor) |
|3| GET | `/api/v1/ipd/admissions/:id` | Full admission detail |
|4| POST | `/api/v1/ipd/admissions/:id/rounds` | Add doctor round/progress note |
|5| POST | `/api/v1/ipd/admissions/:id/vitals` | Nurse vitals charting |
|6| POST | `/api/v1/ipd/admissions/:id/transfer` | Ward/bed transfer |
|7| PATCH | `/api/v1/ipd/admissions/:id/discharge` | Discharge patient |
|8| GET | `/api/v1/ipd/admissions/:id/discharge-summary` | Generate/fetch discharge summary PDF |

**POST /api/v1/ipd/admissions**
- Request: `{ patientId, admittingDoctorId, wardId, bedId, admissionType: "EMERGENCY"|"REFERRAL"|"DIRECT", referredFromVisitId? }`
- Business Logic: acquire lock on `bedId` → verify `AVAILABLE` → transactionally set bed `OCCUPIED` + insert admission row → generate admission number → audit log → socket bed-status update.

### 12.8 Database Tables
`ipd_admissions(id, admission_no UNIQUE, patient_id FK, admitting_doctor_id FK, ward_id FK, bed_id FK, admission_type ENUM, referred_from_visit_id FK NULLABLE, status ENUM(ADMITTED,IN_TREATMENT,DISCHARGE_PLANNED,DISCHARGED), admitted_at, discharged_at)`
`ipd_rounds(id, admission_id FK, doctor_id FK, notes text, created_at)`
`ipd_vitals(id, admission_id FK, bp_systolic, bp_diastolic, pulse, temperature, spo2, recorded_by FK, recorded_at)`
`ipd_transfers(id, admission_id FK, from_bed_id FK, to_bed_id FK, reason, transferred_by FK, created_at)`
`discharge_summaries(id, admission_id FK UNIQUE, diagnosis text, treatment_summary text, follow_up_instructions text, signed_by FK doctors, s3_key, created_at)`

### 12.9 Relationships
`ipd_admissions.patient_id → patients.id`; `.bed_id → beds.id`; `.ward_id → wards.id`; 1:N to `ipd_rounds`, `ipd_vitals`, `ipd_transfers`; 1:1 to `discharge_summaries`; linked from `prescriptions.ipd_admission_id`, `bills.ipd_admission_id`.

### 12.10 Mongo Collections
`audit_logs`, `activity_logs`, `patient_timeline_cache`.

### 12.11 Redis Usage
Bed-assignment uses Redis distributed lock (`lock:bed:{bedId}`, 5s TTL) to prevent concurrent double-assignment; `ipd:census:{wardId}` live occupancy counter.

### 12.12 Background Jobs
`vitals-charting-reminder` (BullMQ repeatable, per admission per configured interval), `discharge-summary-pdf-generate`, `long-stay-alert` (flags admissions > configurable threshold days).

### 12.13 Notifications
Doctor reminded of due rounds; nurse reminded of due vitals charting; billing notified when discharge is planned (to prepare final bill); patient's family notified (SMS) on admission/discharge.

### 12.14 Socket Events
`ipd:admitted`, `ipd:bed-status-changed`, `ipd:vitals-charted`, `ipd:discharged`, `ipd:census-updated { wardId }`

### 12.15 Error Handling
`ERR_BED_UNAVAILABLE`, `ERR_PATIENT_ALREADY_ADMITTED`, `ERR_DISCHARGE_BLOCKED_BILLING`.

### 12.16–12.17 Audit / Activity Logs
`ADMIT`, `ROUND_ADDED`, `VITALS_CHARTED`, `TRANSFER`, `DISCHARGE`.

### 12.18 Sequence Flow (Admission → Discharge) — see Section 31 for full end-to-end diagram.

### 12.19 State Diagram
`ADMITTED → IN_TREATMENT → DISCHARGE_PLANNED → DISCHARGED`
(Ward/bed transfers are sub-events within `IN_TREATMENT`, not top-level states.)

### 12.20 Edge Cases
Attempted admission when patient already has active admission → blocked with existing admission ID returned for reference.
Discharge attempted with unresolved pharmacy dispense (medication reconciliation incomplete) → warning surfaced, admin override allowed with reason logged.
Emergency admission with no bed immediately available → patient placed in `ipd_waitlist` (holding queue), auto-assigned via job when a bed frees (see Beds module).

### 12.21 Permission Matrix
| Action | DOCTOR | NURSE | RECEPTIONIST | BILLING_STAFF | HOSPITAL_ADMIN |
|---|---|---|---|---|---|
| Admit | ✅ | ❌ | ✅ | ❌ | ✅ |
| Rounds/notes | ✅ | ❌ | ❌ | ❌ | ✅ (view) |
| Vitals charting | ❌ | ✅ | ❌ | ❌ | ✅ (view) |
| Transfer | ✅ | ❌ | ✅ | ❌ | ✅ |
| Discharge | ✅ (clinical sign-off) | ❌ | ❌ | ✅ (billing clearance) | ✅ |

### 12.22 Acceptance Criteria
- Admission atomically reserves exactly one bed; concurrent admission attempts on the same bed yield one success and one `409 ERR_BED_UNAVAILABLE`.
- Discharge is rejected while an associated bill has `status=PENDING`, unless admin override flag is supplied (audit-logged).
- Discharge summary PDF is generated and stored to S3 within 30s of discharge confirmation (async job) and linked to the admission record.

---

## 13. MODULE: Ward

### 13.1 Module Description
Master data and capacity management for hospital wards (General, ICU, Pediatric, Maternity, etc.), grouping beds and driving occupancy/census reporting.

### 13.2 Features
CRUD wards, ward-type classification, capacity configuration, department linkage, occupancy dashboard.

### 13.3 User Roles
`HOSPITAL_ADMIN`, `SUPER_ADMIN` manage; `DOCTOR`/`NURSE`/`RECEPTIONIST` read.

### 13.4 Functional Requirements
- FR-WARD-01: Admin defines wards with type (`GENERAL`,`ICU`,`ICCU`,`PEDIATRIC`,`MATERNITY`,`ISOLATION`), floor, department linkage.
- FR-WARD-02: Ward capacity is derived from count of linked beds (not manually entered), always accurate.
- FR-WARD-03: Occupancy dashboard shows real-time occupied/available/maintenance bed counts per ward.

### 13.5 Business Rules
- BR-01: A ward cannot be deleted while it has beds linked (deactivate instead).
- BR-02: ICU/ICCU wards require nurse-to-patient ratio configuration used for staffing alerts (informational only, not hard-enforced).

### 13.6 Validation Rules
Name unique per hospital; ward type from controlled enum; floor required.

### 13.7 API List
| # | Method | Route | Purpose |
|---|---|---|---|
|1| POST | `/api/v1/wards` | Create ward |
|2| GET | `/api/v1/wards` | List wards with live occupancy |
|3| GET | `/api/v1/wards/:id` | Ward detail + bed list |
|4| PATCH | `/api/v1/wards/:id` | Update |
|5| DELETE | `/api/v1/wards/:id` | Deactivate |
|6| GET | `/api/v1/wards/:id/census` | Real-time census (occupied/available/maintenance) |

### 13.8 Database Tables
`wards(id, name, ward_type ENUM, department_id FK NULLABLE, floor varchar, nurse_patient_ratio varchar, is_active bool, created_at, deleted_at)`

### 13.9 Relationships
`wards.department_id → departments.id`; `beds.ward_id → wards.id` (1:N); `ipd_admissions.ward_id → wards.id`.

### 13.10 Mongo Collections
`audit_logs`.

### 13.11 Redis Usage
`ward:{id}:census` cached counters, updated on every bed-status-change socket event (write-through) for O(1) dashboard reads.

### 13.12 Background Jobs
`recompute-census` (fallback cron every 5 min in case of missed write-through events, self-healing consistency).

### 13.13 Notifications
Admin alert when ward occupancy exceeds 90% capacity.

### 13.14 Socket Events
`wards:census-updated { wardId, occupied, available, maintenance }`

### 13.15 Error Handling
`ERR_WARD_HAS_BEDS` (on delete attempt).

### 13.16–13.17 Audit / Activity Logs
`CREATE`, `UPDATE`, `DEACTIVATE`.

### 13.18 Sequence Flow
Admin creates ward → adds beds (Beds module) → census auto-computed → dashboard subscribes to socket for live updates.

### 13.19 State Diagram
`ACTIVE ⇄ INACTIVE → DELETED (if zero beds)`

### 13.20 Edge Cases
Ward capacity dashboard during bulk bed-maintenance flagging → census correctly reflects `MAINTENANCE` as neither occupied nor available.

### 13.21 Permission Matrix
| Action | SUPER_ADMIN | HOSPITAL_ADMIN | Clinical Staff |
|---|---|---|---|
| CRUD | ✅ | ✅ | ❌ (read-only) |

### 13.22 Acceptance Criteria
- Ward capacity always equals count of non-deleted beds linked to it (no manual override field exists).
- Census endpoint returns counts consistent with actual bed statuses at all times (verified by reconciliation cron).

---

## 14. MODULE: Beds

### 14.1 Module Description
Granular bed inventory and real-time status tracking (Available/Occupied/Maintenance/Reserved), the atomic unit allocated during IPD admission.

### 14.2 Features
CRUD beds, bed-type classification (General/ICU/Isolation), status transitions, maintenance scheduling, waitlist auto-assignment.

### 14.3 User Roles
`HOSPITAL_ADMIN` manages inventory; `NURSE`/`RECEPTIONIST` update status (cleaning/maintenance); system auto-updates on admission/discharge.

### 14.4 Functional Requirements
- FR-BED-01: Each bed belongs to exactly one ward and has a unique bed number within that ward.
- FR-BED-02: Bed status transitions are system-controlled on admission (`AVAILABLE→OCCUPIED`) and discharge (`OCCUPIED→CLEANING→AVAILABLE`).
- FR-BED-03: Staff can manually flag a bed `MAINTENANCE` (equipment fault) removing it from the available pool.
- FR-BED-04: When a bed becomes available and a waitlisted emergency admission exists, system auto-suggests/auto-assigns per configured policy.

### 14.5 Business Rules
- BR-01: A bed can only be assigned if `status = AVAILABLE`; enforced via Redis lock + DB transaction (see IPD 12.11).
- BR-02: Post-discharge, bed enters `CLEANING` for a configurable buffer (default 30 min) before returning to `AVAILABLE`, unless manually cleared early by housekeeping.

### 14.6 Validation Rules
Bed number unique per ward; bed type from enum matching ward type where applicable (e.g., ICU ward beds default type ICU).

### 14.7 API List
| # | Method | Route | Purpose |
|---|---|---|---|
|1| POST | `/api/v1/beds` | Create bed |
|2| GET | `/api/v1/beds` | List/filter by ward/status/type |
|3| GET | `/api/v1/beds/:id` | Detail incl. current occupant if any |
|4| PATCH | `/api/v1/beds/:id/status` | Manual status change (maintenance/cleaning-complete) |
|5| DELETE | `/api/v1/beds/:id` | Remove bed from inventory |

**PATCH /api/v1/beds/:id/status**
- Request: `{ status: "AVAILABLE"|"MAINTENANCE"|"CLEANING", reason? }`
- Business Logic: validate legal transition (state machine, Section 14.19) → update → write-through Redis census → emit socket → if transition unlocks a waitlisted admission, trigger `auto-assign-waitlist` job.

### 14.8 Database Tables
`beds(id, ward_id FK, bed_number varchar, bed_type ENUM, status ENUM(AVAILABLE,OCCUPIED,CLEANING,MAINTENANCE,RESERVED), current_admission_id FK NULLABLE, created_at, deleted_at)` UNIQUE `(ward_id, bed_number)`
`ipd_waitlist(id, patient_id FK, requested_ward_type ENUM, priority ENUM(EMERGENCY,URGENT,ROUTINE), requested_at, fulfilled_admission_id FK NULLABLE)`

### 14.9 Relationships
`beds.ward_id → wards.id`; `beds.current_admission_id → ipd_admissions.id` (nullable, set/cleared by admission/discharge transactions).

### 14.10 Mongo Collections
`audit_logs`.

### 14.11 Redis Usage
`lock:bed:{bedId}` distributed lock during assignment (as in 12.11); `ward:{id}:census` write-through as described in 13.11.

### 14.12 Background Jobs
`bed-cleaning-timer` (BullMQ delayed job, 30 min post-discharge, auto-transitions `CLEANING→AVAILABLE`), `auto-assign-waitlist` (triggered on bed becoming available, matches highest-priority compatible waitlist entry).

### 14.13 Notifications
Housekeeping notified on discharge to begin cleaning; admin notified when waitlist auto-assignment occurs, for confirmation.

### 14.14 Socket Events
`beds:status-changed { bedId, status }`, `beds:waitlist-assigned`

### 14.15 Error Handling
`ERR_BED_NOT_AVAILABLE`, `ERR_INVALID_STATUS_TRANSITION`, `ERR_BED_HAS_OCCUPANT` (on delete).

### 14.16–14.17 Audit / Activity Logs
`CREATE`, `STATUS_CHANGE`, `WAITLIST_ASSIGNED`.

### 14.18 Sequence Flow
Discharge triggers bed `OCCUPIED→CLEANING` → delayed job after buffer → `CLEANING→AVAILABLE` → check `ipd_waitlist` for compatible pending entries → if found, notify admin with suggested match → admin confirms → new admission created against that bed.

### 14.19 State Diagram
`AVAILABLE → OCCUPIED → CLEANING → AVAILABLE`
`AVAILABLE ⇄ MAINTENANCE`
`AVAILABLE → RESERVED → OCCUPIED` (pre-booked elective admissions)

### 14.20 Edge Cases
Housekeeping manually clears `CLEANING` before the timer job fires → job checks current status before acting (idempotent) and no-ops if already `AVAILABLE`.
Bed marked `MAINTENANCE` while `RESERVED` for a scheduled elective admission → admin alerted to reassign before the admission date.

### 14.21 Permission Matrix
| Action | HOSPITAL_ADMIN | NURSE | RECEPTIONIST | System |
|---|---|---|---|---|
| Create/delete bed | ✅ | ❌ | ❌ | ❌ |
| Manual status change | ✅ | ✅ (cleaning/maintenance) | ❌ | ✅ (admission/discharge auto) |

### 14.22 Acceptance Criteria
- A bed's status can never be `OCCUPIED` without a corresponding non-discharged `ipd_admissions` row referencing it (referential + business-logic invariant, checked by reconciliation job).
- Waitlist auto-match correctly prioritizes `EMERGENCY` > `URGENT` > `ROUTINE`, then FIFO by `requested_at`.

---

## 15. MODULE: Ambulance

### 15.1 Module Description
Manages ambulance fleet, dispatch requests, live trip tracking, and driver assignment for emergency and transfer transport.

### 15.2 Features
Fleet CRUD, dispatch request intake, driver/vehicle assignment, live GPS trip status updates, trip completion & billing linkage.

### 15.3 User Roles
`AMBULANCE_DISPATCHER`, `AMBULANCE_DRIVER`, `RECEPTIONIST` (raises request), `HOSPITAL_ADMIN`.

### 15.4 Functional Requirements
- FR-AMB-01: Any authorized staff (or patient via emergency portal) can raise a dispatch request with pickup location and urgency.
- FR-AMB-02: Dispatcher assigns an available vehicle + driver from the fleet.
- FR-AMB-03: Driver updates trip status in real time (`EN_ROUTE_TO_PICKUP`, `ARRIVED`, `TRANSPORTING`, `ARRIVED_HOSPITAL`, `COMPLETED`).
- FR-AMB-04: Completed trips generate a billable service record.

### 15.5 Business Rules
- BR-01: A vehicle can only be assigned to one active trip at a time.
- BR-02: Emergency-priority requests are surfaced above routine transfer requests in dispatcher queue.

### 15.6 Validation Rules
Pickup address/coordinates required; vehicle must have valid registration/insurance not expired.

### 15.7 API List
| # | Method | Route | Purpose |
|---|---|---|---|
|1| POST | `/api/v1/ambulance/vehicles` | Add vehicle to fleet |
|2| GET | `/api/v1/ambulance/vehicles` | List fleet with status |
|3| POST | `/api/v1/ambulance/requests` | Raise dispatch request |
|4| PATCH | `/api/v1/ambulance/requests/:id/assign` | Assign vehicle+driver |
|5| PATCH | `/api/v1/ambulance/trips/:id/status` | Driver updates trip status |
|6| GET | `/api/v1/ambulance/trips/:id/track` | Live location/status for tracking UI |
|7| GET | `/api/v1/ambulance/requests` | Dispatcher queue (pending requests) |

### 15.8 Database Tables
`ambulance_vehicles(id, registration_no UNIQUE, type ENUM(BASIC,ICU,MORTUARY), status ENUM(AVAILABLE,ON_TRIP,MAINTENANCE), driver_id FK users NULLABLE)`
`ambulance_requests(id, patient_id FK NULLABLE, requested_by FK users, pickup_address text, pickup_lat, pickup_lng, drop_address text, urgency ENUM(EMERGENCY,URGENT,ROUTINE), status ENUM(PENDING,ASSIGNED,IN_PROGRESS,COMPLETED,CANCELLED), created_at)`
`ambulance_trips(id, request_id FK UNIQUE, vehicle_id FK, driver_id FK, status ENUM(EN_ROUTE_TO_PICKUP,ARRIVED,TRANSPORTING,ARRIVED_HOSPITAL,COMPLETED), started_at, completed_at)`

### 15.9 Relationships
`ambulance_trips.request_id → ambulance_requests.id` (1:1); `.vehicle_id → ambulance_vehicles.id`; billing linkage `bills.ambulance_trip_id`.

### 15.10 Mongo Collections
`ambulance_trip_locations` (high-frequency GPS ping stream, `{tripId, lat, lng, speed, heading, timestamp}` — Mongo chosen for high write-throughput time-series-like data), `audit_logs`.

### 15.11 Redis Usage
`ambulance:{vehicleId}:location` latest-location cache (fast read for dashboard map without hitting Mongo per request); dispatcher queue sorted set by urgency+time.

### 15.12 Background Jobs
`gps-ping-ingest` (consumes driver app location pings, writes to Mongo + Redis), `trip-sla-alert` (flags trips exceeding expected ETA).

### 15.13 Notifications
SMS to requester with driver name/vehicle/ETA on assignment; push updates at each trip status change; hospital reception alerted on `ARRIVED_HOSPITAL` to prepare emergency bay.

### 15.14 Socket Events
`ambulance:request-created` (dispatcher queue), `ambulance:trip-status-changed`, `ambulance:location-updated { tripId, lat, lng }`

### 15.15 Error Handling
`ERR_NO_VEHICLE_AVAILABLE`, `ERR_VEHICLE_ALREADY_ON_TRIP`, `ERR_INVALID_STATUS_TRANSITION`.

### 15.16–15.17 Audit / Activity Logs
`REQUEST_CREATED`, `ASSIGNED`, `STATUS_CHANGE`, `TRIP_COMPLETED`.

### 15.18 Sequence Flow — see Section 34 for full ambulance workflow diagram.

### 15.19 State Diagram (Trip)
`EN_ROUTE_TO_PICKUP → ARRIVED → TRANSPORTING → ARRIVED_HOSPITAL → COMPLETED`

### 15.20 Edge Cases
Driver app loses connectivity mid-trip → location stream gap detected by `trip-sla-alert` job after configurable timeout, dispatcher notified to contact driver by phone.
Request cancelled after vehicle already dispatched → vehicle status reverts to `AVAILABLE`, trip marked `CANCELLED` with reason, no bill generated.

### 15.21 Permission Matrix
| Action | DISPATCHER | DRIVER | RECEPTIONIST | HOSPITAL_ADMIN |
|---|---|---|---|---|
| Raise request | ✅ | ❌ | ✅ | ✅ |
| Assign vehicle | ✅ | ❌ | ❌ | ✅ |
| Update trip status | ❌ | ✅ (own trip) | ❌ | ✅ |
| View live tracking | ✅ | ✅ (own) | ✅ | ✅ |

### 15.22 Acceptance Criteria
- Emergency requests always appear above urgent/routine in the dispatcher queue regardless of creation order.
- A vehicle cannot be assigned to a second active trip while `status=ON_TRIP` (`409 ERR_VEHICLE_ALREADY_ON_TRIP`).
- Trip completion auto-creates a pending billable line item referencing the trip.

---

## 16. MODULE: Prescription

### 16.1 Module Description
Captures doctor-issued prescriptions (medications, dosage, duration, instructions) linked to an OPD visit or IPD admission, feeding Pharmacy for dispensing.

### 16.2 Features
Create prescription (multi-drug), drug interaction warning, refill/renew, print/PDF generation, link to pharmacy dispense status.

### 16.3 User Roles
`DOCTOR` creates; `PHARMACIST`/`NURSE` read for dispensing/administration; `PATIENT` reads own.

### 16.4 Functional Requirements
- FR-RX-01: Doctor creates a prescription with one or more drug line items (drug, dosage, frequency, duration, route, instructions).
- FR-RX-02: System checks for known drug-drug interactions and allergy conflicts against patient's allergy list, surfacing warnings (non-blocking, requires doctor acknowledgment to proceed).
- FR-RX-03: Prescription is transmitted to Pharmacy module for fulfillment tracking.
- FR-RX-04: Patient/doctor can view prescription history and request renewal of an expired prescription.

### 16.5 Business Rules
- BR-01: A prescription line item's duration must be > 0 days.
- BR-02: Controlled/scheduled drugs require doctor's digital signature confirmation (checkbox + audit) before submission.
- BR-03: Prescription cannot be edited after creation — corrections are issued as a new versioned prescription referencing the original (`supersedes_id`).

### 16.6 Validation Rules
Drug must exist in `drug_master`; dosage/frequency/duration required per line item; at least one line item required.

### 16.7 API List
| # | Method | Route | Purpose |
|---|---|---|---|
|1| POST | `/api/v1/prescriptions` | Create prescription |
|2| GET | `/api/v1/prescriptions` | List (by patient/doctor/visit) |
|3| GET | `/api/v1/prescriptions/:id` | Detail |
|4| GET | `/api/v1/prescriptions/:id/pdf` | Generate/download PDF |
|5| POST | `/api/v1/prescriptions/:id/renew` | Create renewal (new versioned Rx) |
|6| GET | `/api/v1/prescriptions/interactions-check` | Pre-submit interaction check (drug list + patient allergies) |

**POST /api/v1/prescriptions**
- Request: `{ patientId, opdVisitId?, ipdAdmissionId?, items: [{ drugId, dosage, frequency, durationDays, route, instructions }], notes? }`
- Business Logic: validate at least one item → run interaction/allergy check against `drug_interactions` + `patients.allergies` → if warnings, require `acknowledgedWarnings: true` flag in request → persist → enqueue `notify-pharmacy` job → audit log.

### 16.8 Database Tables
`prescriptions(id, patient_id FK, doctor_id FK, opd_visit_id FK NULLABLE, ipd_admission_id FK NULLABLE, supersedes_id FK NULLABLE self-ref, status ENUM(ACTIVE,DISPENSED,PARTIALLY_DISPENSED,EXPIRED,CANCELLED), notes text, created_at)`
`prescription_items(id, prescription_id FK, drug_id FK, dosage varchar, frequency varchar, duration_days int, route ENUM(ORAL,IV,IM,TOPICAL,OTHER), instructions text)`
`drug_master(id, name, generic_name, category, is_controlled bool, unit)`
`drug_interactions(id, drug_a_id FK, drug_b_id FK, severity ENUM(MILD,MODERATE,SEVERE), description)`

### 16.9 Relationships
`prescriptions.patient_id/doctor_id`; 1:N `prescription_items.prescription_id → prescriptions.id`; `prescription_items.drug_id → drug_master.id`; linked from `pharmacy_dispenses.prescription_id`.

### 16.10 Mongo Collections
`audit_logs`, `activity_logs`.

### 16.11 Redis Usage
`drug_master:list` cache (read-heavy master data, 30 min TTL).

### 16.12 Background Jobs
`notify-pharmacy` (push new Rx to pharmacy queue), `prescription-expiry-check` (cron, flags Rx past duration as `EXPIRED`), `generate-prescription-pdf`.

### 16.13 Notifications
Pharmacist notified of new prescription; patient notified when ready to view/print.

### 16.14 Socket Events
`prescriptions:created`, `prescriptions:status-changed`

### 16.15 Error Handling
`ERR_DRUG_INTERACTION_UNACKNOWLEDGED`, `ERR_INVALID_DRUG`, `ERR_EMPTY_PRESCRIPTION`.

### 16.16–16.17 Audit / Activity Logs
`CREATE`, `RENEW`, `CANCEL`, `INTERACTION_WARNING_ACKNOWLEDGED`.

### 16.18 Sequence Flow
Doctor selects drugs → client calls interactions-check → warnings shown → doctor acknowledges → POST create → persisted → pharmacy notified via job+socket → patient timeline updated.

### 16.19 State Diagram
`ACTIVE → PARTIALLY_DISPENSED → DISPENSED`
`ACTIVE → EXPIRED` (cron) | `ACTIVE → CANCELLED`

### 16.20 Edge Cases
Doctor attempts to prescribe a drug the patient is allergic to → hard warning modal, requires explicit typed confirmation reason, stored in audit log for medico-legal record.
Renewal requested for a controlled substance → requires fresh digital signature, cannot be auto-renewed without doctor re-review.

### 16.21 Permission Matrix
| Action | DOCTOR | PHARMACIST | NURSE | PATIENT (self) |
|---|---|---|---|---|
| Create | ✅ | ❌ | ❌ | ❌ |
| View | ✅ | ✅ | ✅ | ✅ |
| Renew | ✅ | ❌ | ❌ | ❌ (can request) |

### 16.22 Acceptance Criteria
- Submitting a prescription with an unacknowledged severe interaction is rejected with `422 ERR_DRUG_INTERACTION_UNACKNOWLEDGED`.
- Prescriptions are immutable post-creation; edits always create a new versioned record linked via `supersedes_id`.

---

## 17. MODULE: AI Prescription

### 17.1 Module Description
AI-assisted clinical decision support that suggests draft prescriptions (drug, dosage, duration) based on diagnosis, patient history, and vitals, for doctor review and approval — never auto-submitted without human sign-off.

### 17.2 Features
Generate AI-suggested prescription draft from diagnosis/symptoms, confidence scoring, doctor accept/edit/reject workflow, explainability notes, feedback loop for model improvement.

### 17.3 User Roles
`DOCTOR` only (requests suggestions and approves); `HOSPITAL_ADMIN` views usage analytics.

### 17.4 Functional Requirements
- FR-AIRX-01: Doctor requests AI suggestion by submitting diagnosis, symptoms, patient vitals/history/allergies context.
- FR-AIRX-02: System calls the LLM provider with a structured clinical prompt and returns suggested drug line items with confidence scores and rationale text.
- FR-AIRX-03: Doctor must explicitly review and either accept (converts to a real Prescription via Module 16), edit, or reject each suggestion — no AI suggestion is ever dispensed without doctor approval.
- FR-AIRX-04: All AI suggestions and doctor dispositions (accepted/edited/rejected) are logged for audit and future model evaluation.

### 17.5 Business Rules
- BR-01: AI suggestions are never directly persisted as `prescriptions`; they exist only as `ai_prescription_suggestions` until explicitly approved.
- BR-02: AI suggestion requests are rate-limited per doctor (e.g., 60/hour) to control cost and misuse.
- BR-03: Controlled/scheduled drugs are excluded from AI auto-suggestion (flagged "requires manual prescribing only") as an extra safety guardrail.

### 17.6 Validation Rules
Diagnosis/symptom text required (min 10 chars); patient context (allergies, current medications) auto-attached server-side, not client-editable, to prevent prompt tampering.

### 17.7 API List
| # | Method | Route | Purpose |
|---|---|---|---|
|1| POST | `/api/v1/ai-prescriptions/suggest` | Request AI-generated suggestion |
|2| GET | `/api/v1/ai-prescriptions/:id` | Fetch suggestion detail |
|3| POST | `/api/v1/ai-prescriptions/:id/accept` | Accept (creates real Prescription) |
|4| PATCH | `/api/v1/ai-prescriptions/:id/edit` | Doctor edits suggested items before accept |
|5| POST | `/api/v1/ai-prescriptions/:id/reject` | Reject with reason (feedback loop) |

**POST /api/v1/ai-prescriptions/suggest**
- Request: `{ patientId, opdVisitId?, diagnosisText, symptoms: string[] }`
- Response: `{ id, suggestedItems: [{ drugId, drugName, dosage, frequency, durationDays, confidence, rationale }], overallConfidence, disclaimers: string[] }`
- Business Logic: server assembles context (diagnosis + patient allergy list + current active prescriptions + vitals) → calls LLM (Claude Sonnet via Anthropic API, `max_tokens` bounded, structured-JSON output mode) → validates every suggested `drugId` exists in `drug_master` and is not in the controlled-substance-excluded list → runs the same interaction/allergy check as Module 16 → persists suggestion with `status=PENDING_REVIEW` → returns to doctor UI with mandatory disclaimer banner ("AI-generated, for clinical review only").

### 17.8 Database Tables
`ai_prescription_suggestions(id, patient_id FK, doctor_id FK, opd_visit_id FK NULLABLE, diagnosis_text text, symptoms text[], suggested_items jsonb, overall_confidence numeric, model_version varchar, status ENUM(PENDING_REVIEW,ACCEPTED,EDITED_AND_ACCEPTED,REJECTED), resulting_prescription_id FK NULLABLE, created_at)`
`ai_suggestion_feedback(id, suggestion_id FK, doctor_id FK, disposition ENUM(ACCEPTED,EDITED,REJECTED), rejection_reason text NULLABLE, edited_diff jsonb NULLABLE, created_at)`

### 17.9 Relationships
`ai_prescription_suggestions.patient_id/doctor_id/opd_visit_id`; `.resulting_prescription_id → prescriptions.id` (set only on accept); `ai_suggestion_feedback.suggestion_id → ai_prescription_suggestions.id`.

### 17.10 Mongo Collections
`ai_prescription_raw_logs` (full raw prompt + raw model response payload, stored in Mongo for size/flexibility and model-debugging — never displayed to end users, access restricted to `SUPER_ADMIN`/ML team), `audit_logs`.

### 17.11 Redis Usage
`ai-suggest:ratelimit:{doctorId}` token-bucket rate limiter; response caching not used (clinical context must always be fresh).

### 17.12 Background Jobs
`ai-suggestion-audit-export` (periodic export of accept/reject stats for model quality review), `ai-provider-health-check`.

### 17.13 Notifications
None patient-facing; internal alert to admin if AI provider error rate exceeds threshold (circuit-breaker signal).

### 17.14 Socket Events
`ai-prescriptions:suggestion-ready` (if generation is queued/async for slow models), `ai-prescriptions:disposition-recorded`.

### 17.15 Error Handling
`ERR_AI_PROVIDER_UNAVAILABLE` (502, falls back gracefully — doctor proceeds with manual Prescription module), `ERR_CONTROLLED_DRUG_EXCLUDED`, `ERR_LOW_CONFIDENCE_BLOCKED` (suggestions below a configured confidence floor are hidden/flagged rather than shown as actionable).

### 17.16–17.17 Audit / Activity Logs
`AI_SUGGESTION_REQUESTED`, `AI_SUGGESTION_ACCEPTED`, `AI_SUGGESTION_EDITED`, `AI_SUGGESTION_REJECTED` — every disposition is audit-logged with full before/after for medico-legal traceability (who ultimately authored the prescription is always the doctor of record).

### 17.18 Sequence Flow — see Section 36 for full AI Prescription workflow diagram.

### 17.19 State Diagram
`PENDING_REVIEW → ACCEPTED (→ Prescription created)`
`PENDING_REVIEW → EDITED_AND_ACCEPTED (→ Prescription created from edited items)`
`PENDING_REVIEW → REJECTED`

### 17.20 Edge Cases
LLM returns a drug name not found in `drug_master` → item filtered out server-side and flagged "unmapped suggestion, not actionable," never silently substituted.
Doctor accepts suggestion but patient's allergy list was updated between suggestion-generation and accept-click → server re-runs interaction/allergy check at accept-time, not just at generation-time, and blocks if a new conflict is found.
AI provider timeout/outage → suggestion request fails gracefully with `ERR_AI_PROVIDER_UNAVAILABLE`, doctor redirected to standard manual Prescription flow, no partial data persisted.

### 17.21 Permission Matrix
| Action | DOCTOR | PHARMACIST | HOSPITAL_ADMIN |
|---|---|---|---|
| Request suggestion | ✅ | ❌ | ❌ |
| Accept/edit/reject | ✅ (own) | ❌ | ❌ |
| View aggregate analytics | ❌ | ❌ | ✅ |

### 17.22 Acceptance Criteria
- No `ai_prescription_suggestions` row ever transitions directly to a dispensable state; only the resulting `prescriptions` row (created on accept) is dispensable.
- Every suggestion response includes a visible disclaimer and a confidence score; suggestions below the confidence floor are never rendered as one-click-acceptable.
- 100% of AI suggestion dispositions are captured in `ai_suggestion_feedback` for audit and model-quality reporting.

---

## 18. MODULE: Laboratory

### 18.1 Module Description
Manages lab test catalog, order intake from doctors, sample collection tracking, results entry/verification, and report delivery.

### 18.2 Features
Test catalog management, order creation, sample tracking (barcode), result entry, critical-value flagging, report PDF generation, result verification (two-step: technician entry + pathologist sign-off).

### 18.3 User Roles
`DOCTOR` orders; `LAB_TECHNICIAN` collects sample & enters results; `PATHOLOGIST`(specialized DOCTOR role) verifies; `PATIENT` views own reports.

### 18.4 Functional Requirements
- FR-LAB-01: Doctor orders one or more tests from the catalog against a patient/visit.
- FR-LAB-02: Sample collection is tracked with a barcode/label linking physical sample to digital order.
- FR-LAB-03: Technician enters raw results; results outside reference range are auto-flagged; critical values trigger immediate alert to ordering doctor.
- FR-LAB-04: A second qualified user (pathologist) verifies/signs off before the report is released to the patient.
- FR-LAB-05: Verified report is generated as PDF and made available in patient portal + doctor dashboard.

### 18.5 Business Rules
- BR-01: Results cannot be released to patient before pathologist verification (two-person integrity rule).
- BR-02: Critical values (per test-specific threshold config) must trigger a real-time alert within 2 minutes of entry.

### 18.6 Validation Rules
Result value must match expected data type/unit for the test; reference ranges configured per test (age/gender-specific where applicable).

### 18.7 API List
| # | Method | Route | Purpose |
|---|---|---|---|
|1| GET | `/api/v1/lab/tests` | Test catalog |
|2| POST | `/api/v1/lab/orders` | Create lab order |
|3| GET | `/api/v1/lab/orders` | List (by patient/status/date) |
|4| PATCH | `/api/v1/lab/orders/:id/collect-sample` | Mark sample collected + barcode |
|5| PATCH | `/api/v1/lab/orders/:id/results` | Technician enters results |
|6| PATCH | `/api/v1/lab/orders/:id/verify` | Pathologist verifies/signs |
|7| GET | `/api/v1/lab/orders/:id/report` | Download verified report PDF |

**PATCH /api/v1/lab/orders/:id/results**
- Request: `{ items: [{ testParameterId, value, unit }] }`
- Business Logic: validate against reference ranges → flag abnormal → if critical threshold breached, enqueue `critical-value-alert` job (SMS+call-list escalation) → set order status `RESULTS_ENTERED` (not yet released).

### 18.8 Database Tables
`lab_tests(id, name, code UNIQUE, category, price, sample_type, turnaround_hours)`
`lab_test_parameters(id, test_id FK, name, unit, reference_range_min, reference_range_max, critical_low, critical_high)`
`lab_orders(id, patient_id FK, doctor_id FK, opd_visit_id FK NULLABLE, ipd_admission_id FK NULLABLE, status ENUM(ORDERED,SAMPLE_COLLECTED,RESULTS_ENTERED,VERIFIED,REPORT_RELEASED,CANCELLED), barcode UNIQUE, created_at)`
`lab_order_tests(id, order_id FK, test_id FK)`
`lab_results(id, order_id FK, test_parameter_id FK, value varchar, unit, is_abnormal bool, is_critical bool, entered_by FK, verified_by FK NULLABLE, verified_at)`

### 18.9 Relationships
`lab_orders.patient_id/doctor_id`; 1:N `lab_order_tests`, `lab_results`; `lab_results.test_parameter_id → lab_test_parameters.id`.

### 18.10 Mongo Collections
`audit_logs`, `activity_logs`.

### 18.11 Redis Usage
`lab:catalog` cache (30 min TTL); `lab:critical-alert:{orderId}` dedup key to prevent duplicate alert spam if multiple result entries trigger simultaneously.

### 18.12 Background Jobs
`critical-value-alert` (immediate, high-priority BullMQ queue with SMS+push escalation to ordering doctor and on-call), `report-pdf-generate`, `turnaround-sla-monitor` (flags orders exceeding expected turnaround).

### 18.13 Notifications
Technician notified of new order; doctor notified of critical results (urgent channel); patient notified when report is released.

### 18.14 Socket Events
`lab:order-status-changed`, `lab:critical-alert { orderId, patientId }`, `lab:report-released`

### 18.15 Error Handling
`ERR_SAMPLE_NOT_COLLECTED` (results entry before collection), `ERR_ALREADY_VERIFIED`, `ERR_VERIFIER_SAME_AS_ENTERER` (segregation-of-duties rule — technician who entered cannot also verify).

### 18.16–18.17 Audit / Activity Logs
`ORDER_CREATED`, `SAMPLE_COLLECTED`, `RESULTS_ENTERED`, `VERIFIED`, `REPORT_RELEASED`, `CRITICAL_ALERT_SENT`.

### 18.18 Sequence Flow — see Section 33 for full Laboratory workflow diagram.

### 18.19 State Diagram
`ORDERED → SAMPLE_COLLECTED → RESULTS_ENTERED → VERIFIED → REPORT_RELEASED`
(any state → `CANCELLED` before verification)

### 18.20 Edge Cases
Same user attempts to both enter and verify results → hard-blocked (`ERR_VERIFIER_SAME_AS_ENTERER`), enforced at API layer regardless of role permission (defense in depth for lab integrity).
Critical value entered outside working hours → alert still fires immediately via SMS/on-call escalation (not batched to next business day).

### 18.21 Permission Matrix
| Action | DOCTOR | LAB_TECHNICIAN | PATHOLOGIST | PATIENT |
|---|---|---|---|---|
| Order test | ✅ | ❌ | ❌ | ❌ |
| Collect sample | ❌ | ✅ | ❌ | ❌ |
| Enter results | ❌ | ✅ | ❌ | ❌ |
| Verify | ❌ | ❌ | ✅ | ❌ |
| View report | ✅ (own patients) | ❌ | ✅ | ✅ (own, post-release) |

### 18.22 Acceptance Criteria
- Report is never visible to patient before `status=REPORT_RELEASED`.
- A critical result triggers an alert notification within 2 minutes of entry (measured via job-completion timestamp).
- The entering technician and verifying pathologist on any order are always different users.

---

## 19. MODULE: Pharmacy

### 19.1 Module Description
Manages medication dispensing against prescriptions, stock deduction, and pharmacy-level inventory linkage (deep integration with Inventory module).

### 19.2 Features
Prescription queue for dispensing, partial/full dispense, substitution (generic equivalent) with pharmacist approval, stock deduction, patient counseling notes, return/refund handling.

### 19.3 User Roles
`PHARMACIST` dispenses; `DOCTOR`/`NURSE` view dispense status; `BILLING_STAFF` links to billing.

### 19.4 Functional Requirements
- FR-PHM-01: Pharmacist views a queue of pending prescriptions ready for dispensing.
- FR-PHM-02: Dispensing deducts drug quantity from `inventory_stock` transactionally.
- FR-PHM-03: Partial dispense is supported when stock is insufficient; remainder stays `PENDING` for later fulfillment.
- FR-PHM-04: Pharmacist can substitute a prescribed drug with an approved generic equivalent, logged with reason.
- FR-PHM-05: Dispensed items generate a billable line item sent to Billing.

### 19.5 Business Rules
- BR-01: Cannot dispense more than the prescribed quantity/duration.
- BR-02: Stock deduction and dispense-record creation happen in a single DB transaction (all-or-nothing).
- BR-03: Controlled substances require dual pharmacist sign-off (configurable) before dispense finalization.

### 19.6 Validation Rules
Dispensed quantity ≤ remaining prescribed quantity; substituted drug must be flagged as generic-equivalent in `drug_master`.

### 19.7 API List
| # | Method | Route | Purpose |
|---|---|---|---|
|1| GET | `/api/v1/pharmacy/queue` | Pending prescriptions for dispensing |
|2| POST | `/api/v1/pharmacy/dispenses` | Dispense (full/partial) |
|3| POST | `/api/v1/pharmacy/dispenses/:id/substitute` | Record substitution |
|4| GET | `/api/v1/pharmacy/dispenses/:id` | Dispense detail |
|5| POST | `/api/v1/pharmacy/returns` | Process a medication return |

**POST /api/v1/pharmacy/dispenses**
- Request: `{ prescriptionId, items: [{ prescriptionItemId, quantityDispensed, batchId }] }`
- Business Logic: begin DB transaction → for each item, lock `inventory_stock` row (`SELECT ... FOR UPDATE`) → verify sufficient quantity → deduct → insert `pharmacy_dispenses`/`dispense_items` → update `prescriptions.status` (DISPENSED/PARTIALLY_DISPENSED) → commit → enqueue `notify-billing` job → audit log.

### 19.8 Database Tables
`pharmacy_dispenses(id, prescription_id FK, dispensed_by FK, status ENUM(FULL,PARTIAL), created_at)`
`dispense_items(id, dispense_id FK, prescription_item_id FK, drug_id FK, batch_id FK, quantity_dispensed int, substituted_from_drug_id FK NULLABLE, substitution_reason text NULLABLE)`
`pharmacy_returns(id, dispense_item_id FK, quantity_returned int, reason, refund_amount numeric, processed_by FK, created_at)`

### 19.9 Relationships
`pharmacy_dispenses.prescription_id → prescriptions.id`; `dispense_items.batch_id → inventory_batches.id` (Inventory module); linked to `bill_items.dispense_id`.

### 19.10 Mongo Collections
`audit_logs`, `activity_logs`.

### 19.11 Redis Usage
`pharmacy:queue` sorted set by prescription creation time for fast dispensing-queue reads.

### 19.12 Background Jobs
`notify-billing` (push billable dispense item), `low-stock-check-post-dispense` (triggers Inventory low-stock alert if deduction crosses threshold).

### 19.13 Notifications
Patient notified prescription is ready for pickup; billing notified of new billable item.

### 19.14 Socket Events
`pharmacy:queue-updated`, `pharmacy:dispensed`

### 19.15 Error Handling
`ERR_INSUFFICIENT_STOCK`, `ERR_QUANTITY_EXCEEDS_PRESCRIBED`, `ERR_SUBSTITUTION_NOT_EQUIVALENT`.

### 19.16–19.17 Audit / Activity Logs
`DISPENSE_CREATED`, `SUBSTITUTION_RECORDED`, `RETURN_PROCESSED`.

### 19.18 Sequence Flow — see Section 35 for full Pharmacy workflow diagram.

### 19.19 State Diagram
`PENDING → PARTIALLY_DISPENSED → DISPENSED`
`PENDING → DISPENSED` (direct, if fully stocked)

### 19.20 Edge Cases
Stock goes to zero mid-dispense due to concurrent dispensing at another counter → row-level lock (`FOR UPDATE`) serializes access, second request correctly sees reduced stock and either partially dispenses or errors `ERR_INSUFFICIENT_STOCK`.
Return processed for a drug already administered (IPD MAR-linked) → blocked, returns only permitted for un-administered stock.

### 19.21 Permission Matrix
| Action | PHARMACIST | DOCTOR | BILLING_STAFF |
|---|---|---|---|
| Dispense | ✅ | ❌ | ❌ |
| Substitute | ✅ | ❌ (notified) | ❌ |
| Process return | ✅ | ❌ | ✅ (refund only) |

### 19.22 Acceptance Criteria
- Stock deduction and dispense record creation are atomic; a mid-transaction failure leaves stock unchanged (verified via forced-failure test).
- Dispensing more than the prescribed remaining quantity is rejected with `422 ERR_QUANTITY_EXCEEDS_PRESCRIBED`.

---

## 20. MODULE: Inventory

### 20.1 Module Description
Tracks all consumable and pharmaceutical stock (drugs, medical supplies, equipment consumables) across batches, expiry, reorder levels, and supplier procurement.

### 20.2 Features
Item master, batch/lot tracking with expiry, stock in/out ledger, reorder-point alerts, purchase order management, supplier master, stock adjustment (damage/loss).

### 20.3 User Roles
`INVENTORY_MANAGER` manages; `PHARMACIST` consumes (via dispense integration); `HOSPITAL_ADMIN` approves purchase orders.

### 20.4 Functional Requirements
- FR-INV-01: Every stock-affecting event (purchase receipt, dispense, adjustment, transfer) is recorded in an immutable stock ledger.
- FR-INV-02: System tracks batch/lot number and expiry date per stock unit (FEFO — First-Expiry-First-Out — consumption policy).
- FR-INV-03: System auto-alerts when stock falls below configured reorder point, and auto-suggests a purchase order.
- FR-INV-04: Expiring-soon batches (configurable window, e.g., 30 days) are flagged for priority use or write-off.

### 20.5 Business Rules
- BR-01: Stock quantity is always derived as SUM of ledger entries for an item/batch — never a directly-editable field (append-only ledger pattern for auditability).
- BR-02: FEFO enforced at dispense-time: system suggests the batch with the earliest expiry first.
- BR-03: Negative stock is never permitted; all deduction operations are guarded by row locks.

### 20.6 Validation Rules
Batch expiry date required and must be a future date at receipt time; quantity received > 0.

### 20.7 API List
| # | Method | Route | Purpose |
|---|---|---|---|
|1| POST | `/api/v1/inventory/items` | Create item master |
|2| POST | `/api/v1/inventory/batches` | Receive new stock batch (GRN) |
|3| GET | `/api/v1/inventory/stock` | Current stock levels (by item/batch/ward) |
|4| POST | `/api/v1/inventory/adjustments` | Manual stock adjustment (damage/loss/count correction) |
|5| POST | `/api/v1/inventory/purchase-orders` | Create PO to supplier |
|6| PATCH | `/api/v1/inventory/purchase-orders/:id/receive` | Mark PO received, auto-create batch(es) |
|7| GET | `/api/v1/inventory/alerts` | Low-stock & expiring-soon alerts |
|8| GET | `/api/v1/inventory/suppliers` | Supplier master list |

### 20.8 Database Tables
`inventory_items(id, name, category ENUM(DRUG,CONSUMABLE,EQUIPMENT), unit, reorder_point int, reorder_quantity int)`
`inventory_batches(id, item_id FK, batch_no, expiry_date date, supplier_id FK, received_at, unit_cost numeric)`
`inventory_stock_ledger(id, item_id FK, batch_id FK, change_type ENUM(RECEIPT,DISPENSE,ADJUSTMENT,TRANSFER,WRITE_OFF), quantity_delta int, reference_type varchar, reference_id uuid, performed_by FK, created_at)`
`suppliers(id, name, contact_info jsonb, is_active bool)`
`purchase_orders(id, supplier_id FK, status ENUM(DRAFT,ORDERED,PARTIALLY_RECEIVED,RECEIVED,CANCELLED), created_by FK, created_at)`
`purchase_order_items(id, po_id FK, item_id FK, quantity_ordered int, quantity_received int, unit_cost numeric)`

### 20.9 Relationships
`inventory_batches.item_id → inventory_items.id`; `inventory_stock_ledger.item_id/batch_id`; `dispense_items.batch_id → inventory_batches.id` (cross-module, Section 19); `purchase_order_items.po_id/item_id`.

### 20.10 Mongo Collections
`audit_logs`, `activity_logs`.

### 20.11 Redis Usage
`inventory:{itemId}:stock-level` cached aggregate (write-through on every ledger insert) to avoid summing the ledger on every read; `inventory:reorder-alerts` cached alert list (5 min TTL).

### 20.12 Background Jobs
`low-stock-scan` (cron, hourly, cross-checks cached stock levels against reorder points), `expiry-scan` (daily, flags batches nearing expiry), `auto-suggest-po` (generates draft PO for admin review when reorder triggered).

### 20.13 Notifications
Inventory manager alerted on low stock / expiring batches; admin alerted for PO approval.

### 20.14 Socket Events
`inventory:stock-changed { itemId }`, `inventory:low-stock-alert`, `inventory:po-status-changed`

### 20.15 Error Handling
`ERR_INSUFFICIENT_STOCK`, `ERR_NEGATIVE_STOCK_BLOCKED`, `ERR_EXPIRED_BATCH_RECEIPT` (rejects receiving a batch with a past expiry date).

### 20.16–20.17 Audit / Activity Logs
`ITEM_CREATED`, `BATCH_RECEIVED`, `STOCK_ADJUSTED`, `PO_CREATED`, `PO_RECEIVED`.

### 20.18 Sequence Flow (Reorder → Receipt)
Stock level crosses reorder point (ledger write-through detects) → `low-stock-scan` confirms → `auto-suggest-po` creates DRAFT PO → admin reviews & approves → PO status `ORDERED` → goods arrive → `receive` API creates new batch + ledger `RECEIPT` entries → stock level updated → alert cleared.

### 20.19 State Diagram (Purchase Order)
`DRAFT → ORDERED → PARTIALLY_RECEIVED → RECEIVED`
`ORDERED → CANCELLED`

### 20.20 Edge Cases
Partial PO receipt (supplier ships less than ordered) → PO stays `PARTIALLY_RECEIVED`, remaining quantity tracked for follow-up.
Batch expires while still in stock (missed FEFO due to manual override) → `expiry-scan` flags for `WRITE_OFF`, requires manager approval before ledger entry.

### 20.21 Permission Matrix
| Action | INVENTORY_MANAGER | HOSPITAL_ADMIN | PHARMACIST |
|---|---|---|---|
| Manage items/batches | ✅ | ✅ | ❌ (consume only) |
| Create PO | ✅ | ✅ | ❌ |
| Approve PO | ❌ | ✅ | ❌ |
| Stock adjustment | ✅ | ✅ | ❌ |

### 20.22 Acceptance Criteria
- Stock level derived from the ledger always matches the Redis cached value (reconciliation job runs daily and alerts on drift).
- Attempting to deduct more stock than available is rejected with `409 ERR_INSUFFICIENT_STOCK`, never resulting in negative stock.
- FEFO suggestion always returns the batch with the nearest (soonest) expiry date among available stock for that item.

---

## 21. MODULE: Billing

### 21.1 Module Description
Aggregates all billable services (consultation, OPD, IPD room charges, lab, pharmacy, ambulance) into itemized bills, applying insurance/discounts, prior to payment collection.

### 21.2 Features
Auto line-item aggregation from source modules, manual line-item addition, discount/insurance application, tax calculation, bill finalization, itemized invoice PDF, credit/hold billing for IPD.

### 21.3 User Roles
`BILLING_STAFF` manages; `HOSPITAL_ADMIN` approves discounts beyond threshold; `PATIENT` views own bills.

### 21.4 Functional Requirements
- FR-BILL-01: System auto-creates draft bill line items as billable events occur across OPD/IPD/Lab/Pharmacy/Ambulance.
- FR-BILL-02: Billing staff can consolidate line items into a single bill per visit/admission, apply discounts/insurance coverage, and finalize.
- FR-BILL-03: Finalized bills are immutable; corrections require a credit note + new bill.
- FR-BILL-04: IPD bills accumulate as "running bill" during admission, finalized only at discharge.

### 21.5 Business Rules
- BR-01: Discounts beyond a configured percentage require `HOSPITAL_ADMIN` approval (maker-checker).
- BR-02: A bill cannot be finalized with zero line items.
- BR-03: Insurance-covered amount cannot exceed the policy's approved coverage limit (validated against `insurance_policies`).

### 21.6 Validation Rules
Discount percentage 0–100; tax rate per configured jurisdiction; insurance claim amount ≤ policy limit.

### 21.7 API List
| # | Method | Route | Purpose |
|---|---|---|---|
|1| GET | `/api/v1/billing/bills` | List bills (by patient/status/date) |
|2| GET | `/api/v1/billing/bills/:id` | Bill detail with line items |
|3| POST | `/api/v1/billing/bills` | Create/consolidate bill from pending line items |
|4| PATCH | `/api/v1/billing/bills/:id/discount` | Apply discount (maker-checker if above threshold) |
|5| PATCH | `/api/v1/billing/bills/:id/insurance` | Apply insurance coverage |
|6| PATCH | `/api/v1/billing/bills/:id/finalize` | Finalize (locks bill) |
|7| POST | `/api/v1/billing/bills/:id/credit-note` | Issue credit note against a finalized bill |
|8| GET | `/api/v1/billing/bills/:id/invoice-pdf` | Download invoice |

**PATCH /api/v1/billing/bills/:id/finalize**
- Business Logic: verify ≥1 line item, verify discount approvals resolved, verify (for IPD) admission is discharge-planned → compute total (subtotal − discount + tax − insurance coverage) → set `status=FINALIZED`, `finalized_at` → generate invoice number → enqueue PDF generation → audit log.

### 21.8 Database Tables
`bills(id, invoice_no UNIQUE, patient_id FK, opd_visit_id FK NULLABLE, ipd_admission_id FK NULLABLE, ambulance_trip_id FK NULLABLE, status ENUM(DRAFT,PENDING_APPROVAL,FINALIZED,PAID,PARTIALLY_PAID,CANCELLED), subtotal numeric, discount_amount numeric, tax_amount numeric, insurance_covered numeric, total_amount numeric, finalized_at, created_at)`
`bill_items(id, bill_id FK, source_module ENUM(CONSULTATION,LAB,PHARMACY,ROOM_CHARGE,AMBULANCE,MISC), source_reference_id uuid, description, quantity, unit_price numeric, amount numeric)`
`bill_discounts(id, bill_id FK, percentage numeric, reason, requested_by FK, approved_by FK NULLABLE, status ENUM(PENDING,APPROVED,REJECTED))`
`insurance_policies(id, patient_id FK, provider_name, policy_no, coverage_limit numeric, valid_till date)`
`credit_notes(id, original_bill_id FK, amount numeric, reason, issued_by FK, created_at)`

### 21.9 Relationships
`bills.patient_id`; 1:N `bill_items.bill_id`; `bill_discounts.bill_id`; `insurance_policies.patient_id`; `credit_notes.original_bill_id → bills.id`.

### 21.10 Mongo Collections
`audit_logs`, `activity_logs`.

### 21.11 Redis Usage
`bill:{id}:draft-total` cache during active line-item accumulation (IPD running bill) for fast dashboard display without recomputation.

### 21.12 Background Jobs
`generate-invoice-pdf`, `discount-approval-reminder` (nudges admin for pending maker-checker approvals).

### 21.13 Notifications
Patient notified when bill is finalized; admin notified of pending discount approval.

### 21.14 Socket Events
`billing:bill-updated`, `billing:discount-approval-needed`, `billing:finalized`

### 21.15 Error Handling
`ERR_EMPTY_BILL`, `ERR_DISCOUNT_EXCEEDS_LIMIT`, `ERR_INSURANCE_LIMIT_EXCEEDED`, `ERR_BILL_ALREADY_FINALIZED`.

### 21.16–21.17 Audit / Activity Logs
`BILL_CREATED`, `LINE_ITEM_ADDED`, `DISCOUNT_APPLIED`, `FINALIZED`, `CREDIT_NOTE_ISSUED`.

### 21.18 Sequence Flow — see Section 32 for full Payment/Billing workflow diagram.

### 21.19 State Diagram
`DRAFT → PENDING_APPROVAL → FINALIZED → PAID`
`FINALIZED → PARTIALLY_PAID → PAID`
`DRAFT → CANCELLED`

### 21.20 Edge Cases
Discount requested exceeds staff's own approval limit → bill enters `PENDING_APPROVAL`, blocked from finalization until admin approves/rejects.
IPD patient discharged with an unresolved insurance pre-authorization → billing staff can finalize with insurance portion marked `PENDING_CLAIM`, patient billed the balance provisionally with reconciliation later.

### 21.21 Permission Matrix
| Action | BILLING_STAFF | HOSPITAL_ADMIN | PATIENT |
|---|---|---|---|
| Create/consolidate bill | ✅ | ✅ | ❌ |
| Apply discount (within limit) | ✅ | ✅ | ❌ |
| Approve discount (above limit) | ❌ | ✅ | ❌ |
| Finalize | ✅ | ✅ | ❌ |
| View own bill | ❌ | ❌ | ✅ |

### 21.22 Acceptance Criteria
- A bill can never reach `FINALIZED` with zero line items or unresolved `PENDING` discount approvals.
- Finalized bills are immutable at the API layer; any correction path goes exclusively through `credit-note`.
- Invoice PDF total exactly reconciles: `subtotal - discount_amount + tax_amount - insurance_covered = total_amount`.

---

## 22. MODULE: Payments

### 22.1 Module Description
Handles collection of payments against finalized bills across multiple modes (cash, card, UPI, insurance settlement), reconciliation, and refunds.

### 22.2 Features
Record payment (multi-mode, split payments), payment gateway integration (card/UPI), receipt generation, refund processing, daily cash reconciliation.

### 22.3 User Roles
`BILLING_STAFF` collects; `PATIENT` pays online (self-service portal); `HOSPITAL_ADMIN` reconciles.

### 22.4 Functional Requirements
- FR-PAY-01: Payment can be recorded against a finalized bill in one or more modes (split payment supported).
- FR-PAY-02: Online payments integrate with a payment gateway; webhook confirms success/failure asynchronously.
- FR-PAY-03: Bill status updates to `PAID`/`PARTIALLY_PAID` automatically based on cumulative payments vs total.
- FR-PAY-04: Refunds are processed against a specific payment record, capped at the original amount.

### 22.5 Business Rules
- BR-01: Sum of payments against a bill can never exceed `total_amount` (overpayment blocked, or routed to patient credit balance if configured).
- BR-02: Refunds require a reason and, above a threshold, admin approval.
- BR-03: Cash payments require end-of-day reconciliation sign-off by a supervisor.

### 22.6 Validation Rules
Payment amount > 0; mode from enum (`CASH,CARD,UPI,NET_BANKING,INSURANCE,WALLET`); gateway transaction ID required for online modes.

### 22.7 API List
| # | Method | Route | Purpose |
|---|---|---|---|
|1| POST | `/api/v1/payments` | Record a payment (cash/manual modes) |
|2| POST | `/api/v1/payments/initiate-gateway` | Initiate online gateway payment session |
|3| POST | `/api/v1/payments/webhook` | Gateway webhook (payment confirmation) |
|4| GET | `/api/v1/payments/:id/receipt` | Download receipt PDF |
|5| POST | `/api/v1/payments/:id/refund` | Process refund |
|6| GET | `/api/v1/payments/reconciliation?date=` | Daily reconciliation report |

**POST /api/v1/payments/webhook**
- Auth: gateway signature verification (HMAC), not user JWT.
- Business Logic: verify webhook signature → idempotency check via `gateway_transaction_id` unique constraint (prevents duplicate processing on webhook retries) → update `payments.status` → recompute bill payment status → emit socket → audit log.

### 22.8 Database Tables
`payments(id, bill_id FK, patient_id FK, amount numeric, mode ENUM, status ENUM(PENDING,SUCCESS,FAILED,REFUNDED,PARTIALLY_REFUNDED), gateway_transaction_id UNIQUE NULLABLE, collected_by FK NULLABLE, created_at)`
`refunds(id, payment_id FK, amount numeric, reason, approved_by FK NULLABLE, status ENUM(PENDING,APPROVED,PROCESSED,REJECTED), created_at)`
`cash_reconciliation(id, staff_id FK, date, expected_amount numeric, counted_amount numeric, variance numeric, signed_off_by FK NULLABLE, created_at)`

### 22.9 Relationships
`payments.bill_id → bills.id`; `refunds.payment_id → payments.id`; `cash_reconciliation.staff_id → users.id`.

### 22.10 Mongo Collections
`audit_logs`, `activity_logs`, `payment_gateway_raw_logs` (full raw request/response payloads from gateway for dispute resolution).

### 22.11 Redis Usage
`payment:idempotency:{requestId}` short-TTL key preventing duplicate payment submission on client retry/double-click.

### 22.12 Background Jobs
`gateway-status-poll` (fallback polling for webhooks that never arrive, runs every 5 min for PENDING gateway payments older than 10 min), `daily-reconciliation-report`.

### 22.13 Notifications
Payment confirmation receipt (SMS/email) to patient; admin alert on reconciliation variance beyond tolerance.

### 22.14 Socket Events
`payments:recorded`, `payments:gateway-confirmed`, `billing:bill-updated` (cross-module, triggers Billing status refresh)

### 22.15 Error Handling
`ERR_OVERPAYMENT_BLOCKED`, `ERR_WEBHOOK_SIGNATURE_INVALID`, `ERR_REFUND_EXCEEDS_ORIGINAL`, `ERR_DUPLICATE_TRANSACTION`.

### 22.16–22.17 Audit / Activity Logs
`PAYMENT_RECORDED`, `GATEWAY_CONFIRMED`, `REFUND_PROCESSED`, `RECONCILIATION_SIGNED_OFF`.

### 22.18 Sequence Flow — see Section 32.

### 22.19 State Diagram (Payment)
`PENDING → SUCCESS → (optional) PARTIALLY_REFUNDED → REFUNDED`
`PENDING → FAILED`

### 22.20 Edge Cases
Gateway webhook arrives twice for the same transaction (at-least-once delivery) → unique constraint on `gateway_transaction_id` plus idempotency check makes the second call a no-op, returns cached success response.
Patient pays via gateway but browser closes before redirect confirmation → `gateway-status-poll` job reconciles state independent of client-side confirmation.

### 22.21 Permission Matrix
| Action | BILLING_STAFF | PATIENT (self) | HOSPITAL_ADMIN |
|---|---|---|---|
| Record cash/manual payment | ✅ | ❌ | ✅ |
| Pay via gateway | ❌ | ✅ | ❌ |
| Process refund | ✅ (within limit) | ❌ | ✅ (all) |
| View reconciliation | ❌ | ❌ | ✅ |

### 22.22 Acceptance Criteria
- Total payments recorded against a bill never exceed `bills.total_amount`; excess attempts return `409 ERR_OVERPAYMENT_BLOCKED`.
- A duplicate webhook delivery for the same `gateway_transaction_id` produces no duplicate payment record or double bill-status update.
- Refund amount cannot exceed the original payment amount, enforced at both validation and DB constraint level.

---

## 23. MODULE: Reports

### 23.1 Module Description
Cross-module analytical and operational reporting: census, revenue, clinical, inventory, and regulatory reports, with export and scheduling.

### 23.2 Features
Pre-built report templates (revenue, occupancy, doctor productivity, lab TAT, inventory valuation), custom date-range filtering, export (PDF/CSV/XLSX), scheduled email delivery.

### 23.3 User Roles
`HOSPITAL_ADMIN`, `SUPER_ADMIN` full access; department-scoped reports for `DOCTOR`(own)/`BILLING_STAFF`(financial)/`INVENTORY_MANAGER`(stock).

### 23.4 Functional Requirements
- FR-RPT-01: System provides pre-built report templates covering all major modules.
- FR-RPT-02: Reports support date-range, department, and doctor filters.
- FR-RPT-03: Reports can be exported in PDF/CSV/XLSX and scheduled for recurring email delivery.
- FR-RPT-04: Large reports are generated asynchronously (background job) with progress tracking, avoiding request timeouts.

### 23.5 Business Rules
- BR-01: Financial reports are restricted to `BILLING_STAFF`/`HOSPITAL_ADMIN`/`SUPER_ADMIN` only.
- BR-02: Reports containing PII are watermarked with the requesting user's identity for leak traceability.

### 23.6 Validation Rules
Date range required and ≤ 1 year span per single report request (larger spans require the async/scheduled path).

### 23.7 API List
| # | Method | Route | Purpose |
|---|---|---|---|
|1| GET | `/api/v1/reports/templates` | List available report templates |
|2| POST | `/api/v1/reports/generate` | Generate a report (sync for small, async job for large) |
|3| GET | `/api/v1/reports/jobs/:id` | Poll async report job status |
|4| GET | `/api/v1/reports/jobs/:id/download` | Download completed report file |
|5| POST | `/api/v1/reports/schedule` | Schedule recurring report email |
|6| GET | `/api/v1/reports/schedule` | List active schedules |

### 23.8 Database Tables
`report_templates(id, name, module, description, query_definition jsonb)`
`report_jobs(id, template_id FK, requested_by FK, params jsonb, status ENUM(QUEUED,PROCESSING,COMPLETED,FAILED), s3_key NULLABLE, created_at, completed_at)`
`report_schedules(id, template_id FK, params jsonb, cron_expression, recipients text[], created_by FK, is_active bool)`

### 23.9 Relationships
`report_jobs.template_id → report_templates.id`; `report_schedules.template_id → report_templates.id`.

### 23.10 Mongo Collections
`audit_logs` (report access/export, given PII sensitivity), `activity_logs`.

### 23.11 Redis Usage
`report:job:{id}:progress` percentage-complete counter for polling UI.

### 23.12 Background Jobs
`generate-report` (heavy aggregation queries run off the request thread), `scheduled-report-dispatch` (cron per `report_schedules.cron_expression`).

### 23.13 Notifications
Email with report attachment/link on completion (scheduled or on-demand-async).

### 23.14 Socket Events
`reports:job-progress { jobId, percent }`, `reports:job-completed`

### 23.15 Error Handling
`ERR_DATE_RANGE_TOO_LARGE`, `ERR_UNAUTHORIZED_REPORT_TYPE`, `ERR_REPORT_GENERATION_FAILED`.

### 23.16–23.17 Audit / Activity Logs
`REPORT_GENERATED`, `REPORT_EXPORTED`, `SCHEDULE_CREATED`.

### 23.18 Sequence Flow
Admin selects template+filters → sync small reports return inline; large reports enqueue `report_jobs` row `QUEUED` → worker processes → progress pushed via socket → on completion, file uploaded to S3, job `COMPLETED` → download link served via signed S3 URL (time-limited).

### 23.19 State Diagram
`QUEUED → PROCESSING → COMPLETED`
`QUEUED → PROCESSING → FAILED` (retryable)

### 23.20 Edge Cases
Report requested for a date range spanning a schema migration boundary (historical field renamed) → template query definitions are versioned to handle backward compatibility.
Scheduled report recipient list includes a deactivated user email → job still sends (email is data, not access-gated) but flags a warning for admin review.

### 23.21 Permission Matrix
| Action | SUPER_ADMIN | HOSPITAL_ADMIN | DOCTOR | BILLING_STAFF | INVENTORY_MANAGER |
|---|---|---|---|---|---|
| Clinical reports | ✅ | ✅ | ✅ (own) | ❌ | ❌ |
| Financial reports | ✅ | ✅ | ❌ | ✅ | ❌ |
| Inventory reports | ✅ | ✅ | ❌ | ❌ | ✅ |

### 23.22 Acceptance Criteria
- Async report jobs expose progress updates at least every 10% completion via socket.
- Financial report access by a non-authorized role returns `403 ERR_UNAUTHORIZED_REPORT_TYPE`.
- Download links are time-limited signed S3 URLs (default 15 min expiry), never permanent public links.

---

## 24. MODULE: Notifications

### 24.1 Module Description
Central notification dispatch service abstracting SMS/Email/Push/In-app channels, used by every other module as a shared dependency.

### 24.2 Features
Multi-channel dispatch, template management, user notification preferences, delivery status tracking, in-app notification center/inbox.

### 24.3 User Roles
All users receive notifications; `HOSPITAL_ADMIN`/`SUPER_ADMIN` manage templates and channel configuration.

### 24.4 Functional Requirements
- FR-NOTIF-01: Any module can trigger a notification by publishing an event with a template key and context data.
- FR-NOTIF-02: Users can configure channel preferences per notification category (e.g., disable SMS reminders, keep email).
- FR-NOTIF-03: In-app notifications appear in a persistent inbox with read/unread state, delivered in real time via Socket.IO.
- FR-NOTIF-04: Delivery status (sent/delivered/failed) is tracked per channel for observability.

### 24.5 Business Rules
- BR-01: Critical/safety notifications (e.g., lab critical value alert) bypass user channel-preference opt-outs.
- BR-02: SMS templates must comply with DLT registration requirements (India-specific regulatory constraint referenced from prior TGLevels-style integrations).

### 24.6 Validation Rules
Template key must exist in `notification_templates`; recipient must have at least one valid contact channel for the requested type.

### 24.7 API List
| # | Method | Route | Purpose |
|---|---|---|---|
|1| GET | `/api/v1/notifications` | Get in-app notification inbox (paginated) |
|2| PATCH | `/api/v1/notifications/:id/read` | Mark as read |
|3| PATCH | `/api/v1/notifications/read-all` | Mark all read |
|4| GET | `/api/v1/notifications/preferences` | Get channel preferences |
|5| PATCH | `/api/v1/notifications/preferences` | Update preferences |
|6| GET | `/api/v1/notifications/templates` (admin) | Manage templates |

### 24.8 Database Tables
`notification_templates(id, key UNIQUE, channel ENUM(SMS,EMAIL,PUSH,IN_APP), subject, body_template text, is_critical bool)`
`notification_preferences(id, user_id FK, category, channel ENUM, is_enabled bool)` UNIQUE `(user_id, category, channel)`
`notifications(id, user_id FK, template_key, channel ENUM, payload jsonb, status ENUM(QUEUED,SENT,DELIVERED,FAILED,READ), created_at, read_at)`

### 24.9 Relationships
`notifications.user_id → users.id`; `notification_preferences.user_id → users.id`.

### 24.10 Mongo Collections
`notification_delivery_logs` (raw provider responses per send attempt, high-volume append-only, Mongo preferred over Postgres for write throughput), `audit_logs`.

### 24.11 Redis Usage
`notifications:unread-count:{userId}` cached counter for fast badge rendering; pub/sub channel backing Socket.IO horizontal scaling (`socket.io-redis-adapter`).

### 24.12 Background Jobs
`dispatch-notification` (generic worker consuming a queue per channel: `sms-queue`, `email-queue`, `push-queue`), `retry-failed-notification` (exponential backoff, max 3 retries).

### 24.13 Notifications
(This module *is* the notification system — see channel details above.)

### 24.14 Socket Events
`notifications:new { notification }`, `notifications:unread-count-updated`

### 24.15 Error Handling
`ERR_TEMPLATE_NOT_FOUND`, `ERR_NO_VALID_CHANNEL`, `ERR_PROVIDER_FAILURE` (SMS/email gateway down — falls back to alternate channel where configured).

### 24.16–24.17 Audit / Activity Logs
`NOTIFICATION_SENT`, `PREFERENCE_UPDATED`, `TEMPLATE_UPDATED`.

### 24.18 Sequence Flow
Source module (e.g., Appointments) publishes internal event → Notification service resolves template + user preferences → for each enabled channel, enqueue channel-specific job → worker calls provider → updates `notifications.status` → for `IN_APP`/all channels, emit socket event to connected client and increment Redis unread counter.

### 24.19 State Diagram
`QUEUED → SENT → DELIVERED`
`QUEUED → SENT → FAILED → (retry) → SENT | FAILED (terminal after max retries)`
`DELIVERED → READ` (in-app only)

### 24.20 Edge Cases
Critical alert for a user who has disabled all channels → BR-01 override forces at least the highest-priority available channel (SMS/push) regardless of preference.
Provider (SMS gateway) outage → job retries with backoff, falls back to email if configured as secondary channel for that template.

### 24.21 Permission Matrix
| Action | All Users | HOSPITAL_ADMIN | SUPER_ADMIN |
|---|---|---|---|
| View own inbox | ✅ | ✅ | ✅ |
| Edit own preferences | ✅ | ✅ | ✅ |
| Manage templates | ❌ | ✅ (own hospital) | ✅ |

### 24.22 Acceptance Criteria
- Critical notifications are delivered regardless of user opt-out settings (verified by test forcing all channels off).
- Unread badge count in Redis always matches count of `notifications.status != 'READ'` for that user (reconciliation job).
- Failed sends retry up to 3 times with exponential backoff before being marked terminally `FAILED`.

---

## 25. MODULE: Chat (Internal Staff Chat)

### 25.1 Module Description
Real-time messaging between staff members (doctor-nurse, doctor-doctor, department teams) for care coordination, backed by MongoDB + Socket.IO.

### 25.2 Features
1:1 and group conversations, typing indicators, read receipts, file/image attachments, message search, conversation pinning per department/ward context.

### 25.3 User Roles
All internal staff roles; not exposed to `PATIENT` (see Module 26 for patient-facing chat).

### 25.4 Functional Requirements
- FR-CHAT-01: Staff can start a 1:1 or group conversation with other staff.
- FR-CHAT-02: Messages deliver in real time via Socket.IO; offline recipients receive push notification + see unread on next login.
- FR-CHAT-03: Conversations can be linked to a clinical context (e.g., a specific IPD admission) for quick reference.
- FR-CHAT-04: Full-text search across a user's own conversation history.

### 25.5 Business Rules
- BR-01: A user can only read/send in conversations they are a participant of.
- BR-02: Messages are never hard-deleted; "delete for me" hides client-side, "delete for everyone" (within 5 min) soft-tombstones content but preserves audit trail.

### 25.6 Validation Rules
Message body non-empty or must contain ≥1 attachment; attachment size ≤ 25MB.

### 25.7 API List
| # | Method | Route | Purpose |
|---|---|---|---|
|1| POST | `/api/v1/chat/conversations` | Create 1:1/group conversation |
|2| GET | `/api/v1/chat/conversations` | List user's conversations |
|3| GET | `/api/v1/chat/conversations/:id/messages` | Paginated message history (cursor-based) |
|4| POST | `/api/v1/chat/conversations/:id/messages` | Send message (also emitted via socket) |
|5| PATCH | `/api/v1/chat/messages/:id` | Edit/delete-for-everyone |
|6| POST | `/api/v1/chat/conversations/:id/read` | Mark conversation read up to messageId |

### 25.8 Database Tables (PostgreSQL — participant/metadata only)
`chat_conversations(id, type ENUM(DIRECT,GROUP), title NULLABLE, linked_entity_type NULLABLE, linked_entity_id NULLABLE, created_by FK, created_at)`
`chat_participants(id, conversation_id FK, user_id FK, joined_at, last_read_message_id NULLABLE)`

### 25.9 Relationships
`chat_participants.conversation_id → chat_conversations.id` (M:N join between users and conversations); `linked_entity_id` polymorphically references e.g. `ipd_admissions.id`.

### 25.10 Mongo Collections
`chat_messages(_id, conversationId, senderId, body, attachments: [{s3Key, type, size}], status: SENT|DELIVERED|READ, editedAt, deletedForEveryoneAt, createdAt)` — Mongo chosen for high write volume and flexible message schema; indexed on `{conversationId, createdAt}`.

### 25.11 Redis Usage
`chat:typing:{conversationId}` short-TTL set of currently-typing user IDs; `chat:presence:{userId}` online/offline status (heartbeat-based); Socket.IO Redis adapter for multi-instance pub/sub.

### 25.12 Background Jobs
`chat-attachment-scan` (virus/content scan on uploads), `push-notify-offline-participants`.

### 25.13 Notifications
Push notification for new message when recipient is offline/app backgrounded.

### 25.14 Socket Events
`chat:message-new`, `chat:message-edited`, `chat:message-deleted`, `chat:typing`, `chat:read-receipt`, `chat:presence-changed`

### 25.15 Error Handling
`ERR_NOT_PARTICIPANT`, `ERR_EDIT_WINDOW_EXPIRED`, `ERR_ATTACHMENT_TOO_LARGE`.

### 25.16–25.17 Audit / Activity Logs
`CONVERSATION_CREATED`, `MESSAGE_SENT` (metadata only, not full content, in `audit_logs`; full content lives in Mongo `chat_messages` itself as the source of truth).

### 25.18 Sequence Flow
Client emits socket `chat:send-message` (or REST fallback) → server validates participant membership → persists to Mongo → updates conversation `last_message_at` → broadcasts to all participant sockets in the conversation room → offline participants queued for push notification job.

### 25.19 State Diagram (Message)
`SENT → DELIVERED → READ`
`SENT → EDITED` (content updated, `editedAt` set) | `→ DELETED_FOR_EVERYONE` (tombstoned)

### 25.20 Edge Cases
User removed from a group mid-conversation → they retain read access to historical messages up to removal point but stop receiving new ones (participant row soft-marked `left_at`).
Simultaneous edit and delete race on same message → last-write-wins with Mongo document versioning (`__v`) optimistic concurrency check.

### 25.21 Permission Matrix
| Action | Participant | Non-Participant |
|---|---|---|
| Read/send messages | ✅ | ❌ |
| Edit/delete own message | ✅ (within window) | ❌ |

### 25.22 Acceptance Criteria
- A non-participant's attempt to fetch conversation messages returns `403 ERR_NOT_PARTICIPANT`.
- Typing indicators clear automatically after 5s of inactivity (Redis TTL expiry) without requiring an explicit "stop typing" event.
- Message delivery to online recipients occurs within 500ms p95 via Socket.IO.

---

## 26. MODULE: Patient Chat

### 26.1 Module Description
Secure messaging channel between patients and their care team (assigned doctor/reception) for non-emergency queries, appointment-related questions, and report follow-ups.

### 26.2 Features
Patient-initiated chat to assigned doctor/department, staff-side unified inbox across patients, canned/quick-reply templates, escalation to phone call/appointment booking.

### 26.3 User Roles
`PATIENT` initiates; `DOCTOR`/`RECEPTIONIST` respond; `HOSPITAL_ADMIN` oversight/audit.

### 26.4 Functional Requirements
- FR-PCHAT-01: Patient can start a chat only with a doctor they have an existing/past appointment relationship with, or a general reception queue.
- FR-PCHAT-02: Staff-side inbox aggregates all patient conversations with SLA-based prioritization (unanswered > X hours flagged).
- FR-PCHAT-03: Patient chat explicitly displays a disclaimer that it is not for medical emergencies, with an emergency-contact shortcut.
- FR-PCHAT-04: Conversations can be converted into an appointment booking or escalated to Ambulance dispatch directly from the chat UI.

### 26.5 Business Rules
- BR-01: Patients cannot initiate chat with a doctor they have zero appointment history with (prevents unsolicited contact / spam).
- BR-02: All patient chat is retained per medical-record retention policy (not user-deletable, unlike internal staff chat's soft-delete option).

### 26.6 Validation Rules
Same as Chat module (25.6) plus relationship-existence check on conversation creation.

### 26.7 API List
| # | Method | Route | Purpose |
|---|---|---|---|
|1| POST | `/api/v1/patient-chat/conversations` | Patient starts conversation with eligible doctor/reception |
|2| GET | `/api/v1/patient-chat/conversations` | List (patient: own; staff: assigned inbox) |
|3| GET | `/api/v1/patient-chat/conversations/:id/messages` | Message history |
|4| POST | `/api/v1/patient-chat/conversations/:id/messages` | Send message |
|5| POST | `/api/v1/patient-chat/conversations/:id/escalate` | Escalate to appointment/ambulance |

### 26.8 Database Tables
`patient_chat_conversations(id, patient_id FK, staff_id FK NULLABLE, department_id FK NULLABLE, status ENUM(OPEN,ANSWERED,CLOSED,ESCALATED), created_at, last_message_at)`

### 26.9 Relationships
`patient_chat_conversations.patient_id → patients.id`; `.staff_id → users.id`; validated against `appointments` for relationship-existence rule.

### 26.10 Mongo Collections
`patient_chat_messages(_id, conversationId, senderType: PATIENT|STAFF, senderId, body, attachments, createdAt)`; `audit_logs`.

### 26.11 Redis Usage
`patient-chat:sla-queue` sorted set by `last_message_at` for unanswered-conversation SLA dashboard; presence/typing as in Chat module.

### 26.12 Background Jobs
`sla-breach-alert` (flags conversations unanswered beyond threshold, notifies department lead), `push-notify-patient`.

### 26.13 Notifications
Push/SMS to patient on staff reply; internal alert to staff on SLA breach risk.

### 26.14 Socket Events
`patient-chat:message-new`, `patient-chat:sla-alert`, `patient-chat:escalated`

### 26.15 Error Handling
`ERR_NO_RELATIONSHIP` (patient tries to message a doctor with no appointment history), `ERR_CONVERSATION_CLOSED`.

### 26.16–26.17 Audit / Activity Logs
`CONVERSATION_STARTED`, `MESSAGE_SENT`, `ESCALATED`, `CLOSED`.

### 26.18 Sequence Flow
Patient selects doctor (from own appointment history) → system verifies relationship → conversation created `OPEN` → message sent → staff inbox updated (socket) → staff replies → status `ANSWERED` → patient can reopen; if unresolved beyond SLA, `sla-breach-alert` escalates visibility to department lead.

### 26.19 State Diagram
`OPEN → ANSWERED ⇄ OPEN (reply cycles) → CLOSED`
`OPEN → ESCALATED (→ Appointment or Ambulance module)`

### 26.20 Edge Cases
Patient attempts to message a doctor who has since left the hospital (deactivated) → conversation auto-routes to department general queue instead of failing outright.
Patient sends a message describing emergency symptoms (keyword-flagged, e.g., "chest pain", "can't breathe") → UI surfaces an immediate emergency-contact/ambulance-dispatch prompt above the reply box (assistive, not fully automated dispatch).

### 26.21 Permission Matrix
| Action | PATIENT (self) | DOCTOR (assigned) | RECEPTIONIST | HOSPITAL_ADMIN |
|---|---|---|---|---|
| Start conversation | ✅ | ❌ | ❌ | ❌ |
| Reply | ❌ | ✅ | ✅ (general queue) | ✅ (oversight) |
| Escalate | ✅ | ✅ | ✅ | ✅ |
| View all patient chats | ❌ | ❌ (own only) | ❌ | ✅ |

### 26.22 Acceptance Criteria
- A patient with zero appointment history against a chosen doctor receives `403 ERR_NO_RELATIONSHIP` when attempting to initiate a chat.
- Conversations unanswered beyond the configured SLA window are surfaced in the department-lead escalation view within 5 minutes of breach.

---

## 27. MODULE: AI Chatbot

### 27.1 Module Description
LLM-powered virtual assistant for patients (appointment booking help, FAQ, symptom-triage guidance, navigation) and for staff (documentation lookup, quick clinical reference), with strict guardrails against diagnostic overreach.

### 27.2 Features
Conversational Q&A, appointment-booking assistance (guides patient through booking flow via tool-calling), FAQ retrieval-augmented answers, symptom-triage disclaimers routing to emergency/appointment paths, staff-facing internal-docs Q&A.

### 27.3 User Roles
`PATIENT`, all staff roles (scoped differently — patient bot vs staff bot are logically separate assistants with different system prompts/tool access).

### 27.4 Functional Requirements
- FR-BOT-01: Patient chatbot answers FAQ and can invoke booking tools (check doctor availability, create appointment) on the patient's behalf with explicit confirmation before finalizing.
- FR-BOT-02: Chatbot never provides a diagnosis or prescribes treatment; symptom-related queries are answered with general guidance plus a directive to book an appointment or, for red-flag symptoms, contact emergency services.
- FR-BOT-03: Staff chatbot answers questions against internal knowledge base (policies, SOPs) via retrieval-augmented generation (RAG), scoped to the staff member's role/department.
- FR-BOT-04: Every chatbot conversation is logged for quality review and abuse monitoring.

### 27.5 Business Rules
- BR-01: Any tool-invoking action with a real-world side effect (e.g., booking an appointment) requires explicit user confirmation step before execution — no silent autonomous booking.
- BR-02: Red-flag symptom keywords trigger a hard-coded emergency-guidance response that bypasses the LLM's free-form generation for that turn (safety guardrail, deterministic).

### 27.6 Validation Rules
Message length capped (e.g., 2000 chars); rate-limited per user to prevent abuse/cost overrun.

### 27.7 API List
| # | Method | Route | Purpose |
|---|---|---|---|
|1| POST | `/api/v1/chatbot/conversations` | Start a new chatbot session |
|2| POST | `/api/v1/chatbot/conversations/:id/messages` | Send message, receive AI response (streaming) |
|3| GET | `/api/v1/chatbot/conversations/:id` | Fetch conversation history |
|4| POST | `/api/v1/chatbot/conversations/:id/feedback` | Thumbs up/down on a response |

**POST /api/v1/chatbot/conversations/:id/messages**
- Request: `{ message: string }` — Response: Server-Sent Events / chunked stream of assistant tokens, final message includes any `toolCalls` requiring confirmation.
- Business Logic: pre-filter message against red-flag keyword list (deterministic bypass, BR-02) → if clear, assemble context (recent conversation turns + role-scoped system prompt + available tool schema: `checkDoctorSlots`, `createAppointmentDraft`) → call LLM with streaming → if LLM emits a tool call, pause and return a confirmation prompt to the client rather than auto-executing → on user confirmation, execute the actual module API (e.g., Appointments `POST /appointments`) server-side → persist full turn to Mongo.

### 27.8 Database Tables
`chatbot_sessions(id, user_id FK, user_type ENUM(PATIENT,STAFF), status ENUM(ACTIVE,ENDED), started_at, ended_at)`

### 27.9 Relationships
`chatbot_sessions.user_id → users.id`.

### 27.10 Mongo Collections
`chatbot_messages(_id, sessionId, role: USER|ASSISTANT|TOOL, content, toolCalls: [], toolResults: [], createdAt)`; `chatbot_feedback(_id, sessionId, messageId, rating: UP|DOWN, comment)`; `audit_logs`.

### 27.11 Redis Usage
`chatbot:ratelimit:{userId}` token-bucket; `chatbot:session:{id}:context` short-lived rolling context cache to avoid re-fetching full Mongo history every turn.

### 27.12 Background Jobs
`chatbot-conversation-review-export` (periodic sampling for QA), `chatbot-abuse-detection` (flags sessions with repeated red-flag/policy-violating content for admin review).

### 27.13 Notifications
None directly; a confirmed booking flows through to standard Appointments notifications.

### 27.14 Socket Events
Primarily HTTP-streaming based; optional `chatbot:typing` for UI parity with human chat modules.

### 27.15 Error Handling
`ERR_RATE_LIMITED`, `ERR_AI_PROVIDER_UNAVAILABLE` (graceful fallback message directing to human reception), `ERR_TOOL_EXECUTION_FAILED` (surfaces the underlying module's error, e.g., `ERR_SLOT_TAKEN`, back to the chat turn).

### 27.16–27.17 Audit / Activity Logs
`SESSION_STARTED`, `TOOL_CALL_CONFIRMED`, `TOOL_CALL_EXECUTED`, `FEEDBACK_SUBMITTED`.

### 27.18 Sequence Flow — see Section 37 for full chatbot workflow diagram.

### 27.19 State Diagram (Session)
`ACTIVE → ENDED` (timeout after inactivity or explicit end)
Per-turn sub-flow: `USER_MESSAGE → [red-flag check] → LLM_PROCESSING → (TOOL_CALL_PROPOSED → USER_CONFIRMATION → TOOL_EXECUTED) | ASSISTANT_RESPONSE`

### 27.20 Edge Cases
Patient message contains a red-flag symptom mid-conversation about an unrelated topic → deterministic guardrail still fires for that turn regardless of conversation context, overriding normal LLM flow.
LLM proposes booking a slot that becomes unavailable between proposal and user confirmation → execution attempt returns `ERR_SLOT_TAKEN`, chatbot gracefully offers next available slot rather than erroring out to the user.

### 27.21 Permission Matrix
| Action | PATIENT | Staff (any) | HOSPITAL_ADMIN |
|---|---|---|---|
| Use patient-scoped bot | ✅ | ❌ | ❌ |
| Use staff-scoped bot | ❌ | ✅ (role-scoped KB) | ✅ |
| Review conversation logs | ❌ | ❌ | ✅ |

### 27.22 Acceptance Criteria
- No appointment or any other side-effecting action is ever executed without an explicit user confirmation turn.
- Messages containing configured red-flag symptom keywords always receive the deterministic emergency-guidance response, verified by a fixed test-suite of trigger phrases, independent of LLM output variability.
- Streaming responses begin within 1s of message submission (first token latency).

---

## 28. MODULE: Uploads

### 28.1 Module Description
Centralized file-upload service (S3-backed) used by all modules needing document/image storage — patient documents, lab reports, prescriptions, chat attachments, avatars.

### 28.2 Features
Pre-signed upload URL generation, direct-to-S3 client upload, virus/content scanning, file metadata registry, access-controlled signed download URLs.

### 28.3 User Roles
All authenticated users, scoped by the owning module's own permission rules (Uploads itself is a shared infrastructure module, not independently role-gated beyond authentication).

### 28.4 Functional Requirements
- FR-UPL-01: Client requests a pre-signed S3 PUT URL for direct upload (avoids proxying large files through the API server).
- FR-UPL-02: On upload completion, client confirms with the server, which records metadata and triggers async scanning.
- FR-UPL-03: Downloads are served via short-lived signed GET URLs, never public S3 links.
- FR-UPL-04: Files failing content scan are quarantined and the referencing module is notified.

### 28.5 Business Rules
- BR-01: Max file size per type: images 10MB, documents 25MB, video (rare, e.g., procedure recording) 500MB via multipart upload.
- BR-02: Allowed mime-types are whitelisted per upload context (e.g., avatar accepts only image/*).

### 28.6 Validation Rules
File extension/mime-type must match declared `uploadContext`; filename sanitized (no path traversal characters).

### 28.7 API List
| # | Method | Route | Purpose |
|---|---|---|---|
|1| POST | `/api/v1/uploads/presign` | Request pre-signed upload URL |
|2| POST | `/api/v1/uploads/:id/confirm` | Confirm upload complete, trigger scan |
|3| GET | `/api/v1/uploads/:id/download-url` | Get signed download URL |
|4| DELETE | `/api/v1/uploads/:id` | Delete file (soft, tombstone S3 object per retention policy) |

**POST /api/v1/uploads/presign**
- Request: `{ uploadContext: "PATIENT_DOC"|"LAB_REPORT"|"CHAT_ATTACHMENT"|"AVATAR"|..., filename, mimeType, sizeBytes }`
- Business Logic: validate mime/size against context whitelist → generate S3 key `uploads/{context}/{uuid}/{filename}` → issue pre-signed PUT URL (5 min expiry) → create `file_uploads` row `status=PENDING`.

### 28.8 Database Tables
`file_uploads(id, uploaded_by FK users, upload_context varchar, s3_key UNIQUE, original_filename, mime_type, size_bytes, status ENUM(PENDING,UPLOADED,SCANNED_CLEAN,SCANNED_INFECTED,FAILED), created_at)`

### 28.9 Relationships
Referenced (loosely, by `s3_key`/`file_id`) from `patient_documents`, `lab_orders` (report PDFs), `discharge_summaries`, chat attachments (Mongo), `users.user_profiles.avatar_url`.

### 28.10 Mongo Collections
`audit_logs`.

### 28.11 Redis Usage
`upload:presign:{id}` short-TTL tracking of pending presigned requests (cleanup of abandoned uploads that never confirm).

### 28.12 Background Jobs
`content-scan` (runs AV/content scan on `UPLOADED` files), `abandoned-upload-cleanup` (cron, purges `PENDING` presign records older than 1h with no confirmation).

### 28.13 Notifications
Referencing module notified if a scan comes back `SCANNED_INFECTED` (e.g., admin alert to review/re-request the document).

### 28.14 Socket Events
`uploads:scan-complete { fileId, status }`

### 28.15 Error Handling
`ERR_FILE_TOO_LARGE`, `ERR_INVALID_MIME_TYPE`, `ERR_UPLOAD_NOT_CONFIRMED` (attempting to reference a file still `PENDING`).

### 28.16–28.17 Audit / Activity Logs
`UPLOAD_INITIATED`, `UPLOAD_CONFIRMED`, `FILE_SCANNED`, `FILE_DELETED`.

### 28.18 Sequence Flow
Client requests presign → uploads directly to S3 via PUT → client calls confirm → server verifies object exists in S3 (HEAD request) → `status=UPLOADED` → enqueues content-scan job → scan result updates status → downstream module (e.g., Patients) can now safely reference the `file_id`.

### 28.19 State Diagram
`PENDING → UPLOADED → SCANNED_CLEAN`
`UPLOADED → SCANNED_INFECTED → (quarantined, not servable)`
`PENDING → (timeout) → FAILED`

### 28.20 Edge Cases
Client confirms upload but S3 object doesn't actually exist (network failure mid-upload) → confirm's HEAD check fails, returns `ERR_UPLOAD_NOT_CONFIRMED`, record stays `PENDING` for retry.
Infected file detected post-scan, already referenced by a clinical record → referencing module notified to prompt re-upload; original clinical record entry flagged pending-document rather than silently broken.

### 28.21 Permission Matrix
| Action | Any Authenticated User |
|---|---|
| Presign/upload own-context files | ✅ (subject to owning module's authorization) |
| Download | ✅ (subject to owning module's authorization check before issuing signed URL) |

### 28.22 Acceptance Criteria
- No file is ever servable via download-url before `status=SCANNED_CLEAN`.
- Presigned upload URLs expire within 5 minutes and cannot be reused after expiry.
- Download URLs are time-limited (≤15 min) signed URLs; direct public S3 access is disabled at the bucket-policy level.

---

## 29. MODULE: Audit

### 29.1 Module Description
System-wide, tamper-evident audit trail viewer and export tool, consuming the `audit_logs` Mongo collection written by every other module (per Section 3.5 global standard).

### 29.2 Features
Searchable audit log viewer (by actor/module/entity/date), export for compliance (SEBI/HIPAA-equivalent style regulatory audits), anomaly flagging (e.g., off-hours mass data export).

### 29.3 User Roles
`SUPER_ADMIN` full access; `HOSPITAL_ADMIN` scoped to own hospital.

### 29.4 Functional Requirements
- FR-AUD-01: Every mutating action across all modules is queryable in a unified audit viewer.
- FR-AUD-02: Audit records are immutable — no API exists to edit or delete an audit log entry.
- FR-AUD-03: Admin can export a filtered audit log set as CSV/PDF for regulatory review.
- FR-AUD-04: System flags anomalous access patterns (e.g., a user viewing an unusually high number of distinct patient records in a short window) for security review.

### 29.5 Business Rules
- BR-01: Audit log retention is indefinite (compliance requirement); no automated purge job exists for this collection.
- BR-02: Even `SUPER_ADMIN` actions are themselves audit-logged, including audit-log *viewing/export* actions (meta-audit).

### 29.6 Validation Rules
Export date range required; export requests themselves are rate-limited and logged.

### 29.7 API List
| # | Method | Route | Purpose |
|---|---|---|---|
|1| GET | `/api/v1/audit/logs` | Search/filter audit logs (paginated) |
|2| GET | `/api/v1/audit/logs/:entityType/:entityId` | Full history for a specific entity |
|3| POST | `/api/v1/audit/export` | Export filtered logs (async job) |
|4| GET | `/api/v1/audit/anomalies` | List flagged anomalous access patterns |

### 29.8 Database Tables
None in Postgres (audit data lives in Mongo per global standard); `audit_export_jobs(id, requested_by FK, filters jsonb, status ENUM, s3_key NULLABLE, created_at)` (Postgres, for job tracking only).

### 29.9 Relationships
`audit_export_jobs.requested_by → users.id`; logically references all entities system-wide via `entityType`/`entityId` polymorphic fields in Mongo.

### 29.10 Mongo Collections
`audit_logs` (primary, written by all modules per 3.5), `audit_anomaly_flags(_id, actorId, pattern, severity, details, detectedAt, reviewedBy, reviewedAt)`.

### 29.11 Redis Usage
`audit:search-cache:{queryHash}` short-TTL cache for repeated identical filter queries on the admin dashboard.

### 29.12 Background Jobs
`audit-anomaly-scan` (periodic pattern analysis, e.g., excessive-record-access detection), `audit-export-generate`.

### 29.13 Notifications
Security team alerted on high-severity anomaly flags.

### 29.14 Socket Events
`audit:anomaly-detected` (security dashboard live alert).

### 29.15 Error Handling
`ERR_EXPORT_RANGE_TOO_LARGE`, `ERR_UNAUTHORIZED_AUDIT_ACCESS`.

### 29.16–29.17 Audit / Activity Logs
This module both consumes and produces `audit_logs`: viewing/exporting audit data is itself logged as `AUDIT_VIEWED`/`AUDIT_EXPORTED` (meta-audit, per BR-02).

### 29.18 Sequence Flow
Any module writes an audit event at time of mutation (synchronous write, not queued — audit integrity must not depend on a job succeeding later) → Audit module provides read/search/export over this accumulated data → anomaly scan runs periodically over the same collection independently.

### 29.19 State Diagram
Audit log entries have no state machine — they are immutable, append-only, terminal upon creation. Export jobs follow: `QUEUED → PROCESSING → COMPLETED|FAILED`.

### 29.20 Edge Cases
Extremely high-volume audit query (e.g., "all actions in the last year") → API enforces server-side pagination and a maximum unindexed-scan protection via required date-range + indexed fields, rejecting overly broad unfiltered queries with `ERR_EXPORT_RANGE_TOO_LARGE`.

### 29.21 Permission Matrix
| Action | SUPER_ADMIN | HOSPITAL_ADMIN | All Other Staff |
|---|---|---|---|
| View audit logs | ✅ (all) | ✅ (own hospital) | ❌ |
| Export | ✅ | ✅ | ❌ |
| Review anomaly flags | ✅ | ✅ (own hospital) | ❌ |

### 29.22 Acceptance Criteria
- No API endpoint exists anywhere in the system capable of modifying or deleting an existing `audit_logs` document (verified by security review/pen-test, not just code review).
- Audit log write for a mutating action occurs synchronously within the same request lifecycle as the mutation itself (never solely dependent on an async job that could fail silently).
- Viewing another hospital's audit logs as a `HOSPITAL_ADMIN` returns `403 ERR_UNAUTHORIZED_AUDIT_ACCESS`.

---

## 30. MODULE: Settings

### 30.1 Module Description
System-wide and hospital-level configuration: general settings, working hours, tax/billing config, feature toggles, integration credentials (masked), branding.

### 30.2 Features
Hospital profile configuration, business-hours setup, tax/discount policy configuration, feature flags, SMS/Email provider configuration, branding (logo, invoice header), notification-template management (shared with Module 24).

### 30.3 User Roles
`SUPER_ADMIN` (global/system settings), `HOSPITAL_ADMIN` (hospital-scoped settings).

### 30.4 Functional Requirements
- FR-SET-01: Admin configures hospital profile (name, address, registration numbers, logo).
- FR-SET-02: Admin configures global business rules referenced elsewhere (discount approval threshold, appointment cancellation cutoff, cache TTLs where exposed, working hours).
- FR-SET-03: Admin manages feature flags to progressively roll out modules (e.g., disable AI Chatbot for a hospital not yet ready).
- FR-SET-04: Integration credentials (SMS/Email/Payment gateway API keys) are stored encrypted, never returned in plaintext via API.

### 30.5 Business Rules
- BR-01: Credential fields are write-only via API (accepted on PUT, never included in GET responses — masked as `••••1234`).
- BR-02: Changes to global thresholds (e.g., discount approval limit) take effect only for new transactions, never retroactively reinterpreting already-finalized records.

### 30.6 Validation Rules
Working hours start < end; tax rate 0–100%; feature flag keys from a controlled registry (cannot create arbitrary unknown flags via API).

### 30.7 API List
| # | Method | Route | Purpose |
|---|---|---|---|
|1| GET | `/api/v1/settings/hospital-profile` | Get hospital profile |
|2| PATCH | `/api/v1/settings/hospital-profile` | Update profile |
|3| GET | `/api/v1/settings/business-rules` | Get configurable thresholds |
|4| PATCH | `/api/v1/settings/business-rules` | Update thresholds |
|5| GET | `/api/v1/settings/feature-flags` | List feature flags + status |
|6| PATCH | `/api/v1/settings/feature-flags/:key` | Toggle a flag |
|7| PUT | `/api/v1/settings/integrations/:provider` | Set/update integration credentials (masked in response) |

### 30.8 Database Tables
`hospital_profile(id, name, address jsonb, registration_no, logo_url, tax_id, created_at)`
`business_rules(id, key UNIQUE, value jsonb, updated_by FK, updated_at)`
`feature_flags(id, key UNIQUE, is_enabled bool, description, updated_by FK, updated_at)`
`integration_credentials(id, provider ENUM(SMS,EMAIL,PAYMENT_GATEWAY,AI_PROVIDER), encrypted_config bytea, updated_by FK, updated_at)`

### 30.9 Relationships
All settings tables are largely standalone singleton/keyed configuration, referenced logically (not via FK) by business logic across every other module (e.g., Billing reads `business_rules.discount_approval_threshold`).

### 30.10 Mongo Collections
`audit_logs` (all settings changes are high-sensitivity and fully audited).

### 30.11 Redis Usage
`settings:business-rules` and `settings:feature-flags` cached in Redis (short TTL, e.g., 60s) since these are read on nearly every request path across modules; write operations bust cache immediately.

### 30.12 Background Jobs
None typically synchronous; optional `credential-rotation-reminder` (alerts admin when integration credentials haven't been rotated in N months).

### 30.13 Notifications
Admin notified on any settings change (self-notification for change confirmation/traceability) and on credential rotation reminders.

### 30.14 Socket Events
`settings:updated { key }` (broadcast to admin sessions so UI reflects live config without manual refresh).

### 30.15 Error Handling
`ERR_INVALID_FEATURE_FLAG_KEY`, `ERR_ENCRYPTION_FAILURE`, `ERR_UNAUTHORIZED_SETTING_SCOPE` (hospital admin attempting a global/system-level setting).

### 30.16–30.17 Audit / Activity Logs
`PROFILE_UPDATED`, `BUSINESS_RULE_CHANGED`, `FEATURE_FLAG_TOGGLED`, `CREDENTIAL_UPDATED` (audit entry records which provider changed, never the credential value itself).

### 30.18 Sequence Flow
Admin updates a business rule → validated → persisted → Redis cache busted → socket broadcast → all dependent modules read the fresh value on next access (cache miss triggers reload) → audit log written synchronously.

### 30.19 State Diagram
Configuration values have no lifecycle state machine; they are simple current-value records with a full history preserved only in the audit log (not a versioned table), since Section 30.5 BR-02 non-retroactivity means only "current value at time of use" matters operationally.

### 30.20 Edge Cases
Discount threshold lowered mid-day while a bill's discount is already `PENDING_APPROVAL` under the old threshold → the pending approval is honored under the rule in effect at its creation time (evaluated at request-time, not re-evaluated retroactively), per BR-02.
Integration credential update fails encryption step → entire update transaction rolled back, previous working credential remains active (no partial/corrupted credential state).

### 30.21 Permission Matrix
| Action | SUPER_ADMIN | HOSPITAL_ADMIN |
|---|---|---|
| Hospital profile | ✅ | ✅ (own) |
| Global business rules | ✅ | ❌ |
| Hospital-scoped business rules | ✅ | ✅ (own) |
| Feature flags | ✅ | ✅ (own hospital scope only) |
| Integration credentials | ✅ | ✅ (own, non-system-wide providers) |

### 30.22 Acceptance Criteria
- GET responses for integration credentials never contain the plaintext secret, only a masked representation.
- A `HOSPITAL_ADMIN` attempting to modify a global (cross-hospital) setting receives `403 ERR_UNAUTHORIZED_SETTING_SCOPE`.
- Settings changes are reflected across the system within the cache TTL window (≤60s) without requiring a service restart.

---

# PART II — CONSOLIDATED DATA ARCHITECTURE

## 31. Consolidated PostgreSQL Schema Summary

All tables use `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `created_at TIMESTAMPTZ DEFAULT now()`, and `deleted_at TIMESTAMPTZ NULL` unless otherwise noted. Foreign keys default to `ON DELETE RESTRICT` except where explicitly noted `CASCADE`/`SET NULL`.

### 31.1 Table Inventory by Domain
| Domain | Tables |
|---|---|
| Identity & Access | `users`, `user_sessions`, `password_reset_tokens`, `login_attempts`, `user_profiles`, `user_invitations`, `roles`, `permissions`, `role_permissions` |
| Org Master Data | `departments`, `wards`, `doctors`, `doctor_availability`, `doctor_leaves` |
| Patient | `patients`, `patient_documents`, `patient_merge_logs` |
| Scheduling & OPD | `appointments`, `opd_visits`, `opd_vitals`, `opd_diagnoses` |
| IPD | `ipd_admissions`, `ipd_rounds`, `ipd_vitals`, `ipd_transfers`, `discharge_summaries`, `beds`, `ipd_waitlist` |
| Ambulance | `ambulance_vehicles`, `ambulance_requests`, `ambulance_trips` |
| Clinical | `prescriptions`, `prescription_items`, `drug_master`, `drug_interactions`, `ai_prescription_suggestions`, `ai_suggestion_feedback` |
| Laboratory | `lab_tests`, `lab_test_parameters`, `lab_orders`, `lab_order_tests`, `lab_results` |
| Pharmacy & Inventory | `pharmacy_dispenses`, `dispense_items`, `pharmacy_returns`, `inventory_items`, `inventory_batches`, `inventory_stock_ledger`, `suppliers`, `purchase_orders`, `purchase_order_items` |
| Finance | `bills`, `bill_items`, `bill_discounts`, `insurance_policies`, `credit_notes`, `payments`, `refunds`, `cash_reconciliation` |
| Reporting | `report_templates`, `report_jobs`, `report_schedules` |
| Notifications | `notification_templates`, `notification_preferences`, `notifications` |
| Chat | `chat_conversations`, `chat_participants`, `patient_chat_conversations` |
| Chatbot | `chatbot_sessions` |
| Platform | `file_uploads`, `audit_export_jobs`, `hospital_profile`, `business_rules`, `feature_flags`, `integration_credentials` |

### 31.2 Critical Indexes
```sql
CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_users_phone ON users(phone) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_patients_uhid ON patients(uhid);
CREATE INDEX idx_patients_phone ON patients(phone);
CREATE INDEX idx_patients_name_trgm ON patients USING gin (name gin_trgm_ops); -- fuzzy search
CREATE UNIQUE INDEX idx_appt_slot ON appointments(doctor_id, appointment_date, slot_start_time) WHERE status <> 'CANCELLED';
CREATE INDEX idx_appt_patient_date ON appointments(patient_id, appointment_date);
CREATE INDEX idx_opd_visits_status ON opd_visits(department_id, status);
CREATE INDEX idx_ipd_admissions_status ON ipd_admissions(status, ward_id);
CREATE UNIQUE INDEX idx_beds_ward_number ON beds(ward_id, bed_number);
CREATE INDEX idx_beds_status ON beds(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_lab_orders_status ON lab_orders(status, patient_id);
CREATE INDEX idx_prescriptions_patient ON prescriptions(patient_id, status);
CREATE INDEX idx_bills_patient_status ON bills(patient_id, status);
CREATE UNIQUE INDEX idx_payments_gateway_txn ON payments(gateway_transaction_id) WHERE gateway_transaction_id IS NOT NULL;
CREATE INDEX idx_inventory_ledger_item ON inventory_stock_ledger(item_id, batch_id, created_at);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, status) WHERE status <> 'READ';
```

### 31.3 Key Relationship Summary (ER Narrative)
- `patients` is the clinical anchor: 1:N to `appointments`, `opd_visits`, `ipd_admissions`, `prescriptions`, `lab_orders`, `bills`.
- `users` is the identity anchor: 1:1 to `doctors` (where role=DOCTOR) and optionally 1:1 to `patients` (patient portal login); 1:N to `user_sessions`.
- `doctors` → `departments` (N:1); `doctors` → `doctor_availability`/`doctor_leaves` (1:N).
- `appointments` → `opd_visits` (1:1, created at check-in).
- `opd_visits`/`ipd_admissions` are the two clinical-episode anchors that `prescriptions`, `lab_orders`, and `bill_items` (via `source_reference_id`) hang off of.
- `ipd_admissions` → `beds`/`wards` (N:1, with `beds.current_admission_id` as the reverse pointer for O(1) occupant lookup).
- `prescriptions` → `pharmacy_dispenses` → `dispense_items` → `inventory_batches` (full medication-to-stock traceability chain).
- `bills` aggregate `bill_items` sourced polymorphically from Consultation/Lab/Pharmacy/Room/Ambulance; `payments` settle against `bills`.

## 32. Consolidated MongoDB Collections

| Collection | Written By | Purpose |
|---|---|---|
| `audit_logs` | All modules | Immutable compliance trail (Section 3.5) |
| `activity_logs` | All modules | User-facing activity feeds |
| `patient_timeline_cache` | Patients, OPD, IPD, Lab, Pharmacy | Denormalized cross-module patient history |
| `ambulance_trip_locations` | Ambulance | High-frequency GPS time-series |
| `ai_prescription_raw_logs` | AI Prescription | Raw LLM I/O for debugging/QA |
| `notification_delivery_logs` | Notifications | Provider delivery receipts |
| `payment_gateway_raw_logs` | Payments | Raw gateway payloads for dispute resolution |
| `chat_messages` | Chat | Internal staff messages |
| `patient_chat_messages` | Patient Chat | Patient-staff messages |
| `chatbot_messages`, `chatbot_feedback` | AI Chatbot | Conversational turns + QA feedback |
| `audit_anomaly_flags` | Audit | Security anomaly detections |
| `bulk_import_reports` | Users | Row-level CSV import results |

MongoDB is used deliberately where: (a) write volume is high and schema is naturally document-shaped (chat, GPS, delivery logs), or (b) append-only immutability is the primary requirement (audit logs) and Postgres's relational overhead adds no value.

## 33. Global Redis Key Namespace Reference
```
session:{userId}:{sessionId}         # refresh token session
otp:{otpId}                          # OTP code + attempts
lockout:{userId}                     # failed login counter
blacklist:{refreshTokenId}           # revoked tokens
doctor:{id}:slots:{date}             # computed available slots
opd:queue:{deptId}:{date}            # sorted set, live queue
lock:bed:{bedId}                     # distributed lock, bed assignment
ward:{id}:census                     # occupancy counters
ambulance:{vehicleId}:location       # latest GPS position
inventory:{itemId}:stock-level       # cached stock aggregate
notifications:unread-count:{userId}  # badge counter
chat:typing:{conversationId}         # typing indicator set
chat:presence:{userId}               # online/offline heartbeat
payment:idempotency:{requestId}      # double-submit guard
settings:business-rules              # cached global config
```

---

# PART III — GLOBAL RBAC MATRIX

## 34. Full Role × Module Permission Matrix
Legend: **C**reate, **R**ead, **U**pdate, **D**elete/Deactivate, **A**pprove/special-action.

| Module | SUPER_ADMIN | HOSPITAL_ADMIN | DOCTOR | NURSE | RECEPTIONIST | LAB_TECH | PHARMACIST | BILLING_STAFF | INVENTORY_MGR | AMB_DISPATCH | AMB_DRIVER | PATIENT |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Authentication | CRUD | CRUD | R(self) | R(self) | R(self) | R(self) | R(self) | R(self) | R(self) | R(self) | R(self) | R(self) |
| Users | CRUD | CRUD | R(self)/U(self) | R(self)/U(self) | R(self)/U(self) | R(self)/U(self) | R(self)/U(self) | R(self)/U(self) | R(self)/U(self) | R(self)/U(self) | R(self)/U(self) | — |
| Roles | CRUD | CU (custom only) | — | — | — | — | — | — | — | — | — | — |
| Departments | CRUD | CRUD | R | R | R | R | R | R | R | R | R | R |
| Doctors | CRUD | CRUD | RU(self) | R | R | R | R | R | R | R | R | R |
| Patients | CRUD+A(merge) | CRUD+A(merge) | RU | RU | CR | R | R | R | — | — | — | RU(self) |
| Appointments | CRUD | CRUD | R(own) | R | CRUD | — | — | — | — | — | — | CRU(self) |
| OPD | CRUD | R | CRUD | CU(vitals) | C(check-in) | — | — | — | — | — | — | R(own) |
| IPD | CRUD+A | CRUD+A | CRU | CU(vitals) | C(admit) | — | — | A(discharge-billing) | — | — | — | R(own) |
| Ward | CRUD | CRUD | R | R | R | — | — | — | — | — | — | — |
| Beds | CRUD | CRUD | R | U(status) | R | — | — | — | R | — | — | — |
| Ambulance | CRUD | CRUD | — | — | C(request) | — | — | — | — | CRUD | RU(own trip) | C(request) |
| Prescription | R | R | CRUD | R | — | — | R | — | — | — | — | R(own) |
| AI Prescription | R(analytics) | R(analytics) | CRUD | — | — | — | — | — | — | — | — | — |
| Laboratory | CRUD | R | C(order)/R | — | — | CRU | — | — | — | — | — | R(own) |
| Pharmacy | R | R | R | — | — | — | CRUD | — | — | — | — | R(own) |
| Inventory | CRUD | CRUD+A(PO approve) | — | — | — | — | R(consume) | — | CRUD | — | — | — |
| Billing | CRUD+A | CRUD+A | — | — | — | — | — | CRUD | — | — | — | R(own) |
| Payments | CRUD+A | CRUD+A | — | — | — | — | — | CRUD | — | — | — | C(self-pay)/R(own) |
| Reports | R(all) | R(hospital) | R(own) | — | — | — | — | R(financial) | R(inventory) | — | — | — |
| Notifications | CRUD(templates) | CRUD(templates,scoped) | R(own)/U(prefs) | R(own)/U(prefs) | R(own)/U(prefs) | R(own)/U(prefs) | R(own)/U(prefs) | R(own)/U(prefs) | R(own)/U(prefs) | R(own)/U(prefs) | R(own)/U(prefs) | R(own)/U(prefs) |
| Chat | R(oversight) | R(oversight) | CRU | CRU | CRU | CRU | CRU | CRU | CRU | CRU | CRU | — |
| Patient Chat | R(all) | R(all) | CRU(assigned) | — | CRU(queue) | — | — | — | — | — | — | CRU(self) |
| AI Chatbot | R(logs) | R(logs) | CRU(staff-bot) | CRU(staff-bot) | CRU(staff-bot) | CRU(staff-bot) | CRU(staff-bot) | CRU(staff-bot) | CRU(staff-bot) | CRU(staff-bot) | CRU(staff-bot) | CRU(patient-bot) |
| Uploads | CRUD | CRUD | CRU(scoped) | CRU(scoped) | CRU(scoped) | CRU(scoped) | CRU(scoped) | CRU(scoped) | CRU(scoped) | CRU(scoped) | CRU(scoped) | CRU(own) |
| Audit | CRUD(view/export only, no edit) | R(hospital) | — | — | — | — | — | — | — | — | — | — |
| Settings | CRUD(global+hospital) | CRUD(hospital scope) | — | — | — | — | — | — | — | — | — | — |

Note: "CRUD" on Audit never includes true edit/delete of log entries (audit logs are immutable by architecture, Section 29.5 BR-01) — it denotes full access to view/search/export tooling only.

---

# PART IV — END-TO-END WORKFLOW SPECIFICATIONS

## 35. Complete OPD Sequence

```
Patient/Reception          Appointments API        OPD API              Doctor UI            Notification/Socket
       |                         |                     |                     |                       |
       |--Book appointment------>|                     |                     |                       |
       |                         |--lock slot, insert->|                     |                       |
       |<--CONFIRMED-------------|                     |                     |                       |--reminder jobs scheduled
       |                         |                     |                     |                       |
  [Visit Day]                    |                     |                     |                       |
       |--Check-in-------------->|--create opd_visit-->|                     |                       |
       |                         |                     |--issue token------->|--queue-updated------->|(waiting room display)
       |--(Nurse) vitals-------------------------------|--VITALS_DONE------->|                       |
       |                                                |                    |<--token-called---------|
       |                                                |<--start-consult----|--IN_CONSULTATION       |
       |                                                |<--diagnosis + notes|                        |
       |                                                |<--(optional) create Rx / Lab Order / IPD referral
       |                                                |<--close visit------|--COMPLETED             |
       |                                                |--billable line item created-------------------------> Billing
```

## 36. Complete IPD Sequence

```
Referral/Direct Admission → IPD API → Bed Module → Ward Census → Clinical Care Loop → Billing → Discharge

1. Admission request (from OPD referral / Emergency / Direct)
2. IPD API acquires Redis lock on target bed
3. Verify bed.status = AVAILABLE; if not, offer ipd_waitlist enrollment
4. Transaction: bed.status = OCCUPIED, bed.current_admission_id = new admission,
   insert ipd_admissions (status=ADMITTED)
5. Release lock; emit socket ipd:admitted + beds:status-changed + wards:census-updated
6. Daily loop while status=IN_TREATMENT:
     - Nurse charts vitals (ipd_vitals) at configured intervals (job-reminded)
     - Doctor adds rounds/progress notes (ipd_rounds)
     - Prescriptions issued as needed → Pharmacy dispenses → MAR updated
     - Lab orders issued as needed → results flow back to chart
     - Running bill accumulates bill_items (source=ROOM_CHARGE daily + all above)
     - Optional ward/bed transfer (ipd_transfers), does not close admission
7. Attending doctor initiates discharge planning: status → DISCHARGE_PLANNED
8. Billing finalizes running bill; blocks discharge if status=PENDING (unless admin override)
9. Doctor signs discharge_summary (diagnosis, treatment summary, follow-up)
10. PATCH /discharge: status → DISCHARGED, discharged_at set
11. Bed transaction: status = CLEANING (30-min delayed job) → AVAILABLE
12. If ipd_waitlist has a compatible pending entry, auto-assign-waitlist job notifies admin
13. Socket: ipd:discharged, beds:status-changed, wards:census-updated
```

## 37. Payment / Billing Workflow

```
Source Modules (OPD/IPD/Lab/Pharmacy/Ambulance)
        |
        v
  bill_items (DRAFT, auto-created per billable event)
        |
        v
Billing Staff consolidates → bills (status=DRAFT)
        |
        |--apply discount (>threshold → bill_discounts PENDING → HOSPITAL_ADMIN approval)
        |--apply insurance (validate against insurance_policies.coverage_limit)
        v
  Finalize → status=FINALIZED, invoice_no generated, invoice PDF job enqueued
        |
        v
  Payment collection:
     Path A (in-person): POST /payments (cash/card/UPI recorded manually) → status recomputed
     Path B (online): POST /payments/initiate-gateway → patient redirected to gateway →
                       gateway webhook → signature verify → idempotency check (gateway_transaction_id) →
                       payments.status=SUCCESS → recompute bill status
        |
        v
  bills.status: PARTIALLY_PAID (sum(payments) < total) or PAID (sum == total)
        |
        v
  Receipt generated (PDF) → patient notified
        |
  [If correction needed post-finalization] → credit_notes issued against original bill, never edited in place
```

## 38. Laboratory Workflow

```
Doctor (OPD/IPD) --order tests--> lab_orders (ORDERED) --notify--> Lab Technician
                                                                        |
                                                              collect-sample (barcode)
                                                                        |
                                                              status=SAMPLE_COLLECTED
                                                                        |
                                                              enter results (lab_results)
                                                                        |
                                                    auto-flag abnormal vs reference_range
                                                                        |
                                                 [critical value?] --Yes--> critical-value-alert job
                                                                              (SMS/push to doctor within 2 min)
                                                                        |
                                                              status=RESULTS_ENTERED
                                                                        |
                                                    Pathologist (different user, BR enforced) verifies
                                                                        |
                                                              status=VERIFIED
                                                                        |
                                                    report-pdf-generate job → S3 → status=REPORT_RELEASED
                                                                        |
                                                    Patient + Doctor notified; report visible in portal
```

## 39. Pharmacy Workflow

```
Prescription (ACTIVE) --notify-pharmacy job--> Pharmacist queue (Redis sorted set)
                                                          |
                                              Pharmacist reviews prescription_items
                                                          |
                                        FEFO batch suggestion (earliest expiry first)
                                                          |
                              [Sufficient stock?] --No--> Partial dispense (remainder PENDING)
                                        |Yes
                                        v
                    DB Transaction: lock inventory_stock (FOR UPDATE) → deduct →
                    insert pharmacy_dispenses + dispense_items → commit
                                        |
                              prescriptions.status = DISPENSED / PARTIALLY_DISPENSED
                                        |
                              notify-billing job → bill_items (source=PHARMACY)
                                        |
                              low-stock-check-post-dispense → Inventory alert if threshold crossed
                                        |
                              Patient notified: "ready for pickup"
```

## 40. Ambulance Workflow

```
Requester (Reception/Staff/Patient emergency) --raise request--> ambulance_requests (PENDING)
                                                                       |
                                              Dispatcher queue (Redis sorted set by urgency+time)
                                                                       |
                                              Dispatcher assigns vehicle+driver (lock vehicle)
                                                                       |
                                    ambulance_trips created; request.status=ASSIGNED
                                                                       |
                        Driver app: EN_ROUTE_TO_PICKUP → ARRIVED → TRANSPORTING → ARRIVED_HOSPITAL → COMPLETED
                                    (each transition: socket broadcast + GPS pings to Mongo/Redis)
                                                                       |
                                    Reception alerted at ARRIVED_HOSPITAL to prep emergency bay
                                                                       |
                                    On COMPLETED: vehicle.status=AVAILABLE, billable line item created
```

## 41. Real-Time Socket.IO Workflow (Architecture Pattern)

```
Client connects: io.connect(URL, { auth: { token: accessToken } })
        |
Server middleware: verify JWT on handshake → attach userId/role to socket
        |
Server joins socket to relevant rooms based on role/context:
   - `user:{userId}`               (personal notifications)
   - `dept-queue:{departmentId}`   (OPD queue display, for reception/nurse/doctor)
   - `ward:{wardId}`               (bed/census updates)
   - `conversation:{conversationId}` (chat rooms, joined on-demand)
   - `ambulance-dispatch`          (dispatcher role only)
        |
Horizontal scaling: Socket.IO Redis adapter (pub/sub) ensures events emitted from any
API server instance reach clients connected to any other instance.
        |
Standard event-emission pattern used by every module (Appointments, OPD, IPD, Beds,
Lab, Pharmacy, Billing, Ambulance, Chat, Notifications) per their individual
"Socket Events" sections — server emits to the relevant room immediately after the
triggering DB transaction commits (never before, to avoid phantom-event races).
        |
Client-side: on relevant event, invalidate/refetch the corresponding React Query cache
key (recommended pattern) rather than blindly trusting payload freshness for
complex aggregates (e.g., census).
```

## 42. AI Prescription Workflow (Detailed)

```
Doctor (OPD/IPD context) → enters/selects diagnosis + symptoms
        |
POST /ai-prescriptions/suggest
        |
Server assembles context server-side (NOT client-supplied, to prevent prompt injection
of clinical facts): diagnosis text, patient.allergies, patient's currently ACTIVE
prescriptions, latest vitals
        |
Call LLM (Claude, structured-JSON output mode) with system prompt constraining:
   - output schema (drugId must map to drug_master)
   - exclusion of controlled substances
   - requirement to include rationale + confidence per item
        |
Server-side post-validation (never trust raw LLM output as final):
   1. Every suggested drugId exists in drug_master
   2. No suggested drug is in the controlled-substance-excluded list
   3. Run the same drug_interactions + allergy check as manual Prescription module
   4. Filter out any suggestion below configured confidence floor
        |
Persist ai_prescription_suggestions (status=PENDING_REVIEW) → return to doctor UI
with mandatory "AI-generated, clinical review required" disclaimer
        |
Doctor reviews each line item:
   ACCEPT (as-is) ──────┐
   EDIT then ACCEPT ────┼──> Re-run interaction/allergy check AT ACCEPT-TIME
   REJECT (w/ reason) ──┘    (patient data may have changed since generation)
        |
   [Accept/Edited-Accept path]
        |
Create real prescriptions + prescription_items row (doctor is system-of-record author)
        |
ai_prescription_suggestions.resulting_prescription_id set; status updated
        |
ai_suggestion_feedback logged (disposition, edits, rejection reason) for model QA
        |
Standard Prescription workflow (Section 16) takes over from here → Pharmacy, Billing
```

## 43. AI Chatbot Workflow (Detailed)

```
User (Patient or Staff) opens chatbot → POST /chatbot/conversations (session created)
        |
User sends message → POST .../messages
        |
Server: deterministic red-flag keyword pre-filter (BEFORE any LLM call)
        |
   [Red flag detected] ──> Return hard-coded emergency-guidance response immediately,
                            bypass LLM for this turn, log SESSION flagged for review
        |
   [No red flag] ──> Assemble role-scoped context:
                        - Patient bot: own appointment/prescription history (read-only tools),
                          booking tool schema (checkDoctorSlots, createAppointmentDraft)
                        - Staff bot: RAG retrieval over internal knowledge base scoped to
                          department/role
        |
Call LLM with streaming (SSE) + tool schema
        |
   [LLM proposes a tool call, e.g., createAppointmentDraft] ──>
        Return a CONFIRMATION PROMPT to client (never auto-execute side-effecting actions)
        |
        User confirms ──> Server executes the REAL module API (e.g., Appointments
                           POST /appointments) using the actual authorization context
                           of the logged-in user (not an elevated bot identity)
        |
        [Execution result] ──> success: standard Appointments notifications fire
                                failure (e.g., ERR_SLOT_TAKEN): chatbot surfaces
                                alternative slots conversationally, no silent failure
        |
Persist full turn (user message, assistant response, tool calls/results) to
chatbot_messages (Mongo) → session context cache updated in Redis
```

---

# PART V — NON-FUNCTIONAL REQUIREMENTS & IMPLEMENTATION GUIDANCE

## 44. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Availability | 99.9% uptime target for core clinical modules (Auth, Patients, OPD, IPD, Beds) |
| Performance | p95 API latency < 500ms for read endpoints, < 1s for write endpoints under normal load |
| Scalability | Stateless API layer horizontally scalable behind a load balancer; Socket.IO scaled via Redis adapter |
| Security | TLS 1.2+ everywhere; encryption at rest for PII fields (patients, documents); JWT short-lived + refresh rotation |
| Data Residency | Configurable region pinning for hospital data (relevant for regulated deployments) |
| Backup/DR | Postgres point-in-time recovery (PITR), MongoDB replica set with daily snapshots, S3 versioning enabled |
| Compliance | Full audit trail (Section 29), role-based least-privilege access, data-retention policies per record type |
| Observability | Structured logging with `X-Request-Id` correlation across services; metrics on job queue depth/latency |

## 45. Suggested Monorepo / Service Boundaries
While this FRD is written module-by-module for specification clarity, a pragmatic implementation groups modules into deployable services to balance operational simplicity with scalability:
- **Core API Service**: Authentication, Users, Roles, Departments, Doctors, Patients, Settings, Audit, Uploads
- **Clinical Service**: Appointments, OPD, IPD, Ward, Beds, Prescription, AI Prescription, Laboratory
- **Pharmacy/Inventory Service**: Pharmacy, Inventory
- **Finance Service**: Billing, Payments
- **Logistics Service**: Ambulance
- **Engagement Service**: Notifications, Chat, Patient Chat, AI Chatbot, Reports

Each can start as modules within a single Express monolith (recommended for MVP) with clear internal module boundaries (own routes/controllers/services/repositories folder per module), enabling later extraction into separate deployables without a rewrite, since the API contracts above are already service-boundary-clean.

## 46. Implementation Sequencing Recommendation
1. **Foundation**: Authentication, Users, Roles, Settings, Departments, Audit/Notifications infrastructure
2. **Master Data & Identity**: Doctors, Patients, Wards, Beds, Inventory item master
3. **Core Clinical Loop**: Appointments → OPD → Prescription → Laboratory → Pharmacy
4. **Inpatient**: IPD (depends on Beds/Ward being solid)
5. **Finance**: Billing → Payments (depends on all clinical modules producing billable events)
6. **Logistics & Engagement**: Ambulance, Chat, Patient Chat
7. **AI Layer**: AI Prescription, AI Chatbot (built last, layered on top of stable Prescription/Appointments APIs since they call into those same module APIs for execution)
8. **Reporting & Analytics**: Reports (aggregates across all of the above, naturally last)

## 47. Glossary
| Term | Definition |
|---|---|
| UHID | Unique Health ID — permanent patient identifier |
| OPD | Outpatient Department |
| IPD | Inpatient Department |
| MAR | Medication Administration Record |
| FEFO | First-Expiry-First-Out (inventory consumption policy) |
| RBAC | Role-Based Access Control |
| TAT | Turnaround Time (lab reporting) |
| GRN | Goods Receipt Note (inventory) |
| SLA | Service Level Agreement |

---

*End of Functional Requirements Document. This specification is implementation-ready: backend engineers may begin Prisma schema authoring directly from Section 31, and API implementation directly from each module's Section .7 (API List) using the shared conventions defined in Section 3.*
