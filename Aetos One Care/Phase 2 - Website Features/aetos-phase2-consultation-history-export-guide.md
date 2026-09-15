# Aetos One Medical Hub - Consultation History Export & Sharing
## Complete Specification Document (v1.0)

**Date:** September 13, 2026  
**Status:** Phase 2 - Specification Complete  
**Compliance:** DPDPA 2023, FHIR R4, HL7 v2.5, ABDM, HIPAA-equivalent

---

## 1. SYSTEM OVERVIEW

### Purpose
The Consultation History Export feature enables patients to download, manage, and securely share their complete medical consultation records in multiple formats with healthcare providers, family members, and third-party healthcare systems.

### Key Features
- **Multi-format exports** (PDF, CSV, JSON, FHIR R4, HL7 v2.5, Health Summary)
- **Advanced filtering** by date range, doctor, specialty, consultation type
- **Secure sharing** via time-limited links, email, SMS, WhatsApp, QR codes
- **DPDPA 2023 compliance** with AES-256 encryption and data retention policies
- **Healthcare interoperability** with ABDM, hospital HIS/EHR systems
- **Audit logging** of all export and share events for compliance

### Architecture Diagram
```
┌─────────────────────────────────────────────────────────────┐
│                   Consultation History Export System          │
└─────────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
    ┌────────┐      ┌──────────┐      ┌──────────┐
    │ Filter │      │ Database │      │ Audit    │
    │Engine  │◄────►│(Postgres)│◄────►│Log       │
    └────────┘      └──────────┘      └──────────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │
        ┌─────────────────┼─────────────────────────────┐
        │                 │                             │
        ▼                 ▼                             ▼
    ┌─────────┐    ┌──────────────┐    ┌──────────────┐
    │ Export  │    │ Share Link   │    │ Encryption  │
    │Engine   │    │ Generator    │    │(AES-256)    │
    │(6 fmts) │    │(JWT+HMAC)    │    │             │
    └─────────┘    └──────────────┘    └──────────────┘
        │                 │                     │
        ▼                 ▼                     ▼
    ┌──────────────────────────────────────────────────┐
    │          Export Delivery Channels                 │
    │  PDF | CSV | JSON | FHIR | HL7 | Summary       │
    │  Email | SMS | WhatsApp | QR Code | Link      │
    └──────────────────────────────────────────────────┘
```

---

## 2. EXPORT FORMATS SPECIFICATION

### 2.1 PDF Report Export
**Use Case:** Professional medical records sharing with doctors and hospitals

**Format Details:**
- Page size: A4 (210 × 297 mm)
- Orientation: Portrait (standard) or Landscape (detailed)
- Font: Calibri 11pt (body), 14pt (headings)
- Compression: ZIP compression to reduce file size by 40-50%

**Sections Included:**
1. **Header** (Patient name, DOB, ID, export date, compliance badges)
2. **Patient Summary** (Blood type, allergies, emergency contact)
3. **Consultation Timeline** (Chronological entries with doctor details)
4. **Prescription Summary** (Active medications, dosages, frequencies)
5. **Lab Results** (Recent test results with reference ranges)
6. **Diagnoses** (ICD-10 codes, onset dates, status)
7. **Vital Signs Summary** (Trends over time)
8. **Insurance Information** (Policy details, claims status)
9. **Allergies & Warnings** (Drug interactions, contraindications)
10. **Footer** (DPDPA compliance note, encrypted document indicator)

**File Naming Convention:**
- `Medical_History_{PatientID}_{YYYYMMDD}.pdf`
- Example: `Medical_History_P12345_20240913.pdf`

**PDF Templates:**
- Standard (1-page summary with key info only)
- Detailed (8-12 pages with full consultation notes)
- Summary (Single-page printable health card)

**Encryption:** Optional AES-256 with password protection

---

### 2.2 CSV Spreadsheet Export
**Use Case:** Data analysis, healthcare research, personal health tracking

**Structure:**

#### Table 1: Patient_Info
```
PatientID | Name | DOB | Gender | BloodType | Height | Weight | LastUpdated
P12345    | Raj Singh | 15-01-1978 | M | O+ | 178 | 78 | 2024-09-13
```

#### Table 2: Consultations
```
ConsultID | Date | Doctor | Specialty | Type | Duration(min) | Fee | Notes | Prescription
C001 | 2024-09-10 | Dr. Priya Sharma | General | Follow-up | 25 | ₹500 | BP control good | Ramipril 5mg
```

