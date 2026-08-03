# Product Requirements Document
# Enterprise Hospital Management System (HMS)

**Document Type:** Product Requirements Document (PRD)
**Version:** 1.0
**Status:** Draft for Development Sign-off
**Classification:** Internal / Confidential
**Prepared For:** Engineering, Design, QA, DevOps, and Clinical Stakeholders

---

## Table of Contents

1. Executive Summary
2. Objectives
3. Business Goals
4. Scope
5. Stakeholders
6. User Personas
7. User Journey
8. Complete Module Description
9. Detailed Role Description
10. OPD Workflow
11. IPD Workflow
12. Business Rules
13. Functional Overview
14. Non-Functional Requirements
15. Security
16. Scalability
17. AI Features
18. Risks
19. Assumptions
20. Success Metrics
21. Future Scope

---

## 1. Executive Summary

The Enterprise Hospital Management System (HMS) is a full-stack, multi-tenant-ready digital platform designed to unify and automate the clinical, administrative, and financial operations of a multi-specialty hospital. The system replaces fragmented paper-based and siloed digital processes with a single, real-time, role-driven platform covering the complete patient lifecycle — from appointment booking through OPD/IPD care, diagnostics, pharmacy, billing, and discharge.

The platform is built on a modern web stack (Next.js frontend, Node.js/Express backend, PostgreSQL as the system of record, MongoDB for conversational data, Redis for caching, BullMQ for asynchronous processing, and Socket.IO for real-time updates). It introduces AI-assisted clinical support (an AI Prescription Assistant) and an AI-powered patient-facing chatbot, positioning the hospital to deliver faster, safer, and more transparent care.

This document defines the complete product scope, workflows, roles, business rules, and non-functional requirements required for engineering teams to begin implementation without further clarification on core behavior.

---

## 2. Objectives

- Digitize and unify OPD and IPD operations across all hospital departments on a single platform.
- Provide each of the 10 user roles a purpose-built, permission-scoped interface.
- Reduce patient wait times through structured appointment booking, real-time queueing, and doctor availability visibility.
- Enable real-time visibility of patient status across Reception, Nursing, Doctors, Lab, Pharmacy, and Billing.
- Introduce AI-assisted prescription drafting to reduce doctor documentation time and reduce prescription errors.
- Provide patients a self-service AI chatbot for FAQs, appointment status, and basic triage guidance.
- Maintain a complete, immutable audit trail of all clinical and financial actions for compliance and dispute resolution.
- Support both cash and online payment collection at every revenue point (consultation, lab, pharmacy, IPD billing).
- Build a system architecture that scales horizontally and supports future multi-hospital/multi-branch deployment.

---

## 3. Business Goals

| Goal | Description | Primary Metric |
|---|---|---|
| Operational Efficiency | Reduce average patient OPD cycle time (check-in to discharge) | Avg. cycle time (minutes) |
| Revenue Assurance | Eliminate revenue leakage from untracked services | % services invoiced vs. delivered |
| Clinical Safety | Reduce prescription and medication errors | Error/incident rate |
| Staff Productivity | Reduce administrative overhead per staff member | Tasks/hour per role |
| Patient Experience | Improve appointment transparency and communication | Patient satisfaction (CSAT) |
| Compliance Readiness | Maintain audit-ready records for regulatory review | Audit findings per cycle |
| Digital Adoption | Drive patient self-service via portal/app and chatbot | % patients using self-service |

---

## 4. Scope

### 4.1 In Scope
- Web application (responsive) for all 10 roles.
- OPD and IPD end-to-end workflows.
- Ward, bed, and ambulance management.
- Pharmacy and laboratory operational modules with inventory.
- Billing and payments (cash + online) across all revenue points.
- AI Prescription Assistant (doctor-facing, suggestion-only, not autonomous prescribing).
- AI Chatbot (patient-facing, informational and triage-guidance only).
- Internal real-time staff chat and patient notifications.
- Reporting and analytics dashboards per role.
- Audit logging of all state-changing actions.
- File upload/storage (documents, reports, prescriptions, images) via AWS S3.

