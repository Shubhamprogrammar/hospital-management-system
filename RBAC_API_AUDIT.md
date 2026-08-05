# RBAC & API Integration Audit

Audit date: 2026-08-04. Scope: all 28 backend modules under `server/src/modules/*`
against their frontend integration under `client/src/modules/*` and
`client/src/shared/services/*`, plus role-based visibility
(`client/src/shared/components/layout/nav-items.ts`,
`client/src/shared/components/layout/Sidebar.tsx`, `server/src/core/middleware/authorize.ts`).

Status legend: 🔴 fix first (security/correctness) · 🟡 real gap, lower risk · ⚪ informational.

---

## 🔴 1. Role hierarchy lets lateral roles access each other's endpoints

**Where:**
- Backend: [`server/src/core/middleware/authorize.ts:21-51`](server/src/core/middleware/authorize.ts)
- Frontend: [`client/src/shared/types/index.ts:43-46`](client/src/shared/types/index.ts) (`hasRoleAtLeast`)
- Levels: [`server/src/config/auth.ts:36-50`](server/src/config/auth.ts) (`ROLE_HIERARCHY`)

**Bug:** Both check `userLevel >= MIN(requiredLevels)` instead of "is the user's role
actually in the allowed set (or an explicit admin override)". Because several unrelated
department roles share the same hierarchy level —

```
LAB_TECHNICIAN = 40, PHARMACIST = 40, BILLING_STAFF = 40,
INVENTORY_MANAGER = 40, ACCOUNTANT = 40
NURSE = 50, PATHOLOGIST = 55, DOCTOR = 60   (all > 40)
```

— any route written as `authorize("SUPER_ADMIN", "PHARMACIST")` actually accepts
**every role at level ≥ 40**, i.e. NURSE, DOCTOR, PATHOLOGIST, BILLING_STAFF,
ACCOUNTANT, LAB_TECHNICIAN, INVENTORY_MANAGER — not just pharmacists.

**Spec confirms this is wrong:** `HMS_FRD.md` §19.3 — *"PHARMACIST dispenses;
DOCTOR/NURSE view dispense status; BILLING_STAFF links to billing"* — dispensing
should be pharmacist-only, but currently isn't.