#### Table 3: Lab_Results
```
TestID | Date | TestName | Result | Unit | RefRange | Status | LabName
L001 | 2024-09-05 | Fasting Glucose | 185 | mg/dL | 70-100 | High | Apollo Labs
```

#### Table 4: Prescriptions
```
RxID | Date | Doctor | Medication | Strength | Quantity | Frequency | Days | Refills
RX001 | 2024-09-10 | Dr. Priya Sharma | Ramipril | 5mg | 30 | OD | 30 | 6
```

#### Table 5: Diagnoses
```
DiagnosisID | ICD10 | Condition | OnsetDate | Status | ResolvedDate | Notes
D001 | I10 | Essential Hypertension | 2024-08-20 | Active | NULL | Stage 1
```

**Export Formats:**
- Detailed (separate tables for each data type)
- Flat (all data in single table)
- Pivot (grouped by consultation type or date range)

**File Naming:** `Medical_History_{PatientID}_{Format}_{YYYYMMDD}.csv`

---

### 2.3 JSON Data Export
**Use Case:** App integration, cloud backup, interoperability with health platforms

**Schema Structure:**
```json
{
  "export_metadata": {
    "version": "1.0",
    "export_date": "2024-09-13T14:30:00Z",
    "patient_id": "P12345",
    "format": "complete",
    "encryption": {
      "enabled": true,
      "algorithm": "AES-256-GCM",
      "key_derivation": "PBKDF2",
      "iterations": 100000
    },
    "compression": "gzip",
    "data_hash": "SHA256:abc123..."
  },
  "patient": {
    "id": "P12345",
    "name": "Raj Kumar Singh",
    "dob": "1978-01-15",
    "gender": "M",
    "blood_type": "O+",
    "phone": "+91-9876543210",
    "email": "raj@example.com",
    "emergency_contact": { "name": "Priya Singh", "relation": "spouse", "phone": "+91-9876543211" }
  },
  "consultations": [
    {
      "id": "C001",
      "date": "2024-09-10",
      "doctor": { "name": "Dr. Priya Sharma", "nmc_id": "NMC123456", "specialty": "General Medicine" },
      "type": "Follow-up",
      "duration_minutes": 25,
      "chief_complaint": "Blood pressure follow-up",
      "clinical_notes": "BP control good. Continue current medication.",
      "vitals": { "bp": "130/85", "hr": 72, "temp": 98.2, "rr": 16 },
      "prescriptions": [
        {
          "id": "RX001",
          "medication": "Ramipril",
          "strength": "5mg",
          "form": "Tablet",
          "quantity": 30,
          "frequency": "Once daily",
          "instructions": "Morning with water",
          "refills": 6,
          "issued_date": "2024-09-10"
        }
      ],
      "attachments": ["report_link_1", "imaging_link_1"]
    }
  ],
  "diagnoses": [
    {
      "id": "D001",
      "icd10": "I10",
      "name": "Essential Hypertension",
      "onset_date": "2024-08-20",
      "status": "active",
      "severity": "Stage 1",
      "notes": "Managed with medication"
    }
  ],
  "lab_results": [
    {
      "id": "L001",
      "test_name": "Fasting Blood Glucose",
      "result": 185,
      "unit": "mg/dL",
      "reference_range": "70-100",
      "status": "high",
      "test_date": "2024-09-05",
      "lab_name": "Apollo Diagnostics"
    }
  ],
  "medications": [
    {
      "id": "M001",
      "name": "Ramipril",
      "strength": "5mg",
      "frequency": "Once daily",
      "start_date": "2024-09-10",
      "status": "active",
      "indication": "Hypertension control"
    }
  ],
  "allergies": [
    {
      "id": "A001",
      "allergen": "Penicillin",
      "reaction": "Urticarial rash",
      "severity": "moderate",
      "onset": "1995"
    }
  ]
}
```

**File Naming:** `Medical_History_{PatientID}_{YYYYMMDD}.json`

**Optional Fields in JSON:**
- `_links`: HATEOAS links to related resources
- `digital_signature`: PKI signature for authentication
- `integrity_hash`: HMAC for tampering detection

---

### 2.4 FHIR R4 Bundle Export
**Use Case:** Healthcare system interoperability, ABDM integration, clinical research

**FHIR Resources Included:**