### 4.2 Out of Scope (Phase 1)
- Native mobile applications (iOS/Android) — web-responsive only in Phase 1.
- Insurance claims processing and TPA integrations.
- Multi-hospital/multi-branch tenancy (architected for, not delivered, in Phase 1).
- Telemedicine/video consultation.
- HR/Payroll and staff attendance management.
- Operation Theatre (OT) scheduling module (referenced only as a ward-boy transfer destination).
- Integration with national health ID systems (e.g., ABHA) — reserved for Future Scope.

---

## 5. Stakeholders

| Stakeholder | Interest |
|---|---|
| Hospital Owner/Board | ROI, compliance, patient trust, revenue growth |
| Hospital Administrator | Operational control, staff accountability, reporting |
| Medical Director/Doctors | Clinical accuracy, workflow efficiency, patient safety |
| Nursing Staff | Ease of vitals/notes entry, ward visibility |
| Finance/Accounts Team | Accurate billing, revenue reconciliation |
| Pharmacy & Lab Departments | Inventory accuracy, order-to-fulfillment tracking |
| Patients | Transparency, convenience, communication |
| IT/Engineering Team | Maintainability, scalability, security |
| Compliance/Legal | Data protection, audit trail, regulatory alignment |
| Product/Project Sponsor | On-time, on-budget delivery aligned to business goals |

---

## 6. User Personas

**1. Dr. Ananya Rao — Consulting Physician (Doctor)**
Sees 30–40 patients daily across OPD and ward rounds. Needs fast access to patient history, an efficient way to write prescriptions, and lab results without navigating multiple screens. Time-constrained; values AI-assisted drafting that she can review and edit rather than blindly trust.

**2. Ramesh Iyer — Front Desk Receptionist**
Manages a high-volume walk-in and phone-booking queue. Needs a simple, fast interface to register patients, check doctor availability, and manage a live queue without training overhead.

**3. Sunita Verma — Staff Nurse, General Ward**
Responsible for vitals recording and nursing notes for 15–20 admitted patients per shift. Needs a mobile-friendly, low-friction interface usable at bedside.

**4. Admin — Hospital Administrator**
Owns system configuration, staff onboarding, department setup, and oversight reporting. Needs full visibility and override capability, plus audit logs for governance.

**5. Priya Sharma — Patient**
A working professional booking an OPD appointment for a parent. Wants a simple signup, clear appointment status, digital prescriptions/reports, and online payment — with a chatbot for quick questions instead of calling the hospital.

---

## 7. User Journey

### 7.1 Patient Journey (OPD, First-Time User)
1. Discovers hospital portal → Signs up (Email/Password or Google OAuth).
2. Logs in → Lands on Patient Dashboard.
3. Books appointment via structured form (disease, preferred date/time, location, demographics).
4. Receives real-time status notification once Receptionist confirms slot with assigned doctor.
5. Receives reminder notification before appointment.
6. Checks in at hospital (or is checked in by Receptionist).
7. Consults doctor; prescription and any lab orders are generated.
8. Tracks lab report and prescription status in real time via dashboard.
9. Collects medicines from Pharmacy (physically) — status reflected digitally.
10. Makes payment (online via portal or cash at counter) — invoice generated automatically.
11. Downloads prescription, report, and invoice as needed.
12. Optionally uses chatbot for any follow-up questions.

### 7.2 Staff Journey (Doctor, Daily Use)
1. Logs in (staff-created credentials only) → Doctor Dashboard.
2. Views today's schedule and assigned patient queue (OPD + ward rounds).
3. Opens patient record → reviews history, vitals, prior prescriptions.
4. Conducts consultation → adds diagnosis/notes.
5. Uses AI Prescription Assistant to draft prescription → reviews, edits, finalizes, signs off.
6. Orders lab tests if required → tracks report arrival in real time.
7. Reviews lab report → updates diagnosis/treatment plan if needed.
8. Prescription and orders propagate automatically to Nursing, Pharmacy, and Billing.
9. Manages leave requests and schedule via profile settings.