**Concretely broken today (verified against route files):**
| Route | Declared roles | Actually reachable by (floor logic) |
|---|---|---|
| `POST /pharmacy/dispenses` [`pharmacy.routes.ts:19`](server/src/modules/pharmacy/pharmacy.routes.ts#L19) | SUPER_ADMIN, PHARMACIST | + NURSE, DOCTOR, PATHOLOGIST, BILLING_STAFF, ACCOUNTANT, LAB_TECHNICIAN, INVENTORY_MANAGER |
| `POST /pharmacy/returns` [`pharmacy.routes.ts:26`](server/src/modules/pharmacy/pharmacy.routes.ts#L26) | SUPER_ADMIN, PHARMACIST | same as above |
| `POST /inventory/items` etc. [`inventory.routes.ts:28-57`](server/src/modules/inventory/inventory.routes.ts) | SUPER_ADMIN, HOSPITAL_ADMIN, INVENTORY_MANAGER | + NURSE, DOCTOR, PATHOLOGIST, BILLING_STAFF, ACCOUNTANT, LAB_TECHNICIAN, PHARMACIST |
| Billing writes [`billing.routes.ts:22-64`](server/src/modules/billing/billing.routes.ts) | ...BILLING_STAFF | + NURSE, DOCTOR, PATHOLOGIST, ACCOUNTANT, LAB_TECHNICIAN, INVENTORY_MANAGER, PHARMACIST |
| Payments writes [`payments.routes.ts:20-38`](server/src/modules/payments/payments.routes.ts) | ...BILLING_STAFF | same as billing |
| Ambulance dispatch [`ambulance.routes.ts:21-51`](server/src/modules/ambulance/ambulance.routes.ts) | ...AMBULANCE_DISPATCHER (35) | + NURSE, DOCTOR, PATHOLOGIST, BILLING_STAFF, ACCOUNTANT, LAB_TECHNICIAN, INVENTORY_MANAGER, PHARMACIST |
| Lab result entry [`laboratory.routes.ts:38`](server/src/modules/laboratory/laboratory.routes.ts#L38) (PATHOLOGIST, LAB_TECHNICIAN) | floor 40 | + NURSE, DOCTOR, BILLING_STAFF, ACCOUNTANT, INVENTORY_MANAGER, PHARMACIST |

Same numeric floors drive `nav-items.ts` `minRoles`, so the sidebar over-exposes
Pharmacy/Inventory/Billing/Payments/Ambulance/Reports links to roles that were never
meant to see them, for the same reason.

**Fix direction:** change `authorize()` and `hasRoleAtLeast()` to do a direct
set-membership check against `allowedRoles` (`allowedRoles.includes(userRole)`),
with `SUPER_ADMIN` (and optionally `HOSPITAL_ADMIN`) as an explicit, separate
always-allowed override rather than "top of a shared numeric scale". Keep
`ROLE_HIERARCHY` only for genuine seniority checks like `hasRoleAtLeast(role, ROLES.DOCTOR)`
(single-role floor checks, used e.g. in `OpdPage.tsx`) — those are fine as-is because
they intentionally mean "this role or anything more senior in the same track."

---

## 🔴 2. Chat nav item has no role restriction — PATIENT sees it, backend blocks it

- [`client/src/shared/components/layout/nav-items.ts:161`](client/src/shared/components/layout/nav-items.ts#L161) — Chat is the only `NavItem` with no `minRoles` (every sibling item has one).
- [`server/src/modules/chat/chat.routes.ts:17`](server/src/modules/chat/chat.routes.ts#L17) — `POST /conversations` explicitly excludes `PATIENT` (comment: "FRD 25.3 — not exposed to PATIENT").

Result: a PATIENT sees the Chat link and the "New conversation" button
([`ChatPage.tsx:83-85`](client/src/modules/chat/page/ChatPage.tsx#L83-L85)), and only
gets turned away by a 403 on submit.

**Fix:** add `minRoles` to the Chat nav item (staff roles only — mirror the backend's
allow-list at `chat.routes.ts:17`), and/or gate the "New conversation" button in
`ChatPage.tsx` the same way `PharmacyPage.tsx` gates "Start dispense".

---

## 🟡 3. Sidebar hiding a link ≠ the page being inaccessible

- [`client/src/proxy.ts`](client/src/proxy.ts) (Next.js middleware) and
  [`client/src/app/(portal)/layout.tsx`](client/src/app/(portal)/layout.tsx) only check
  **authentication** (valid session), never role.
- So any signed-in user who types `/users`, `/billing`, `/roles`, etc. directly into
  the URL bar still gets the page shell. Underlying data stays protected (backend
  403s), but the page itself renders.
- Only two pages add their own role-based UI logic beyond the sidebar:
  - [`OpdPage.tsx:37-39`](client/src/modules/opd/page/OpdPage.tsx#L37-L39) (`isDoctor`/`isNurse` gate vitals/consultation/diagnosis/close actions)
  - [`PharmacyPage.tsx:15-22`](client/src/modules/pharmacy/page/PharmacyPage.tsx#L15-L22) (`isPharmacist` gates "Start dispense")
- Every other module's page (departments, doctors, patients, appointments, ipd, wards,
  beds, ambulance, prescriptions, laboratory, inventory, billing, payments, reports,
  notifications, audit, settings, roles, users) has **zero** in-page role checks —
  action buttons are gated only by record status (e.g. `isActive`, order `status`),
  never by viewer role.

**Fix direction (optional, lower priority than #1/#2):** add a lightweight
`RequireRole`/route-guard wrapper in `(portal)/layout.tsx` or per-page, driven by the
same `minRoles` data already in `nav-items.ts`, so direct navigation to an
unauthorized route redirects/shows "access denied" instead of rendering the shell.

---

## 🟡 4. Backend endpoints with no frontend caller at all (dead API surface)

No broken frontend→backend path mismatches were found anywhere (every service call
target matches a real route). But a large amount of backend work has no UI:

### Entirely unintegrated modules
- **`aiPrescriptions`** — all 5 endpoints ([`aiPrescriptions.routes.ts`](server/src/modules/aiPrescriptions/aiPrescriptions.routes.ts), DOCTOR-only) have service wrappers in `clinical.service.ts:71-88` but **no page, no app route, no nav entry** — AI-assisted prescribing is unreachable from the UI.
- **`patientChat`** — all 6 endpoints dead, no `client/src/modules/patientChat/` directory exists.
- **`chatbot`** — all 4 endpoints dead, no chatbot UI anywhere.
- **`uploads`** — all 4 generic upload endpoints dead (avatar upload uses a separate raw `fetch` in `users.service.ts:51-56`, which is itself also unused).

### Partially integrated modules (endpoint exists, defined in service layer, never called)
| Module | Dead endpoints |
|---|---|
| departments | `GET /:id`, `PATCH /:id`, `GET /:id/doctors` |
| doctors | `GET /:id`, `POST /` (create), `DELETE /:id`, `PATCH /:id`, `POST /:id/leave`, `GET /:id/slots` — **no create/edit/deactivate doctor UI at all**, only "Availability" |
| patients | `GET /me`, `PATCH /:id` (no edit UI), `POST /:id/documents`, `POST /merge` |
| appointments | `GET /queue` (module has its own queue, unused — frontend only calls OPD's) |
| opd | `GET /visits/:id`, `POST /visits/:id/refer-ipd` (no "Refer to IPD" button despite backend support) |
| ipd | `GET /admissions/:id`, `POST /admissions/:id/rounds`, `POST /admissions/:id/vitals`, `POST /admissions/:id/transfer`, `GET /admissions/:id/discharge-summary` — only Admit/Discharge wired |
| wards | `GET /:id`, `PATCH /:id`, `GET /:id/census` |
| beds | `GET /:id`, `DELETE /:id` |
| ambulance | `PATCH /trips/:id/status`, `GET /trips/:id/track` — no driver trip-update or live-tracking UI |
| prescriptions | `GET /:id`, `GET /:id/pdf`, `POST /:id/renew`, `POST /interactions-check` |
| laboratory | `PATCH /orders/:id/results` — **no UI for a lab tech to enter results**, so `RESULTS_ENTERED`/`VERIFIED` states are unreachable through the app |
| pharmacy | `GET /dispenses/:id`, `POST /dispenses/:id/substitute`, `POST /returns`, `GET /batches/suggest`; also `createDispense` is always called with `items: []` — line items never populated |
| inventory | `POST /batches`, `POST /adjustments`, suppliers (list/create), purchase-orders (list/create/receive) — 7 of 11 endpoints, no supplier or PO workflow UI |
| billing | `GET /bills/:id`, `POST /bills/:id/discount/approve`, `PATCH /bills/:id/insurance`, `POST /bills/:id/credit-note`, `POST /insurance-policies` |
| payments | `POST /initiate-gateway`, `POST /:id/refund`, `GET/POST /reconciliation` (`/webhook` correctly has no caller — gateway callback) |
| reports | `GET /jobs/:id`, `POST /schedule`, `GET /schedule` |
| notifications | `GET/PATCH /preferences`, `GET/POST /templates` |
| chat | `PATCH /messages/:id` (edit), `POST /conversations/:id/read` (mark read) |
| audit | `GET /logs/:entityType/:entityId` (entity drill-down), `POST /export` |
| settings | `GET /integrations`, `PUT /integrations/:provider` |
| roles | `GET /:id`, `PATCH /:id` (no per-role detail/edit view) |
| users | `GET /:id`, `PATCH /:id` (no edit-user UI), `POST /:id/avatar`, `POST /bulk-import`; also `users.service.ts:65-79`'s `listAuthUsers`/`createAuthUser`/`listMySessions`/`revokeSession` (targets `/auth/*`, separate from `/users/*`) are defined but unused too |

---

## Priority order for fixes

1. **#1 — role-hierarchy floor bug in `authorize()` / `hasRoleAtLeast()`.** Real
   security impact: cross-department write access (e.g. nurses dispensing medication,
   lab techs creating invoices). Fix the two functions once; it propagates correctly
   to both backend enforcement and frontend nav visibility.
2. **#2 — Chat nav `minRoles`.** One-line fix, closes a real (if minor) leak of a
   button that always 403s for patients.
3. **#3 — page-level route guard.** Nice-to-have hardening; no data is actually
   exposed today, just page shells.
4. **#4 — dead endpoints.** Product decision, not a bug: either build the missing UI
   (AI prescriptions, chatbot, patient chat, uploads, supplier/PO workflow, lab
   results entry are the highest-value gaps) or remove the unused backend/service
   code if those features are out of scope for now.