1. **Patient** (Demographics)
```json
{
  "resourceType": "Patient",
  "id": "patient-12345",
  "identifier": [{
    "system": "http://abdm.ndhm.gov.in",
    "value": "P12345"
  }],
  "name": [{"use": "official", "text": "Raj Kumar Singh"}],
  "telecom": [
    {"system": "phone", "value": "+91-9876543210"},
    {"system": "email", "value": "raj@example.com"}
  ],
  "birthDate": "1978-01-15",
  "gender": "male",
  "address": [{"city": "Bangalore", "state": "Karnataka", "country": "India"}]
}
```

2. **Encounter** (Consultation)
```json
{
  "resourceType": "Encounter",
  "id": "encounter-001",
  "status": "finished",
  "class": {"system": "http://terminology.hl7.org/CodeSystem/v3-ActCode", "code": "AMB"},
  "type": [{"text": "Follow-up Consultation"}],
  "subject": {"reference": "Patient/patient-12345"},
  "participant": [
    {"individual": {"reference": "Practitioner/dr-sharma", "display": "Dr. Priya Sharma"}}
  ],
  "period": {"start": "2024-09-10T10:00:00Z", "end": "2024-09-10T10:25:00Z"},
  "reason": [{"text": "Blood pressure follow-up"}]
}
```

3. **Observation** (Vitals, Lab Results)
```json
{
  "resourceType": "Observation",
  "id": "obs-001",
  "status": "final",
  "code": {"coding": [{"system": "http://loinc.org", "code": "55284-4", "display": "Blood pressure"}]},
  "subject": {"reference": "Patient/patient-12345"},
  "effectiveDateTime": "2024-09-10T10:05:00Z",
  "valueQuantity": {"value": 130, "unit": "mmHg"},
  "component": [
    {"code": {"text": "Systolic"}, "valueQuantity": {"value": 130}},
    {"code": {"text": "Diastolic"}, "valueQuantity": {"value": 85}}
  ]
}
```

4. **Medication** & **MedicationRequest**
5. **Condition** (Diagnoses with ICD-10 codes)
6. **AllergyIntolerance** (Drug allergies, contraindications)

**FHIR Bundle Structure:**
```json
{
  "resourceType": "Bundle",
  "type": "collection",
  "timestamp": "2024-09-13T14:30:00Z",
  "total": 42,
  "entry": [
    {"resource": {"resourceType": "Patient", ...}},
    {"resource": {"resourceType": "Encounter", ...}},
    {"resource": {"resourceType": "Observation", ...}},
    ...
  ]
}
```

**FHIR Terminology Bindings:**
- Consultation types → SNOMED CT concepts
- Lab tests → LOINC codes
- Diagnoses → ICD-10-CM codes
- Medications → RxNorm codes
- Allergies → SNOMED CT reaction codes

**ABDM Compliance:**
- Patient ID mapped to ABHA (Ayushman Bharat Health Account)
- Care context IDs included for Scan & Share
- Digital signature per NDHM specs

---

### 2.5 HL7 v2.5 Export
**Use Case:** Hospital HIS/EHR integration, legacy system interoperability

**Message Types Supported:**

#### ORU (Observation Result - Lab/Imaging)
```
MSH|^~\&|AETOS|ClinicName|HospitalName|HIS|20240913141500||ORU^R01|MSG123|P|2.5|||NE|NE
PID|1||P12345^^^MR~RAJ123^^^AADHAR||Singh^Raj||19780115|M|||Bangalore^KA^India|
OBX|1|NM|60591-5^Blood Glucose^LN||185|mg/dL|70-100|H|||F|||20240905
```

#### ADC (Admit/Discharge - Consultation Record)
```
MSH|^~\&|AETOS|Clinic|Hospital|HIS|20240913||ADC^A01|ADT001|P|2.5
PID|1||P12345|||Singh^Raj||19780115|M
PV1|1|O|OUTPATIENT||||DR123^SHARMA^PRIYA^^^DR||||||||||||||
DG1|1||I10^Essential Hypertension
OBX|1|TX|11488-4^Note^LN||BP control good. Continue medication||||||F
```

#### RXE (Pharmacy - Prescriptions)
```
MSH|^~\&|AETOS|Clinic|Pharmacy|HIS|20240913||RXE|RX001|P|2.5
RXE|1||2084441^Ramipril 5mg TAB^NDC||5|mg|30|1QD|
RXE|2||2084442^Atorvastatin 20mg TAB^NDC||20|mg|30|1OD|
```