---

## 8. Complete Module Description

### 8.1 Authentication
Handles identity verification for all users. Supports Email+Password and Google OAuth for patients; Email+Password (Admin-provisioned) for staff. Includes session management (JWT access + refresh tokens), password reset, and account lockout after repeated failed attempts. Staff self-registration is explicitly disallowed at the API level, not just the UI level.

### 8.2 User Management
Central registry of all system users (staff and patients). Admin can create, edit, deactivate, and reassign staff accounts. Includes profile management, contact details, department/role assignment, and status (Active/Inactive/Suspended).

### 8.3 Role Management
Defines the RBAC (Role-Based Access Control) matrix. Admin can view role-permission mappings; in Phase 1, the 10 roles are system-defined (not admin-customizable) to reduce implementation risk, with custom role creation reserved for Future Scope.

### 8.4 Department Management
Admin configures hospital departments (e.g., Cardiology, Orthopedics, General Medicine), each linked to doctors, wards, and lab test categories.

### 8.5 Doctor Management
Manages doctor profiles: specialization, department, qualifications, consultation fee, weekly availability/schedule, leave calendar, and OPD/IPD assignment status.

### 8.6 Patient Management
Central patient registry including demographics, medical history, visit history (OPD + IPD), allergies, and linked documents. Supports both self-registered (patient portal) and receptionist-registered (walk-in) patients, with deduplication by mobile number.

### 8.7 Appointment Management
Handles the full appointment lifecycle: request → confirmation → reschedule → cancellation → check-in → completion. Includes doctor-availability checking and conflict prevention.

### 8.8 OPD Management
Coordinates the outpatient visit lifecycle: check-in, queueing, consultation room assignment, consultation completion, and hand-off to lab/pharmacy/billing as applicable.

### 8.9 IPD Management
Coordinates the inpatient admission lifecycle: admission request, doctor/ward/bed assignment, daily rounds, treatment tracking, and discharge planning.

### 8.10 Ward & Bed Management
Real-time inventory of wards (General, Emergency, ICU) and beds within each ward, including occupancy status (Available/Occupied/Reserved/Maintenance) and bed-level patient assignment.

### 8.11 Ambulance Management
Manages ambulance fleet, driver assignment, trip requests (emergency and scheduled), live trip status, and trip history — linked optionally to IPD admission.

### 8.12 Prescription Management
Digital prescription creation, versioning, and history. Prescriptions are structured (medicine, dosage, frequency, duration, instructions) rather than free text, enabling downstream pharmacy automation.

### 8.13 AI Prescription Assistant
An AI-assisted drafting tool that suggests medicines, dosages, and instructions based on diagnosis, patient history, and known allergies/interactions. Operates strictly in **suggest-and-review** mode — every AI-generated prescription requires explicit doctor review and digital sign-off before it becomes valid. See Section 17 for detail.

### 8.14 Laboratory Management
Manages test catalog, test orders (from doctors), sample collection tracking, result upload (file + structured values where applicable), and report delivery to doctor and patient.

### 8.15 Pharmacy Management
Manages medicine issuance against prescriptions, stock deduction, batch/expiry-aware dispensing, and pharmacy point-of-sale invoicing for walk-in medicine purchases.

### 8.16 Inventory Management
Tracks stock for both pharmacy (medicines) and lab (consumables/reagents), including supplier records, batch numbers, expiry alerts, and reorder-level notifications.

### 8.17 Billing
Generates and consolidates invoices across consultation, lab, pharmacy, and IPD room/service charges. Supports itemized, partial, and final invoices, with Admin override capability for corrections.

### 8.18 Payments
Supports Cash and Online payment modes at every collection point (Reception for consultation, Lab counter for diagnostics, Pharmacy for medicines, Accounts for IPD). Tracks payment status (Pending/Paid/Partially Paid/Refunded) with real-time status sync to the patient dashboard.

