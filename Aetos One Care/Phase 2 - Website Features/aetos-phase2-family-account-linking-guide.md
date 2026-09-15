# Aetos One Medical Hub - Family Account Linking
## Complete Specification Document (v1.0)

**Date:** September 13, 2026  
**Status:** Phase 2 - Final Feature Complete  
**Compliance:** DPDPA 2023, Parental Controls, Role-Based Access Control (RBAC)

---

## 1. SYSTEM OVERVIEW

### Purpose
The Family Account Linking system enables households to manage health records for multiple family members under a single umbrella account, with role-based access controls, parental controls for minors, caregiver coordination, and family health insurance management.

### Key Features
- **Multi-member family accounts** (up to 20 linked family members)
- **Role-based access control** (Administrator, Caregiver, Limited, Restricted)
- **Parental controls** for minors (<18 years)
- **Emergency access override** with audit logging
- **Family health insurance coordination**
- **Caregiver coordination** for elderly members
- **Shared health initiatives** (group exercises, family wellness challenges)
- **Complete audit trail** of all access and modifications

### User Roles & Relationships
```
Family Structure:
├── Account Owner (Administrator)
│   ├── Spouse/Partner (Full/Caregiver Access)
│   ├── Adult Child (Limited/Restricted Access)
│   ├── Elderly Parent (Caregiver Access - They manage their own + Admin can assist)
│   ├── Dependent Child <18 (Parental Control)
│   ├── Extended Family (Caregiver/Restricted)
│   └── Hired Caregiver (Role-Specific Access)
```

---

## 2. ROLE-BASED ACCESS CONTROL (RBAC)

### 2.1 Role Definitions

#### Administrator Role
**Who:** Account owner, typically primary decision-maker
**Permissions:**
- View all family members' health records
- Add/remove family members
- Modify access permissions for all members
- Access emergency override (with audit)
- Manage family insurance policies
- Configure parental controls
- Export all family data
- Set family health rules and sharing policies
- Receive alerts for all members

**Restrictions:**
- Cannot modify their own role
- Emergency override creates audit log entry
- Cannot delete own account (must transfer admin first)

#### Caregiver Role
**Who:** Spouse, elderly parent, hired caregiver, healthcare worker
**Permissions:**
- View assigned family member(s) records
- View and acknowledge appointments
- View current medications and contraindications
- Download prescriptions
- View lab results
- Access emergency contact list
- Receive appointment reminders for assigned members
- Download vaccination certificates

**Restrictions:**
- Cannot add/remove family members
- Cannot modify other members' data
- Cannot access insurance claims
- Cannot modify permissions
- Cannot view financial data

#### Limited Access Role
**Who:** Adult child, distant family member, colleague
**Permissions:**
- View own health records only
- View shared health initiatives
- View family group activities
- Download own medical records
- View own appointments
- Request data sharing from other members

**Restrictions:**
- Cannot view others' complete records (only shared items)
- Cannot modify any data
- Cannot access emergency functions
- Cannot see family insurance details

#### Restricted Role
**Who:** Dependent children, limited-capability family members
**Permissions:**
- View own health records (parental-controlled view)
- View appointments
- Access vaccination records
- View allergen/medication warnings

**Restrictions:**
- Cannot modify any data
- Cannot access others' records
- Cannot download records (parent must)
- Cannot share data
- Full parental monitoring

---

## 3. PARENTAL CONTROLS FOR MINORS

### 3.1 Control Mechanisms
```
Child Age Ranges & Controls:
├── 0-5 years
│   ├── Full parental visibility required
│   ├── No account login (parent login only)
│   ├── All medical data visible to both parents
│   └── Vaccination tracking mandatory
│
├── 6-12 years
│   ├── Parental visibility of all health data
│   ├── Account creation with parent co-ownership
│   ├── No sensitive data download without parent consent
│   ├── School health records linked
│   └── Medication administration tracking
│
├── 13-17 years
│   ├── Dual consent for sensitive data access
│   ├── Reproductive health data requires parental consent toggle
│   ├── Mental health consultation confidentiality option
│   ├── Vaccination reminder notifications both to child and parent
│   └── Activity audit for medication refills
│
└── 18+ years
    ├── Full independence option (break family link)
    ├── Or maintained connection with visibility consent
    └── Can override parental controls at 18
```