**Message Encoding:**
- Encoding characters: `^~\&`
- Field separator: `|`
- Component separator: `^`
- Repetition separator: `~`
- Escape character: `\`
- Sub-component separator: `&`

**Segment Structure:**
- MSH (Message Header)
- PID (Patient Identification)
- PV1 (Patient Visit)
- DG1 (Diagnosis)
- OBX (Observation/Result)
- RXE (Pharmacy encoded order)
- AL1 (Allergy information)

**File Naming:** `Medical_History_{PatientID}_{MsgType}_{YYYYMMDD}.hl7`

---

### 2.6 Health Summary Card
**Use Case:** Emergency access, wallet card, printable reference, public health initiatives

**One-Page Summary Format:**
```
╔═══════════════════════════════════════════════════════════╗
║           PERSONAL HEALTH SUMMARY CARD (2024)             ║
╠═══════════════════════════════════════════════════════════╣
║                                                            ║
║  Name: Raj Kumar Singh          DOB: 15 Jan 1978 (46y)   ║
║  Blood Type: O+                 Weight: 78 kg  Height: 5'10" ║
║  ID: P12345                     Phone: +91-9876543210    ║
║                                                            ║
╠═══════════════════════════════════════════════════════════╣
║  ACTIVE CONDITIONS (Chronic)                              ║
║  • Hypertension (Essential) - Stage 1 (Aug 2024)         ║
║  • Type 2 Diabetes Mellitus (Aug 2024, Controlled)       ║
║  • Dyslipidemia (Managed)                                ║
║                                                            ║
║  CURRENT MEDICATIONS (8 active)                           ║
║  • Ramipril 5mg - Once daily (BP control)                ║
║  • Metformin 1000mg - Twice daily (Diabetes)             ║
║  • Atorvastatin 20mg - Once daily (Cholesterol)          ║
║  • Aspirin 75mg - Once daily (Cardio protection)         ║
║  [+4 more medications...]                                ║
║                                                            ║
║  ALLERGIES & CONTRAINDICATIONS                           ║
║  ⚠ Penicillin → Urticarial rash (Moderate)               ║
║  ⚠ Sulfonamides → History of reaction                    ║
║                                                            ║
║  LAST CONSULTATION                                        ║
║  Dr. Priya Sharma | General Medicine | Sep 10, 2024      ║
║  "BP control good. Continue current medication."         ║
║                                                            ║
║  EMERGENCY CONTACT                                        ║
║  Priya Singh (Spouse) | +91-9876543211                   ║
║                                                            ║
║  VACCINATION STATUS                                       ║
║  ✓ COVID-19 (3 doses, Last: Dec 2023)                   ║
║  ✓ Flu Vaccine (Annual, Last: Oct 2023)                 ║
║  ✓ Pneumococcal (Jan 2020)                              ║
║                                                            ║
║  ════════════════════════════════════════════════════════ ║
║  Generated: 13 Sep 2024 | DPDPA 2023 Compliant           ║
║  Scan QR below for digital version                       ║
║  [QR Code Here]                                          ║
╚═══════════════════════════════════════════════════════════╝
```

**Languages Supported:**
- English
- Hindi (हिंदी)
- Kannada (ಕನ್ನಡ)
- Telugu (తెలుగు)
- Tamil (தமிழ்)
- Marathi (मराठी)

**Wallet Card Version (Credit card size: 85 × 54 mm):**
- Compact format with QR code
- Printable on plastic card stock
- Lamination-ready

---

## 3. FILTERING & SELECTION ENGINE

### 3.1 Filter Criteria
```
Filters:
├── Date Range
│   ├── From date (YYYY-MM-DD)
│   ├── To date (YYYY-MM-DD)
│   └── Quick filters: Last 30 days, Last 6 months, Last year, All time
│
├── Specialty
│   ├── General Medicine
│   ├── Cardiology
│   ├── Endocrinology
│   ├── Orthopedics
│   ├── Dermatology
│   ├── Psychiatry
│   └── All Specialties
│
├── Consultation Type
│   ├── Initial consultation
│   ├── Follow-up
│   ├── Specialist referral
│   ├── Urgent/Emergency
│   ├── Telemedicine
│   └── In-person
│
├── Doctor Name
│   └── Full-text search with autocomplete
│
├── Status
│   ├── Completed
│   ├── Pending review
│   └── Cancelled
│
└── Data Categories
    ├── Consultations & Notes
    ├── Prescriptions
    ├── Lab Results
    ├── Vital Signs
    ├── Diagnoses
    ├── Attachments & Imaging
    ├── Insurance Claims
    └── Allergies & Warnings