### 8.19 Reports
Role-specific dashboards and exportable reports: revenue reports, department-wise footfall, doctor performance, inventory consumption, occupancy rates, and audit summaries.

### 8.20 Notifications
Multi-channel (in-app + email, SMS reserved for Future Scope) notification engine for appointment confirmations, reminders, report-ready alerts, payment receipts, and admin broadcasts. Delivered in real time via Socket.IO where the user is active, and queued via BullMQ for reliable delivery otherwise.

### 8.21 Internal Chat
Real-time, role-aware messaging between staff (e.g., Doctor↔Nurse, Doctor↔Lab) for care coordination, built on Socket.IO with MongoDB as the message store.

### 8.22 Patient Chatbot
AI-powered, patient-facing conversational assistant for FAQs, appointment status lookup, and general triage-style guidance (with clear disclaimers that it does not replace clinical consultation). Chat history stored in MongoDB.

### 8.23 File Upload
Centralized, S3-backed file handling for lab reports, prescriptions, patient documents (ID proof, insurance), and profile images, with access-controlled signed URLs.

### 8.24 Audit Logs
Immutable, append-only log of all state-changing actions across the system (who did what, when, from where), queryable by Admin for compliance and dispute investigation.

### 8.25 Settings
System-wide configuration: department/medicine/lab-test catalogs, notification templates, billing rules, AI feature toggles, and general hospital profile information.

---

## 9. Detailed Role Description

### 9.1 Admin
**Access Level:** Full system access.
**Core Responsibilities:** User/role provisioning, department and catalog configuration, ward/bed/inventory oversight, billing and appointment override authority, audit log review, system-wide reporting, notification broadcast, and AI feature configuration.
**Cannot:** Be restricted by any other role's permission scope; all admin actions are still fully audit-logged.

### 9.2 Doctor
**Access Level:** Scoped to assigned patients (OPD queue + admitted patients under their care).
**Core Responsibilities:** Consultation, diagnosis, prescription authoring (with AI assist), lab test ordering and review, schedule/leave management, internal chat, and personal performance analytics.
**Cannot:** Access patients not assigned to them (except via Admin-granted cross-cover), modify billing directly, or manage inventory.

### 9.3 Receptionist
**Access Level:** Front-desk operational scope.
**Core Responsibilities:** Patient registration, appointment booking/cancel/reschedule, doctor availability lookup, walk-in queue management, patient check-in, document upload, consultation payment collection.
**Cannot:** Access clinical notes/diagnosis content, alter prescriptions, or access financial reports beyond daily collection summary.

### 9.4 Nurse
**Access Level:** Ward/bed-scoped, assigned-patient clinical support.
**Core Responsibilities:** Vitals recording, nursing notes, prescription viewing (read-only), ward/bed status viewing, patient care logging, internal chat.
**Cannot:** Create/edit prescriptions, order lab tests, or access billing.

### 9.5 Pharmacist
**Access Level:** Pharmacy module scope.
**Core Responsibilities:** Medicine catalog and stock management, batch/expiry tracking, supplier records, prescription-based medicine issuance, pharmacy invoicing.
**Cannot:** Modify prescriptions, access clinical notes, or access non-pharmacy inventory.

### 9.6 Laboratory Technician
**Access Level:** Laboratory module scope.
**Core Responsibilities:** Managing test orders, sample collection status, report upload, consumables inventory, lab invoicing/payment collection.
**Cannot:** Access prescriptions unrelated to ordered tests, or modify diagnosis notes.

### 9.7 Billing Clerk (Accountant)
**Access Level:** Billing/Payments module scope.
**Core Responsibilities:** Invoice generation and consolidation, payment recording, refund processing, revenue reporting.
**Cannot:** Access clinical data beyond what is required for invoice line items (service/medicine/test names and pricing).