### 3.2 Sensitive Data Management for Minors
```
Parental Consent Required For:
- Mental health/psychiatry records
- Sexual/reproductive health consultations
- Substance use screening
- Abuse/trauma-related notes
- Genetic testing results (carrier status)
- HIV/STI testing

Data Sharing Restrictions:
- Cannot be shared without explicit parental consent
- Marked with [SENSITIVE-MINOR] tags in systems
- Separate storage with additional encryption
- Auto-purge after age 18 (unless minor opts to keep)
```

### 3.3 Implementation
- Toggle button per child: "Enable parental controls until age 18"
- Automatic unlock on 18th birthday (with reminder)
- Override mechanism: Parent can extend controls past 18 with child's consent
- Log every access to minor's data by parents

---

## 4. EMERGENCY ACCESS OVERRIDE

### Purpose
Allow authorized family members (typically administrator) to access critical health information in emergency situations while maintaining audit compliance.

### Mechanism
```
Trigger (Any One):
├── Marked as "Medical Emergency" by doctor/hospital
├── Call to emergency hotline with family authorization
├── Family member initiates with admin password + 2FA
├── Alert system identifies life-threatening condition
└── Hospital staff initiates with patient/proxy consent

Process:
1. Request initiated with timestamp
2. Reason documented
3. Biometric/2FA verification (if time permits)
4. 5-minute access window activated
5. Real-time audit log created
6. Automatic notification sent to patient
7. Access logged with IP, location, duration

Audit Entry Includes:
- Who accessed (name, role, employee ID if doctor)
- What was accessed (specific records)
- When (exact timestamp)
- Why (emergency reason)
- How (method: direct, phone, app)
- Result (what action taken)
```

### Restrictions
- Maximum access duration: 30 minutes
- Can be extended with re-verification
- Patient receives notification immediately
- Cannot be deleted (permanent audit trail)
- Abuse flagged for investigation

---

## 5. FAMILY HEALTH INSURANCE MANAGEMENT

### 5.1 Policy Management
```
Features:
├── Single policy view for all members
├── Coverage tracking (used vs available)
├── Cashless network hospital search
├── Claim submission and tracking
├── Premium renewal alerts
├── Network change notifications
├── Benefit maximization recommendations
└── Group discount tracking
```

### 5.2 Claims Coordination
```
Claim Types:
├── Outpatient (Doctor consultation, tests)
├── Inpatient (Hospitalization)
├── Critical Illness
├── Accident/Emergency
└── Preventive (Health checkup, vaccination)

Process:
1. Patient initiates claim with receipt
2. Family admin reviews (if policy limit)
3. Automatic claim submission to TPA
4. Status tracking in dashboard
5. Payment to patient/hospital
6. Receipt stored in family records

Data Shared with Insurance:
- Patient name, age, DOB, phone, email
- Claim amount and type
- ICD-10 diagnosis codes
- FHIR summary (encrypted)
- Medical prescription details
- Lab test results (encrypted)

NOT Shared:
- Full consultation notes
- Mental health details (unless claimed)
- Genetic test results (unless relevant)
- Reproductive health data (unless claimed)
```

### 5.3 Family Insurance Recommendations
- Optimal deductible based on family health profile
- Coverage gap analysis
- Annual benefit maximization plan
- Co-insurance optimization

---

## 6. CAREGIVER COORDINATION

### 6.1 Caregiver Assignment
```
For Elderly Member (70+ years):
├── Primary caregiver (spouse/adult child)
├── Secondary caregiver (alternate if primary unavailable)
├── Healthcare worker (nurse, physiotherapist)
├── Doctor/clinic staff
└── Emergency contact (hospital)

Each Caregiver Gets:
- Name and phone of assigned elderly member
- Current medications (with dosages and times)
- Allergy and contraindication warnings
- Appointment schedule
- Recent lab values and vitals
- Mobility and dietary restrictions
- Backup emergency contacts
```

### 6.2 Coordination Features
```
Shared Care Dashboard:
├── Medication administration checklist
├── Appointment reminders (shared)
├── Vital signs log (for chronic conditions)
├── Symptom tracker (shared notes)
├── Doctor's follow-up instructions
├── Dietary guidelines
├── Exercise recommendations
└── Caregiver communication thread
```