```

### 3.2 Filter Logic
- **AND logic:** Multiple filters combined (all must match)
- **OR logic:** Within single filter (any option matches)
- **Date range:** Inclusive on both ends
- **Full-text search:** Case-insensitive, supports partial matching
- **Caching:** Filters cached client-side for 5 minutes

### 3.3 Selection Methods
1. **Individual selection:** Checkboxes per consultation
2. **Bulk selection:** "Select all filtered" button
3. **Range selection:** Ctrl+click for range selection
4. **Smart selection:** "Select by recommendation" (last 3 consultations, etc.)

---

## 4. SECURE SHARING MECHANISMS

### 4.1 Share Link Generation
**Technology:** JWT (JSON Web Tokens) + HMAC-SHA256

**Process:**
```
1. User initiates share
2. System generates JWT with:
   - Patient ID (sub)
   - Expiry time (exp: 24h/7d/30d/never)
   - Permissions (view, download, print, email forward)
   - Recipient email (aud) - optional
   - One-time use flag (optional)
3. HMAC-SHA256 signature with server key
4. Link: https://aetos.health/share/{base64_encoded_jwt}
5. Recipient accesses without login required
6. Access logged in audit trail
```

**Share Link Security:**
- **TLS 1.3** for transmission
- **128-bit entropy** in random component
- **Token rotation** after each access (optional)
- **Rate limiting** (max 10 share links per patient per day)
- **Recipient whitelisting** (optional - only specified email can access)

**Expiry Options:**
- 24 hours (clinical staff, consultations)
- 7 days (specialist referrals)
- 30 days (insurance claims, family)
- Never (patient archives)

**Permissions Model:**
```
┌─────────────┬──────┬──────────┬───────┬────────┐
│ Permission  │ View │ Download │ Print │ Share  │
├─────────────┼──────┼──────────┼───────┼────────┤
│ View Only   │  ✓   │    ✗     │   ✗   │   ✗    │
│ Download    │  ✓   │    ✓     │   ✗   │   ✗    │
│ Print       │  ✓   │    ✓     │   ✓   │   ✗    │
│ Full Access │  ✓   │    ✓     │   ✓   │   ✓    │
└─────────────┴──────┴──────────┴───────┴────────┘
```

---

### 4.2 Email Sharing
**Process:**
1. User enters recipient email
2. System generates unique link (as above)
3. Email sent from `records@aetos.health` with:
   - Patient's name and consent (sent by: Raj Kumar Singh)
   - Subject: "Your Medical Records from Aetos Health"
   - Link to access records
   - Expiry warning
   - Instructions for recipient
4. Email headers include:
   - SPF, DKIM, DMARC verification
   - TLS encryption mandate
5. Patient receives copy of sent email (audit trail)

**Email Template:**
```
From: records@aetos.health
To: doctor@hospital.com
Subject: Medical Records - Raj Kumar Singh [SECURE]

Dear Doctor,

Raj Kumar Singh has shared his medical records with you for 
your review. Please access the records using the link below:

🔗 Access Records: https://aetos.health/share/JWT_TOKEN
   Expires: 20 September 2024
   Permissions: View, Download

The records include:
• 42 consultations (last 12 months)
• Complete prescription history
• Lab results
• Vital signs
• Diagnoses (ICD-10 coded)

Questions? Reply to this email or contact support@aetos.health

---
DPDPA 2023 Compliant | Encrypted Transfer | Audit Logged
```

---

### 4.3 SMS/WhatsApp Sharing
**Process:**
1. User enters recipient phone (with country code)
2. User selects channel: SMS or WhatsApp
3. System generates short link (bit.ly-style, 6-8 chars)
4. Message sent:
   - SMS: "Raj's health records: https://aetos.io/s/ABC123 [Expires 24h]"
   - WhatsApp: Same + Aetos Health branding + instructions

**SMS Compliance:**
- Message segmentation for long links
- DLT (Distributed Ledger Technology) registration for bulk SMS
- Recipient opt-in consent stored
- Telecom provider compliance (TRAI)

---

### 4.4 QR Code Sharing
**Implementation:**
```
QR Code Content:
https://aetos.health/share/{short_jwt}?qr=1

When scanned:
1. Auto-redirect to access page
2. No authentication required
3. Display summary on phone screen
4. Option to download full records
5. Expiry warning if < 24 hours