### 9.8 Ward Boy
**Access Level:** Patient-transfer operational scope.
**Core Responsibilities:** Executing and updating patient transfers (to ward, OT, laboratory), transfer status updates in real time.
**Cannot:** Access clinical, billing, or prescription data beyond transfer instructions (patient name, origin, destination, urgency).

### 9.9 Ambulance Driver
**Access Level:** Ambulance module, own-assignment scope.
**Core Responsibilities:** Viewing and accepting assigned trip requests, updating trip status (en route/picked up/dropped), viewing own trip history.
**Cannot:** Access patient clinical data or other drivers' trip assignments.

### 9.10 Patient
**Access Level:** Self-data scope only.
**Core Responsibilities:** Signup/login, appointment booking, viewing own prescriptions/reports/invoices, making payments, using internal-facing patient chat/chatbot, receiving notifications.
**Cannot:** Access any other patient's data or any staff-only module.

---

## 10. OPD Workflow

### 10.1 Narrative Flow

1. **Patient Signup/Login** — via Email/Password or Google OAuth.
2. **Appointment Request** — Patient submits a structured form: Name, Disease/Reason, Preferred Date, Preferred Time, Hospital Location, Gender, Age, Mobile Number.
3. **Routing to Receptionist** — Request appears in the Receptionist's live queue.
4. **Availability Check** — Receptionist checks doctor availability against the Doctor Management schedule for the requested department/date.
5. **Booking Confirmation** — Receptionist confirms the slot; patient receives a real-time notification with assigned doctor, date, and time.
6. **Check-in** — On the visit date, Receptionist checks the patient in, placing them into the doctor's live queue.
7. **Consultation** — Doctor reviews history, examines patient, records diagnosis/notes.
8. **Prescription** — Doctor authors prescription (optionally AI-assisted); prescription is finalized and digitally signed.
9. **Nurse Visibility** — Prescription and consultation notes become visible to Nursing for care coordination; nurse updates the patient record with any vitals/observations.
10. **Billing Notification** — A copy of the consultation event is forwarded to the Accountant/Billing Clerk to trigger invoice generation.
11. **Lab Orders (Conditional)** — If required, Doctor orders lab tests; request routes to Laboratory.
12. **Lab Processing** — Lab collects sample (if applicable), performs test, uploads report.
13. **Doctor Review** — Doctor reviews the uploaded report; may revise diagnosis/prescription.
14. **Pharmacy Request** — Finalized prescription automatically generates a medicine request to Pharmacy.
15. **Medicine Issuance** — Pharmacy verifies stock, issues medicines, updates inventory.
16. **Payment** — Patient completes payment: Consultation payment is collected by the Receptionist; Lab payment is collected by the Laboratory Technician; Pharmacy payment is collected at the pharmacy counter. Modes: Online or Cash. Status: Pending → Paid, reflected in real time on the patient dashboard.

### 10.2 Key Decision Points
- If the requested doctor/slot is unavailable, Receptionist offers alternate slots (system suggests based on department availability).
- If lab tests are not ordered, the flow skips directly from Prescription to Pharmacy.
- If a patient does not check in within a configurable grace window, the appointment is auto-marked "No-Show" and the slot is released.

---

## 11. IPD Workflow

### 11.1 Narrative Flow