### 6.3 Medication Adherence Tracking
```
For Medications Marked "Critical" or "Chronic":
├── Dose reminder (to patient + caregiver)
├── Checklist: Did patient take medication?
├── Photo upload (optional: patient shows empty glass)
├── Missed dose alert (escalates after 2 hours)
├── Refill coordination with pharmacy
├── Drug interaction warnings
├── Side effect tracking
└── Weekly adherence report
```

---

## 7. DATABASE SCHEMA

### Core Tables

#### family_groups
```sql
CREATE TABLE family_groups (
  id BIGINT PRIMARY KEY,
  name VARCHAR(100),
  primary_admin_id BIGINT NOT NULL,
  member_count INT DEFAULT 1,
  insurance_policy_id BIGINT,
  created_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (primary_admin_id) REFERENCES users(id),
  INDEX idx_admin (primary_admin_id)
);
```

#### family_members
```sql
CREATE TABLE family_members (
  id BIGINT PRIMARY KEY,
  family_group_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  relationship VARCHAR(50),  -- spouse, parent, child, sibling, etc.
  role VARCHAR(20),  -- admin, caregiver, limited, restricted
  
  -- Parental Control
  is_minor BOOLEAN DEFAULT FALSE,
  parental_consent_until_age INT DEFAULT 18,
  
  -- Caregiver Assignment (for elderly/dependent members)
  assigned_to_user_id BIGINT,  -- who is the caregiver
  
  -- Permissions (JSON for flexibility)
  permissions JSON,
  
  -- Status
  status VARCHAR(20),  -- active, pending_invite, declined, removed
  joined_at TIMESTAMP,
  removed_at TIMESTAMP,
  
  FOREIGN KEY (family_group_id) REFERENCES family_groups(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (assigned_to_user_id) REFERENCES users(id),
  INDEX idx_family_group (family_group_id),
  INDEX idx_user (user_id)
);
```

#### family_permissions
```sql
CREATE TABLE family_permissions (
  id BIGINT PRIMARY KEY,
  family_member_id BIGINT NOT NULL,
  permission_type VARCHAR(50),  -- view_records, edit_data, access_insurance, etc.
  granted_by_user_id BIGINT,
  granted_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (family_member_id) REFERENCES family_members(id),
  FOREIGN KEY (granted_by_user_id) REFERENCES users(id),
  INDEX idx_family_member (family_member_id)
);
```

#### emergency_access_logs
```sql
CREATE TABLE emergency_access_logs (
  id BIGINT PRIMARY KEY,
  family_group_id BIGINT NOT NULL,
  accessed_by_user_id BIGINT NOT NULL,
  accessed_member_user_id BIGINT NOT NULL,
  reason VARCHAR(500),
  
  -- Security Details
  ip_address_hash VARCHAR(64),
  user_agent_hash VARCHAR(64),
  verification_method VARCHAR(50),  -- password, biometric, sms_otp, etc.
  
  -- Audit
  accessed_at TIMESTAMP DEFAULT NOW(),
  access_duration_seconds INT,
  records_accessed JSON,
  actions_taken JSON,
  
  FOREIGN KEY (family_group_id) REFERENCES family_groups(id),
  FOREIGN KEY (accessed_by_user_id) REFERENCES users(id),
  FOREIGN KEY (accessed_member_user_id) REFERENCES users(id),
  INDEX idx_family_group (family_group_id),
  INDEX idx_accessed_at (accessed_at DESC)
);
```

#### family_access_audit
```sql
CREATE TABLE family_access_audit (
  id BIGINT PRIMARY KEY,
  family_member_id BIGINT NOT NULL,
  accessor_user_id BIGINT NOT NULL,
  action VARCHAR(50),  -- view, download, share, edit
  resource_type VARCHAR(50),  -- consultation, prescription, lab_result, etc.
  resource_id BIGINT,
  timestamp TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (family_member_id) REFERENCES family_members(id),
  FOREIGN KEY (accessor_user_id) REFERENCES users(id),
  INDEX idx_family_member (family_member_id),
  INDEX idx_timestamp (timestamp DESC)
);
```

#### family_insurance_claims
```sql
CREATE TABLE family_insurance_claims (
  id BIGINT PRIMARY KEY,
  family_group_id BIGINT NOT NULL,
  policy_id VARCHAR(50),
  claim_type VARCHAR(50),  -- outpatient, inpatient, critical, etc.
  member_user_id BIGINT NOT NULL,
  consultation_id BIGINT,
  claim_amount DECIMAL(10,2),
  
  status VARCHAR(20),  -- submitted, processing, approved, paid, rejected
  submitted_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP,
  paid_at TIMESTAMP,
  
  FOREIGN KEY (family_group_id) REFERENCES family_groups(id),
  FOREIGN KEY (member_user_id) REFERENCES users(id),
  INDEX idx_family_group (family_group_id),
  INDEX idx_status (status)
);
```