Typical Use Cases:
• Clinic visit: Patient scans at reception
• Insurance claim: QR on claim form
• Emergency ID card: Laminated wallet card
```

**QR Code Variants:**
- Standard QR (100×100 px minimum)
- Micro QR (smaller data)
- iQR (higher density)
- Color variant (Aetos blue + white)

---

### 4.5 FHIR Share to EHR Systems
**Direct Integration:**
1. User selects target hospital/clinic from dropdown
2. System shows hospital's FHIR endpoint (if integrated)
3. OAuth 2.0 authorization flow initiated
4. FHIR Bundle pushed to hospital's system
5. Confirmation email sent

**Supported Hospital Systems:**
- Epic (Enterprise)
- Cerner
- Medidata
- Allscripts
- OpenMRS
- Bahmni

---

## 5. DATA ENCRYPTION & SECURITY

### 5.1 Encryption Algorithm
- **Algorithm:** AES-256-GCM (Galois/Counter Mode)
- **Key derivation:** PBKDF2-SHA256 with 100,000 iterations
- **IV generation:** Random 96-bit, prepended to ciphertext
- **Authentication tag:** 128-bit (16 bytes)
- **Salt:** 32-byte random salt

**Key Derivation Function:**
```
DerivedKey = PBKDF2(
  hash=SHA256,
  password=user_password_or_generated,
  salt=random_32_bytes,
  iterations=100000,
  output_length=32_bytes
)

Encryption:
CipherText = AES256_GCM(
  plaintext=json_data,
  key=DerivedKey,
  iv=random_96_bits,
  aad=null
)

Stored format:
{
  "version": "1.0",
  "algorithm": "AES-256-GCM",
  "salt": "base64_encoded_32_bytes",
  "iv": "base64_encoded_12_bytes",
  "ciphertext": "base64_encoded_encrypted_data",
  "auth_tag": "base64_encoded_16_bytes"
}
```

### 5.2 Transport Security
- **TLS 1.3 minimum** for all data transmission
- **Certificate pinning** for Android/iOS apps
- **HSTS** (HTTP Strict-Transport-Security) enforced
- **CSP** (Content Security Policy) headers
- **X-Frame-Options: DENY** (clickjacking protection)

### 5.3 Data Deletion Policy
```
Retention Periods (DPDPA 2023 Compliance):

Export files (temporary):
├── Unencrypted: 24 hours
├── Encrypted with password: 7 days
└── Encrypted + sealed: User controlled

Share links:
├── Accessed: Deleted after expiry + 30 days
├── Not accessed: Deleted after expiry + 7 days
└── User-generated: Permanent until manual delete

Audit logs:
├── Access logs: 3 years
├── Export logs: 3 years
├── Share logs: 3 years
└── Deletion logs: 7 years (for compliance audit)

Deletion Method:
- Cryptographic erasure (key deletion)
- For sensitive data: Secure delete (Gutmann algorithm)
```

---

## 6. DATABASE SCHEMA

### Tables

#### consultations
```sql
CREATE TABLE consultations (
  id BIGINT PRIMARY KEY,
  patient_id BIGINT NOT NULL,
  doctor_id BIGINT NOT NULL,
  consultation_date TIMESTAMP NOT NULL,
  specialty VARCHAR(50) NOT NULL,
  type VARCHAR(50) NOT NULL,
  chief_complaint TEXT,
  clinical_notes TEXT,
  duration_minutes INT,
  status VARCHAR(20),
  fee DECIMAL(10,2),
  telehealth BOOLEAN,
  recording_available BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (doctor_id) REFERENCES doctors(id),
  INDEX idx_patient_date (patient_id, consultation_date DESC),
  INDEX idx_specialty (specialty)
);
```

#### export_events
```sql
CREATE TABLE export_events (
  id BIGINT PRIMARY KEY,
  patient_id BIGINT NOT NULL,
  format VARCHAR(20),  -- pdf, csv, json, fhir, hl7, summary
  file_name VARCHAR(255),
  file_size_bytes INT,
  encryption_method VARCHAR(30),
  filters_applied JSON,
  exported_records_count INT,
  export_timestamp TIMESTAMP DEFAULT NOW(),
  expiry_timestamp TIMESTAMP,
  
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  INDEX idx_patient_exports (patient_id, export_timestamp DESC)
);
```

#### share_events
```sql
CREATE TABLE share_events (
  id BIGINT PRIMARY KEY,
  patient_id BIGINT NOT NULL,
  share_type VARCHAR(20),  -- link, email, sms, qr, fhir
  recipient_identifier VARCHAR(255),  -- email/phone/system
  share_token VARCHAR(255) UNIQUE,
  expiry_timestamp TIMESTAMP,
  max_accesses INT,
  access_count INT DEFAULT 0,
  permissions JSON,
  shared_at TIMESTAMP DEFAULT NOW(),
  last_accessed_at TIMESTAMP,
  
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  INDEX idx_patient_shares (patient_id, shared_at DESC),
  INDEX idx_share_token (share_token)
);