1. **Ambulance Booking (Optional)** — Patient or family requests an ambulance; Ambulance Driver is assigned and trip status is tracked in real time.
2. **Admission Registration** — Receptionist registers the IPD admission, capturing admission reason, referring doctor, and emergency status.
3. **Doctor Assignment** — Admin/Receptionist assigns the primary attending doctor.
4. **Ward Assignment** — Patient is assigned to a ward type: General Ward, Emergency Ward, or ICU (ICU reserved strictly for emergency-classified admissions).
5. **Bed Assignment** — A specific available bed within the assigned ward is allocated; bed status updates to "Occupied" in real time.
6. **Patient Transfer** — Ward Boy transfers the patient to the assigned ward/bed and updates transfer status.
7. **Vitals & Nursing Care** — Nurse records initial and ongoing vitals and nursing notes.
8. **Doctor Consultation (Rounds)** — Attending doctor conducts rounds, updates diagnosis/treatment plan.
9. **Prescription** — Doctor issues/updates prescription for the admission (AI-assisted, same as OPD).
10. **Lab (Conditional)** — Doctor orders lab tests as needed during the stay; Lab processes and reports as in OPD flow.
11. **Pharmacy** — Ward-level medicine requests are issued and dispensed from Pharmacy against the IPD prescription; stock is deducted accordingly.
12. **Invoice Generation** — Accountant/Billing Clerk generates a consolidated IPD invoice covering room/ward charges, doctor consultation, lab charges, and pharmacy charges, updated incrementally throughout the stay.
13. **Payment Collection** — Receptionist (or Billing Clerk) receives payment (Online or Cash) against the invoice; partial payments during the stay are supported.
14. **Discharge** — Doctor issues discharge summary; bed status is released back to "Available"; final invoice is settled before/at discharge, with Admin override available for exceptional cases.

### 11.2 Key Decision Points
- ICU assignment requires an "Emergency" flag on the admission record; non-emergency admissions cannot be routed to ICU without Admin override.
- Bed reassignment (ward transfer mid-stay) follows the same Ward Boy transfer + status update process.
- Discharge cannot be finalized while the invoice status is "Pending" unless an Admin override is explicitly logged.

---

## 12. Business Rules

1. Staff accounts can only be created by Admin; there is no staff self-registration endpoint, enforced at both UI and API layers.
2. A patient record is uniquely identified by mobile number to prevent duplicate registrations.
3. An appointment cannot be booked against a doctor's blocked/leave time slots.
4. ICU bed assignment is permitted only for admissions flagged as "Emergency."
5. A bed cannot be assigned to more than one active patient at a time; the system must reject conflicting assignments.
6. A prescription must be doctor-reviewed and digitally signed before it is visible to Nursing or Pharmacy — AI-drafted content alone has no clinical validity.
7. Medicines cannot be issued by Pharmacy against a prescription that has not been finalized/signed.
8. Lab results cannot be released to the patient portal until reviewed and released by the ordering doctor (configurable per hospital policy).
9. An invoice line item must reference a completed service (consultation, test, medicine issuance) — no manual free-text billing without Admin approval.
10. Discharge from IPD requires either full payment or an explicit Admin-approved exception, both of which are audit-logged.
11. Every state-changing action (create/update/delete/status-change) must generate an audit log entry containing actor, timestamp, action, and affected entity.
12. Refunds can only be initiated by a Billing Clerk and must be approved by Admin above a configurable threshold amount.
13. Ambulance trip status can only be updated by the assigned driver or Admin.
14. Notifications related to payment, appointment, and report status must be delivered in real time to active sessions and queued for reliable delivery otherwise.
15. Patients can view and download only their own prescriptions, reports, and invoices.

---

## 13. Functional Overview

The system is organized around five functional pillars:

1. **Identity & Access** — Authentication, User Management, Role Management (Modules 1–3).
2. **Clinical Operations** — Doctor/Patient Management, Appointments, OPD, IPD, Ward & Bed, Ambulance, Prescriptions, AI Assistant, Lab (Modules 4–14).
3. **Support Operations** — Pharmacy, Inventory (Modules 15–16).
4. **Financial Operations** — Billing, Payments (Modules 17–18).
5. **Platform Services** — Reports, Notifications, Chat, Chatbot, File Upload, Audit Logs, Settings (Modules 19–25).

Each pillar is designed to operate semi-independently at the service layer (modular monolith in Phase 1, with clear domain boundaries to support future microservice extraction), communicating through well-defined internal APIs and event triggers (e.g., "PrescriptionFinalized" event triggers both a Pharmacy request and a Billing notification).

---