---

## 8. REST API ENDPOINTS

### Family Group Management

#### POST /api/v1/family-groups
**Create family group**
```
Request:
{
  "name": "Singh Family",
  "primary_admin_id": "U123"
}

Response (201 Created):
{
  "family_group_id": "FG-ABC123",
  "name": "Singh Family",
  "primary_admin": "Raj Kumar Singh",
  "member_count": 1,
  "created_at": "2024-09-13T14:00:00Z"
}
```

#### GET /api/v1/family-groups/{group_id}
**Get family group details**
```
Response:
{
  "family_group_id": "FG-ABC123",
  "name": "Singh Family",
  "primary_admin": "Raj Kumar Singh",
  "members": [
    {
      "id": "FM-001",
      "name": "Raj Kumar Singh",
      "relationship": "Self",
      "role": "Administrator",
      "status": "active",
      "joined_at": "2024-01-15T00:00:00Z"
    },
    {
      "id": "FM-002",
      "name": "Priya Singh",
      "relationship": "Spouse",
      "role": "Caregiver",
      "status": "active",
      "joined_at": "2024-02-20T00:00:00Z"
    }
  ],
  "insurance_policy": {
    "policy_id": "FAM-2024-ABC123",
    "type": "Family Floater",
    "coverage": "₹500,000",
    "valid_until": "2024-12-31"
  }
}
```

---

### Family Member Management

#### POST /api/v1/family-groups/{group_id}/members
**Add family member**
```
Request:
{
  "name": "Priya Singh",
  "relationship": "spouse",
  "email": "priya@example.com",
  "phone": "+91-9876543211",
  "dob": "1978-05-15",
  "role": "caregiver",
  "permissions": {
    "view_records": true,
    "view_prescriptions": true,
    "access_emergency": true
  }
}

Response (201 Created):
{
  "family_member_id": "FM-002",
  "status": "pending_invite",
  "invite_sent_to": "priya@example.com",
  "expires_at": "2024-09-20T14:00:00Z"
}
```

#### PATCH /api/v1/family-members/{member_id}
**Update member role/permissions**
```
Request:
{
  "role": "limited",
  "permissions": {
    "view_records": true,
    "view_prescriptions": false,
    "access_emergency": false
  }
}

Response (200 OK):
{
  "family_member_id": "FM-002",
  "role": "limited",
  "permissions_updated_at": "2024-09-13T14:30:00Z"
}
```

#### DELETE /api/v1/family-members/{member_id}
**Remove family member from group**
```
Response (204 No Content)
Audit log entry created automatically
```

---

### Emergency Access

#### POST /api/v1/family-groups/{group_id}/emergency-access
**Initiate emergency access**
```
Request:
{
  "member_id": "FM-003",  -- Whose data to access
  "reason": "Hospital admission - patient unconscious",
  "verification_method": "password"  -- password, biometric, sms_otp
}

Response (200 OK):
{
  "access_granted": true,
  "access_window_ends_at": "2024-09-13T14:35:00Z",
  "access_token": "EMERGENCY_TOKEN_ABC123",
  "notification_sent_to_patient": true
}
```

#### GET /api/v1/family-groups/{group_id}/emergency-access-logs
**Get emergency access audit trail**
```
Response:
{
  "logs": [
    {
      "log_id": "EL-001",
      "accessed_by": "Raj Kumar Singh",
      "accessed_member": "Ashok Singh",
      "reason": "Hospital admission",
      "accessed_at": "2024-09-13T14:00:00Z",
      "access_duration": "15 minutes",
      "records_accessed": ["consultations", "medications", "vitals"],
      "verification_method": "password"
    }
  ]
}
```

---

### Parental Controls

#### PATCH /api/v1/family-members/{member_id}/parental-controls
**Configure parental controls for minor**
```
Request:
{
  "enabled": true,
  "consent_until_age": 18,
  "sensitive_data_tracking": true,
  "require_consent_for": ["mental_health", "reproductive_health"],
  "app_time_limit_hours": 2,
  "location_tracking_enabled": true
}

Response (200 OK):
{
  "parental_controls_enabled": true,
  "configured_at": "2024-09-13T14:00:00Z"
}
```