CREATE TABLE share_accesses (
  id BIGINT PRIMARY KEY,
  share_event_id BIGINT NOT NULL,
  accessed_at TIMESTAMP DEFAULT NOW(),
  accessor_ip_hash VARCHAR(64),
  accessor_user_agent_hash VARCHAR(64),
  format_requested VARCHAR(20),
  
  FOREIGN KEY (share_event_id) REFERENCES share_events(id),
  INDEX idx_share_accesses (share_event_id)
);
```

#### audit_log
```sql
CREATE TABLE audit_log (
  id BIGINT PRIMARY KEY,
  patient_id BIGINT NOT NULL,
  action VARCHAR(50),  -- export, share, access, delete
  action_details JSON,
  timestamp TIMESTAMP DEFAULT NOW(),
  user_id BIGINT,
  ip_address_hash VARCHAR(64),
  user_agent_hash VARCHAR(64),
  
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  INDEX idx_patient_audit (patient_id, timestamp DESC),
  INDEX idx_action_audit (action, timestamp DESC)
);
```

---

## 7. REST API ENDPOINTS

### Export Endpoints

#### POST /api/v1/exports
**Create export**
```
POST /api/v1/exports HTTP/1.1
Content-Type: application/json
Authorization: Bearer {JWT_TOKEN}

{
  "format": "pdf",
  "date_from": "2024-01-01",
  "date_to": "2024-09-13",
  "specialty_filter": "general",
  "doctor_id": null,
  "include_fields": {
    "consultations": true,
    "prescriptions": true,
    "lab_results": true,
    "vital_signs": true
  },
  "encryption": {
    "enabled": true,
    "password": "optional_user_provided"
  },
  "title": "My Medical History 2024"
}

Response (200 OK):
{
  "export_id": "EX-20240913-ABC123",
  "format": "pdf",
  "status": "processing",
  "download_url": "https://aetos.health/exports/EX-20240913-ABC123",
  "expires_at": "2024-09-14T14:30:00Z",
  "estimated_file_size_mb": 2.5
}
```

#### GET /api/v1/exports/{export_id}
**Get export status**
```
Response (200 OK):
{
  "export_id": "EX-20240913-ABC123",
  "status": "completed",
  "format": "pdf",
  "file_size_bytes": 2621440,
  "created_at": "2024-09-13T14:00:00Z",
  "expires_at": "2024-09-14T14:00:00Z",
  "download_url": "https://aetos.health/exports/EX-20240913-ABC123",
  "download_count": 1
}
```

#### DELETE /api/v1/exports/{export_id}
**Delete export file immediately**
```
Response (204 No Content)
```

---

### Share Endpoints

#### POST /api/v1/shares
**Create share link**
```
{
  "export_id": "EX-20240913-ABC123",
  "expiry_type": "24h",  -- 24h, 7d, 30d, never
  "permissions": ["view", "download"],
  "recipient_email": "doctor@hospital.com",  -- optional
  "one_time_use": false,
  "max_accesses": null,
  "message": "Please review my recent consultations"
}

Response (201 Created):
{
  "share_id": "SH-20240913-XYZ789",
  "share_url": "https://aetos.health/share/eyJ0eXA....",
  "short_url": "https://aetos.io/s/ABC123",
  "qr_code_url": "https://aetos.health/qr/ABC123",
  "expires_at": "2024-09-14T14:30:00Z",
  "recipient_notified": true
}
```

#### POST /api/v1/shares/{share_id}/send-email
**Send share via email**
```
{
  "recipient_email": "doctor@hospital.com",
  "include_message": true,
  "message": "Please review my health records"
}