## 14. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Availability | 99.5% uptime target for production environment (Phase 1) |
| Performance | P95 API response time under 500ms for standard read operations |
| Concurrency | Support minimum 500 concurrent active users per hospital instance |
| Real-Time Latency | Socket.IO event delivery under 1 second for active sessions |
| Data Durability | PostgreSQL with automated daily backups and point-in-time recovery |
| Browser Support | Latest two versions of Chrome, Edge, Safari, Firefox |
| Responsiveness | Fully responsive layouts down to tablet width (768px); mobile-usable for Nurse/Ward Boy/Driver roles |
| Accessibility | WCAG 2.1 AA compliance target for patient-facing screens |
| Maintainability | Modular monolith architecture with domain-driven module boundaries |
| Observability | Centralized structured logging, request tracing, and error alerting |
| Localization | English (Phase 1), architecture supports future i18n |

---

## 15. Security

- **Authentication:** JWT-based access/refresh token model; Google OAuth via standard OAuth 2.0 flow; bcrypt/argon2 password hashing.
- **Authorization:** Strict RBAC enforced at API middleware level for every endpoint, not just UI conditional rendering.
- **Data Protection:** Encryption at rest for PostgreSQL and MongoDB; TLS 1.2+ for all data in transit.
- **File Security:** AWS S3 objects served only via time-limited signed URLs; no public bucket access.
- **PII/PHI Handling:** Patient medical data access is logged and scoped strictly by role and assignment; no role has blanket access to all clinical data except Admin (for administrative/audit purposes only, itself logged).
- **Audit Trail:** Immutable audit logs (append-only table/store) for all state-changing operations, retained per configurable compliance policy.
- **Session Security:** Idle session timeout, refresh token rotation, and device/session revocation from user settings.
- **Input Validation:** Server-side validation and sanitization on all inputs; parameterized queries via Prisma to prevent SQL injection.
- **Rate Limiting:** API rate limiting (Redis-backed) on authentication and public-facing endpoints to mitigate brute-force and abuse.
- **AI Safety Boundary:** AI Prescription Assistant outputs are never auto-committed to a patient's clinical record; explicit doctor sign-off is mandatory and logged as a distinct audit event from the AI suggestion itself.

---

## 16. Scalability

- **Architecture:** Modular monolith at launch with clearly separated domain modules, enabling future extraction into independent services (e.g., Billing, Lab, Pharmacy) without a full rewrite.
- **Caching:** Redis for session storage, frequently-read reference data (department/doctor lists, catalogs), and rate-limiting counters.
- **Asynchronous Processing:** BullMQ-backed job queues for notification delivery, report generation, AI inference calls, and file processing, decoupling slow operations from request/response cycles.
- **Database Scaling:** PostgreSQL read replicas for reporting/analytics workloads; MongoDB used exclusively for high-write, low-relational chat/chatbot data to avoid overloading the relational store.
- **Horizontal Scaling:** Stateless Node.js/Express application servers behind a load balancer, enabling horizontal pod/instance scaling.
- **Real-Time Layer:** Socket.IO with a Redis adapter to support multi-instance deployment without losing real-time event delivery.
- **Future Multi-Tenancy:** Data model designed with hospital/branch identifiers on core entities from Phase 1, even though multi-branch UI/logic is deferred, to ease future expansion.

---

## 17. AI Features

### 17.1 AI Prescription Assistant
- **Purpose:** Reduce doctor documentation time and support safer prescribing by suggesting medicines, dosages, frequency, and duration based on the recorded diagnosis, patient history, known allergies, and current medications.
- **Operating Mode:** Strictly advisory. The AI never finalizes or transmits a prescription; every suggestion is presented for doctor review, edit, and explicit digital sign-off.
- **Safety Checks:** The assistant surfaces potential drug interaction and allergy conflict warnings based on structured patient data, but final clinical judgment remains with the doctor.
- **Audit Trail:** AI-suggested content and the doctor's final, signed version are both retained, enabling clear differentiation between AI input and clinical decision for audit and quality-review purposes.