---

### Insurance Claims

#### POST /api/v1/family-groups/{group_id}/claims
**Submit insurance claim**
```
Request:
{
  "member_id": "FM-001",
  "claim_type": "outpatient",
  "consultation_id": "C001",
  "claim_amount": 500,
  "receipt_document": "base64_encoded_pdf"
}

Response (201 Created):
{
  "claim_id": "CL-2024-ABC123",
  "status": "submitted",
  "submitted_at": "2024-09-13T14:00:00Z",
  "estimated_approval_time": "5-7 business days"
}
```

---

## 9. AUDIT & COMPLIANCE

### 9.1 DPDPA 2023 Requirements
```
Compliance Element          Implementation
────────────────────────────────────────────
Data minimization           Family member data shared only with consent
Purpose limitation          Health data for healthcare only
Storage limitation          Auto-delete per retention policy
Consent management          Explicit opt-in for each member
Transparency               Access notifications + audit log
Data subject rights
  ├─ Access                 GET /api/v1/family-members/{id}/my-data
  ├─ Erasure                DELETE /api/v1/family-members/{id}
  ├─ Rectification          PATCH /api/v1/family-members/{id}
  └─ Portability            FHIR/JSON export for all members
Security measures           AES-256-GCM + TLS 1.3
Audit trail                 Complete logging (audit table)
Breach notification         <72 hours
Data retention              See deletion policy
```

### 9.2 Audit Logging
Every action logged:
- **Access:** Who accessed what, when, why
- **Modification:** Changes to permissions/roles
- **Emergency:** All emergency access
- **Sharing:** Data shared with external parties
- **Deletion:** Member removal, data deletion

**Retention:**
- Normal access logs: 3 years
- Emergency access logs: 7 years (compliance)
- Deletion logs: 7 years (audit trail)

---

## 10. SECURITY MEASURES

### 10.1 Authentication
- Multi-factor authentication (2FA/MFA)
- Biometric verification for emergency access
- Session management with automatic timeout (15 min)
- Device trust (remember this device)

### 10.2 Encryption
- **In transit:** TLS 1.3
- **At rest:** AES-256-GCM
- **Field-level:** Sensitive data (Mental health, reproductive health)
- **Shared data:** Encrypted before sending outside platform

### 10.3 Access Control
- Role-based access control (4 tiers)
- Attribute-based access control (age, relationship, consent status)
- Principle of least privilege
- Emergency override with compensation controls

---

## 11. DATA RETENTION POLICY

```
User Type / Data Type          Retention Period
──────────────────────────────────────────────────
Active family member data      Until member removed or family group deleted

Removed member data
  ├─ Medical records           Soft delete: 30 days, Hard delete: 180 days
  └─ Audit logs                Retained 7 years (compliance)

Parental control data
  ├─ For <18 years             Until age 18 + 30 days
  └─ Auto-unlock notification  Sent on 18th birthday

Deleted family group           Soft delete: 30 days, Hard delete: 1 year
  ├─ Exception: DPDPA audit    Retained 7 years

Emergency access logs          7 years (compliance requirement)
```

---

## 12. TESTING SPECIFICATIONS

### Unit Tests
- Permission validation for each role
- Parental control enforcement
- Emergency access token generation
- Data encryption/decryption

### Integration Tests
- Family group creation with members
- Role assignment and permission modification
- Emergency access workflow
- Insurance claim submission
- Audit logging for all operations

### Security Tests
- Token expiry validation
- Unauthorized access prevention
- Emergency override audit compliance
- Parental control bypass attempts
- SQL injection prevention

---

## 13. ROLLOUT PLAN

**Phase 1 (Week 1):** Family group creation + member management (beta)  
**Phase 2 (Week 2):** Role-based access control + permissions UI  
**Phase 3 (Week 3):** Parental controls + emergency access  
**Phase 4 (Week 4):** Insurance integration + caregiver coordination  
**Phase 5 (Ongoing):** Advanced features, elder care, wellness programs

---

**Document Version:** 1.0  
**Last Updated:** 13 September 2026  
**Status:** Phase 2 Complete - Ready for Phase 3 (Mobile Apps Architecture)