Response (200 OK):
{
  "share_id": "SH-20240913-XYZ789",
  "email_sent_at": "2024-09-13T14:05:00Z",
  "recipient_email": "doctor@hospital.com"
}
```

#### GET /api/v1/shares/{share_id}/analytics
**Get share analytics**
```
Response (200 OK):
{
  "share_id": "SH-20240913-XYZ789",
  "created_at": "2024-09-13T14:00:00Z",
  "expires_at": "2024-09-14T14:00:00Z",
  "max_accesses": null,
  "access_count": 3,
  "accesses": [
    {
      "accessed_at": "2024-09-13T14:15:00Z",
      "accessor_ip": "203.0.113.XXX",
      "format_requested": "pdf"
    }
  ],
  "status": "active"
}
```

---

## 8. COMPLIANCE & AUDIT

### 8.1 DPDPA 2023 Compliance
```
Requirement                          Implementation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Data minimization                     Only selected fields exported
Purpose limitation                    Export/share only for healthcare
Storage limitation                    Auto-delete after expiry
Consent                               Explicit opt-in per export/share
Transparency                          Export reasons + recipient listed
Data subject rights (DEAR)            
  ├─ Access                           GET /api/v1/patient/my-data
  ├─ Erasure                          DELETE /api/v1/exports/{id}
  ├─ Rectification                    PATCH /api/v1/records/{id}
  └─ Portability                      FHIR + JSON export formats
Security measures                     AES-256-GCM + TLS 1.3
Audit trail                           Complete logging (audit_log table)
Breach notification                   <72 hours per regulations
Data retention                        3-7 years as specified above
```

### 8.2 Audit Logging
Every action logged with:
- Timestamp (UTC)
- Patient ID
- Action type (export, share, access, delete)
- User/system identifier
- IP address (hashed SHA256)
- User agent (hashed SHA256)
- Result (success/failure)
- Additional context (format, recipient, etc.)

**Audit Trail Queries:**
```sql
-- All exports by patient
SELECT * FROM audit_log 
WHERE patient_id = ? AND action = 'export'
ORDER BY timestamp DESC;

-- All unauthorized access attempts
SELECT * FROM audit_log 
WHERE action = 'access' AND result = 'failed'
ORDER BY timestamp DESC;

-- Share activity for compliance
SELECT * FROM share_events 
WHERE patient_id = ? 
ORDER BY shared_at DESC;
```

---

## 9. INTEGRATION POINTS

### 9.1 ABDM Integration
- **M1/M2/M3 APIs:** FHIR export → ABDM gateway
- **Scan & Share:** QR code contains care context ID
- **Consent Manager:** Integration with NDHM CM for consent tracking

### 9.2 Hospital EHR Systems
- **Epic:** HL7 ADT + OBX export
- **Cerner:** FHIR STU3 bundles
- **OpenMRS:** Direct patient records push
- **Bahmni:** Encounter export format

### 9.3 Insurance Systems
- **TPA:** CSV export with claims mapping
- **IRDA:** Compliance report generation
- **Mediclaim portal:** Direct FHIR submission

---

## 10. PERFORMANCE SPECIFICATIONS

| Metric | Target | Measurement |
|--------|--------|-------------|
| Export PDF (100 records) | < 5 sec | P95 latency |
| Export CSV (1000 records) | < 10 sec | P95 latency |
| Export FHIR Bundle | < 8 sec | P95 latency |
| Share link generation | < 500 ms | P99 latency |
| Share link access | < 1 sec | P95 latency |
| File download (100 MB) | 10 Mbps | Sustained throughput |
| Encryption (10 MB file) | < 2 sec | Single-threaded |

---

## 11. TESTING SPECIFICATIONS

### Unit Tests
- Format conversion engines (PDF, CSV, JSON, FHIR, HL7)
- Encryption/decryption functions
- Filter logic
- Share token generation & validation

### Integration Tests
- End-to-end export workflow
- Email sending (mock)
- FHIR endpoint integration
- Database queries
- Audit logging

### Security Tests
- Token expiry validation
- AES-256-GCM encryption verification
- TLS 1.3 enforcement
- CORS policy validation
- SQL injection prevention
- XSS prevention

---

## 12. ROLLOUT PLAN

**Phase 1 (Week 1):** PDF + CSV export for beta users (100 patients)  
**Phase 2 (Week 2):** Email sharing + analytics  
**Phase 3 (Week 3):** JSON + FHIR exports, SMS/WhatsApp sharing  
**Phase 4 (Week 4):** HL7 export, EHR integrations, QR codes  
**Phase 5 (Ongoing):** Additional hospital integrations, advanced analytics

---

**Document Version:** 1.0  
**Last Updated:** 13 September 2026  
**Next Review:** 20 September 2026