### 17.2 AI Patient Chatbot
- **Purpose:** Provide patients with 24/7 self-service support for FAQs (hospital timings, department info), appointment status lookup, and general triage-style guidance.
- **Boundaries:** The chatbot explicitly discloses that it does not provide diagnosis or replace professional medical consultation, and escalates to human staff (or prompts appointment booking) for anything beyond informational scope.
- **Data Handling:** Chat sessions are stored in MongoDB, linked to the patient's account, and are subject to the same access-control and retention policies as other patient data.

---

## 18. Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| AI-suggested prescriptions are misapplied without adequate doctor review | High (patient safety) | Medium | Mandatory sign-off workflow, clear UI distinction between AI-suggested and doctor-finalized content, audit logging |
| Real-time system (Socket.IO) fails under peak concurrent load | Medium (operational disruption) | Medium | Redis adapter for horizontal scaling, load testing before go-live, fallback polling mechanism |
| Incomplete adoption by non-technical staff (e.g., Ward Boys, Nurses) | Medium (workflow gaps, reversion to paper) | Medium | Role-specific simplified UI, structured onboarding/training, mobile-friendly design |
| Data breach involving PHI | Critical (legal, reputational) | Low-Medium | Encryption, RBAC, audit logs, regular security review |
| Inventory desynchronization between Pharmacy issuance and stock records | Medium (stockouts, revenue leakage) | Medium | Transactional stock deduction tied to issuance events, reorder alerts |
| Payment reconciliation errors (cash vs. online) | Medium (financial reporting accuracy) | Medium | Structured payment-status workflow, daily reconciliation reports |
| Scope creep during implementation (25 modules) | High (schedule/budget) | Medium-High | Phased delivery plan, strict Phase 1 scope boundary per Section 4 |

---

## 19. Assumptions

- The hospital has reliable broadband internet connectivity across all departments at go-live.
- Staff devices (desktop/tablet) meet minimum browser requirements defined in Section 14.
- Hospital administration will complete initial data setup (departments, doctors, catalogs) before go-live.
- Payment gateway provider and merchant account will be selected and contracted by the hospital independently; the platform integrates against a standard gateway API.
- AWS (or equivalent S3-compatible storage) is the approved cloud storage provider for the hospital's compliance requirements.
- Regulatory/compliance requirements (e.g., local healthcare data regulations) will be confirmed by hospital legal/compliance teams and mapped to system configuration prior to go-live.
- Phase 1 targets a single hospital/single-location deployment.

---

## 20. Success Metrics

| Metric | Target (Post Go-Live, 90 Days) |
|---|---|
| Average OPD cycle time (check-in to discharge) | Reduced by 30% vs. baseline |
| Appointment no-show rate | Reduced by 20% vs. baseline (via reminders) |
| % of invoices generated automatically vs. manually | ≥ 90% automated |
| System uptime | ≥ 99.5% |
| AI Prescription Assistant adoption among doctors | ≥ 60% of eligible prescriptions drafted with assistance |
| Patient chatbot deflection rate (queries resolved without staff involvement) | ≥ 40% |
| Audit log completeness (state-changing actions logged) | 100% |
| Staff-reported usability satisfaction (survey) | ≥ 4/5 average |

---

## 21. Future Scope

- Native mobile applications (iOS/Android) for patients and field staff (Ward Boy, Ambulance Driver).
- Multi-hospital / multi-branch tenancy with centralized Admin oversight.
- Insurance and TPA claims integration.
- Telemedicine / video consultation module.
- Operation Theatre (OT) scheduling and management module.
- SMS and WhatsApp notification channels alongside email and in-app.
- Integration with national digital health ID systems (e.g., ABHA-equivalent).
- Advanced AI features: predictive bed-occupancy forecasting, readmission risk scoring, and lab-result anomaly flagging.
- Business Intelligence (BI) layer with configurable, drag-and-drop reporting for Admin.
- Custom role/permission builder for hospital-specific organizational structures.

---

*End of Document*
