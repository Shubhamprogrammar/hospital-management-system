# Role Login Credentials

Test/seed login credentials for every role in the Hospital Management System.

**Format:** Email `<role>@hospital.com`, password `<role>@123` (role in lowercase).

| Role | Name | Email | Password | Status |
| ---- | ---- | ----- | -------- | ------ |
| SUPER_ADMIN | SUPER_ADMIN | super_admin@hospital.com | super_admin@123 | Created |
| HOSPITAL_ADMIN | HOSPITAL_ADMIN | hospital_admin@hospital.com | hospital_admin@123 | Created |
| RECEPTIONIST | receptionist | receptionist@hospital.com | receptionist@123 | Pre-existing |
| DOCTOR | doctor | doctor@hospital.com | doctor@123 | Pre-existing |
| NURSE | NURSE | nurse@hospital.com | nurse@123 | Created |
| LAB_TECHNICIAN | LAB_TECHNICIAN | lab_technician@hospital.com | lab_technician@123 | Created |
| PATHOLOGIST | PATHOLOGIST | pathologist@hospital.com | pathologist@123 | Created |
| PHARMACIST | PHARMACIST | pharmacist@hospital.com | pharmacist@123 | Created |
| BILLING_STAFF | BILLING_STAFF | billing_staff@hospital.com | billing_staff@123 | Created |
| INVENTORY_MANAGER | INVENTORY_MANAGER | inventory_manager@hospital.com | inventory_manager@123 | Created |
| AMBULANCE_DISPATCHER | AMBULANCE_DISPATCHER | ambulance_dispatcher@hospital.com | ambulance_dispatcher@123 | Created |
| AMBULANCE_DRIVER | AMBULANCE_DRIVER | ambulance_driver@hospital.com | ambulance_driver@123 | Created |
| WARD_BOY | WARD_BOY | ward_boy@hospital.com | ward_boy@123 | Created |
| ACCOUNTANT | ACCOUNTANT | accountant@hospital.com | accountant@123 | Created |
| IT_SUPPORT | IT_SUPPORT | it_support@hospital.com | it_support@123 | Created |
| PATIENT | patient | patient@hospital.com | patient@123 | Pre-existing |

> **Note:** Roles marked "Pre-existing" already had a user account with that email before
> this seed ran, so they were **not** recreated. Their passwords may differ from the
> `<role>@123` convention (they were not changed by the seed script).

## Re-run / regenerate

```bash
cd server
npx tsx prisma/seed-role-users.ts
```

The script is idempotent: it skips any email that already exists.
