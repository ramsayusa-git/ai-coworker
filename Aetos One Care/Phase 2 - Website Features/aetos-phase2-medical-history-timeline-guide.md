# Aetos Medical History Timeline - Feature Specification & Architecture

**Version:** 1.0  
**Date:** September 13, 2024  
**Status:** Phase 2 Implementation  
**Document Type:** Complete Technical Specification with Diagrams, Workflows, and APIs

---

## Table of Contents
1. System Overview & Vision
2. Medical History Architecture
3. Event Types & Data Model
4. Timeline Visualization System
5. Search, Filter & Export Capabilities
6. Database Schema & Storage Strategy
7. API Design & Endpoints
8. Security & Access Control
9. Compliance & Data Retention
10. Performance Metrics & Scalability
11. Rollout Plan & Timeline
12. Expected Outcomes

---

## 1. System Overview & Vision

### 1.1 Purpose
The Medical History Timeline provides patients with a comprehensive, chronological view of their complete medical journey. This single source of truth enables:

- **Complete Medical Record**: All consultations, diagnoses, tests, procedures, and prescriptions in one place
- **Event Tracking**: Visual timeline of medical events with dates, details, and attachments
- **Data Portability**: Export records in multiple formats (PDF, CSV, JSON)
- **Doctor Sharing**: Securely share medical history with healthcare providers
- **Pattern Recognition**: Identify health trends and medication interactions
- **Emergency Access**: Quick access to critical medical information
- **Compliance**: Full DPDPA 2023 compliance with data retention policies

### 1.2 Key Features

| Feature | Description | Use Case |
|---------|-------------|----------|
| **Chronological Timeline** | Events displayed in reverse chronological order | See medical journey over time |
| **Event Categorization** | 5 types: Consultation, Diagnosis, Lab Test, Procedure, Prescription | Quick filtering and identification |
| **Rich Event Details** | Full information cards with attachments and metadata | Access complete event data |
| **Multi-Filter System** | Filter by date, type, doctor, lab, severity | Find specific events quickly |
| **Search Functionality** | Full-text search across all event data | Search by symptom, medication, diagnosis |
| **Export Capabilities** | PDF, CSV, JSON formats with date range selection | Share and analyze data externally |
| **Attachment Management** | Store and retrieve medical documents, test reports, images | Keep all supporting documentation |
| **Doctor Integration** | Securely share with specific healthcare providers | Coordinate care across providers |
| **Analytics Dashboard** | Stats on event types, frequencies, trends | Understand health patterns |
| **Print Support** | Browser-based printing with formatted layout | Physical copies for offline use |

### 1.3 Event Categories & Metadata

#### Type 1: Consultation Events
```
Attributes:
├─ Doctor name & credentials
├─ Clinic/Hospital name
├─ Chief complaint & symptoms
├─ Examination findings
├─ Assessment & recommendations
├─ Follow-up instructions
├─ Duration of consultation
├─ Consultation fees
└─ Attachments: Consultation notes, vital signs report

Example:
{
  "type": "consultation",
  "date": "2024-09-10",
  "title": "Routine Checkup - Dr. Priya Kumar",
  "doctor": "Dr. Priya Kumar, MD (Internal Medicine)",
  "clinic": "Apollo Clinic, HSR Layout",
  "notes": "BP: 120/80 mmHg, Weight: 72kg. Overall excellent health."
}
```

#### Type 2: Diagnosis Events
```
Attributes:
├─ Diagnosis name
├─ ICD-10 code
├─ Severity level (Mild, Moderate, Severe)
├─ Onset date
├─ Associated symptoms
├─ Causative factors
├─ Prognosis
├─ Management plan
└─ Related consultations/prescriptions

Example:
{
  "type": "diagnosis",
  "date": "2024-08-15",
  "title": "Hypertension (Stage 1)",
  "icd10": "I10 - Essential Hypertension",
  "severity": "Mild",
  "doctor": "Dr. Rajesh Sharma"
}
```

#### Type 3: Lab Test Events
```
Attributes:
├─ Test name & type
├─ Lab name & location
├─ Test code/LOINC code
├─ Sample type
├─ Specimen collection date
├─ Test completion date
├─ Individual test results with normal ranges
├─ Overall interpretation
├─ Reference values
└─ Attachments: Lab report PDF, reference values

Example:
{
  "type": "lab",
  "date": "2024-08-28",
  "testName": "Complete Blood Count (CBC)",
  "lab": "Quick Labs, HSR Layout",
  "results": [
    { "parameter": "WBC", "value": "7.5 K/uL", "normal": "4.5-11.0" }
  ]
}
```

#### Type 4: Procedure Events
```
Attributes:
├─ Procedure name & type
├─ Procedure category (surgical, diagnostic, therapeutic)
├─ Performing doctor & credentials
├─ Facility name
├─ Pre-procedure preparations
├─ Procedure details & findings
├─ Post-procedure care instructions
├─ Complications (if any)
├─ Recovery timeline
└─ Attachments: Procedure notes, imaging, pathology reports

Example:
{
  "type": "procedure",
  "date": "2024-06-28",
  "title": "ECG (Electrocardiogram)",
  "procedureType": "Non-invasive Cardiac Assessment",
  "findings": "Normal sinus rhythm, no abnormalities"
}
```

#### Type 5: Prescription Events
```
Attributes:
├─ Medication name & strength
├─ Dosage & frequency
├─ Route of administration
├─ Quantity & refills
├─ Prescribed date & validity
├─ Prescribing doctor
├─ Pharmacy
├─ Indication (why prescribed)
├─ Side effects/Warnings
├─ Drug interactions
└─ Attachments: Prescription image, pharmacist notes

Example:
{
  "type": "prescription",
  "date": "2024-08-10",
  "medication": "Metoprolol Tartrate 50mg",
  "dosage": "One tablet twice daily",
  "duration": "30 days supply",
  "prescribedBy": "Dr. Rajesh Sharma"
}
```

---

## 2. Medical History Architecture

### 2.1 System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│           AETOS MEDICAL HISTORY TIMELINE SYSTEM                 │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   Web App    │         │ Mobile App   │         │ Doctor Portal│
│  (Frontend)  │         │  (Frontend)  │         │  (Read-only) │
└──────────────┘         └──────────────┘         └──────────────┘
       │                       │                         │
       └───────────────────────┼─────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   API Gateway       │
                    │  (Authentication)   │
                    └──────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
   ┌────▼────┐         ┌──────▼────────┐      ┌─────▼──────┐
   │Timeline │         │  Export        │      │  Search &  │
   │  REST   │         │  Service       │      │   Filter   │
   │  API    │         │ (PDF/CSV/JSON) │      │   Engine   │
   └────┬────┘         └────┬──────────┘      └─────┬──────┘
        │                   │                       │
        └───────────────────┼───────────────────────┘
                            │
                ┌───────────▼────────────┐
                │ Search Index           │
                │ (Elasticsearch/MeiliDB)│
                │ Full-text search      │
                └───────────┬────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   ┌────▼────┐       ┌─────▼──────┐      ┌────▼──────┐
   │PostgreSQL│       │ File Storage│      │Redis Cache│
   │(Events,  │       │ (Documents, │      │(Queries,  │
   │Metadata) │       │  PDFs, Images)    │ Results)  │
   └──────────┘       └─────────────┘      └───────────┘

External Services:
- AWS S3 (Archive storage)
- JWT Authentication
- SendGrid (Document sharing emails)
- Stripe (Paid export features - future)
```

### 2.2 Data Flow for Timeline Retrieval

```
User Opens Medical History App
        │
        ├─> Authentication (JWT token validation)
        │
        ├─> Request: GET /api/v1/medical-history/timeline
        │   Query params: 
        │   ├─ date_from=2024-01-01
        │   ├─ date_to=2024-12-31
        │   ├─ event_types=consultation,diagnosis,lab
        │   └─ limit=50
        │
        └─> Backend Processing
            │
            ├─ Query PostgreSQL
            │   SELECT * FROM medical_events
            │   WHERE user_id = ? AND date BETWEEN ? AND ?
            │   ORDER BY date DESC
            │   LIMIT 50
            │
            ├─ Fetch attachments from S3
            │   For each event with attachments:
            │   ├─ Get file metadata
            │   ├─ Generate secure download URLs
            │   └─ Cache URLs in Redis
            │
            ├─ Enrich event data
            │   ├─ Look up doctor details
            │   ├─ Resolve lab names
            │   ├─ Convert ICD-10 to descriptions
            │   └─ Add calculated fields
            │
            ├─ Apply access control
            │   ├─ Verify user owns records
            │   ├─ Check doctor sharing permissions
            │   └─ Redact sensitive fields if shared
            │
            ├─ Format response
            │   {
            │     "total_count": 150,
            │     "page": 1,
            │     "page_size": 50,
            │     "events": [...],
            │     "metadata": {...}
            │   }
            │
            └─> Return to Client
                │
                ├─ Parse JSON response
                ├─ Render timeline visualization
                ├─ Cache results locally
                └─ Display to user
```

---

## 3. Event Types & Data Model

### 3.1 Complete Event Data Model (SQL)

```sql
-- Core events table
CREATE TABLE medical_events (
    event_id UUID PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    event_type ENUM('consultation', 'diagnosis', 'lab', 'procedure', 'prescription'),
    event_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    
    -- Event metadata
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Common fields
    doctor_id VARCHAR(50),
    facility_id VARCHAR(50),
    notes TEXT,
    
    -- ICD/LOINC codes
    code_type ENUM('icd10', 'cpt', 'loinc'),
    code_value VARCHAR(50),
    
    -- Severity/Status
    severity ENUM('mild', 'moderate', 'severe', 'critical'),
    status ENUM('active', 'resolved', 'pending', 'archived'),
    
    -- Foreign keys
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id),
    FOREIGN KEY (facility_id) REFERENCES facilities(facility_id),
    
    INDEX idx_user_date (user_id, event_date DESC),
    INDEX idx_event_type (user_id, event_type),
    INDEX idx_code (code_type, code_value)
);

-- Consultation details
CREATE TABLE consultation_events (
    consultation_id UUID PRIMARY KEY,
    event_id UUID NOT NULL,
    
    chief_complaint TEXT,
    examination_findings TEXT,
    assessment TEXT,
    recommendations TEXT,
    follow_up_date DATE,
    follow_up_instructions TEXT,
    
    bp_systolic INT,
    bp_diastolic INT,
    pulse INT,
    temperature DECIMAL(5,2),
    weight DECIMAL(6,2),
    height DECIMAL(5,2),
    
    consultation_duration_mins INT,
    consultation_fees DECIMAL(10,2),
    
    FOREIGN KEY (event_id) REFERENCES medical_events(event_id)
);

-- Lab test details
CREATE TABLE lab_events (
    lab_id UUID PRIMARY KEY,
    event_id UUID NOT NULL,
    
    test_name VARCHAR(255),
    test_code VARCHAR(50),  -- LOINC code
    lab_name VARCHAR(255),
    
    specimen_type VARCHAR(100),
    collection_date TIMESTAMP,
    completion_date TIMESTAMP,
    
    overall_interpretation TEXT,
    reference_lab_url VARCHAR(500),
    
    FOREIGN KEY (event_id) REFERENCES medical_events(event_id)
);

-- Lab test results
CREATE TABLE lab_results (
    result_id UUID PRIMARY KEY,
    lab_id UUID NOT NULL,
    
    parameter_name VARCHAR(200),
    result_value VARCHAR(100),
    result_unit VARCHAR(50),
    normal_range_min VARCHAR(100),
    normal_range_max VARCHAR(100),
    is_abnormal BOOLEAN,
    
    FOREIGN KEY (lab_id) REFERENCES lab_events(lab_id),
    INDEX idx_lab (lab_id)
);

-- Diagnosis details
CREATE TABLE diagnosis_events (
    diagnosis_id UUID PRIMARY KEY,
    event_id UUID NOT NULL,
    
    diagnosis_name VARCHAR(255),
    icd10_code VARCHAR(20),
    severity ENUM('mild', 'moderate', 'severe'),
    onset_date DATE,
    resolution_date DATE,
    
    associated_symptoms TEXT,
    causative_factors TEXT,
    prognosis TEXT,
    management_plan TEXT,
    
    FOREIGN KEY (event_id) REFERENCES medical_events(event_id)
);

-- Prescription details
CREATE TABLE prescription_events (
    prescription_id UUID PRIMARY KEY,
    event_id UUID NOT NULL,
    
    medication_name VARCHAR(255),
    medication_strength VARCHAR(100),
    dosage_value DECIMAL(10,2),
    dosage_unit VARCHAR(50),  -- mg, ml, etc
    frequency VARCHAR(100),  -- twice daily, etc
    route ENUM('oral', 'injection', 'topical', 'inhalation'),
    
    quantity INT,
    refills_allowed INT,
    refills_used INT,
    
    start_date DATE,
    end_date DATE,
    indication TEXT,  -- why prescribed
    side_effects TEXT,
    drug_interactions TEXT,
    
    pharmacy_id VARCHAR(50),
    prescription_fees DECIMAL(10,2),
    
    FOREIGN KEY (event_id) REFERENCES medical_events(event_id)
);

-- Attachments for all events
CREATE TABLE event_attachments (
    attachment_id UUID PRIMARY KEY,
    event_id UUID NOT NULL,
    
    file_name VARCHAR(255),
    file_type VARCHAR(50),  -- pdf, jpg, png
    file_size BIGINT,
    
    s3_bucket VARCHAR(100),
    s3_key VARCHAR(500),
    
    upload_date TIMESTAMP,
    expiry_date TIMESTAMP,
    
    is_public BOOLEAN DEFAULT FALSE,
    
    FOREIGN KEY (event_id) REFERENCES medical_events(event_id),
    INDEX idx_event_attachments (event_id)
);
```

---

## 4. Timeline Visualization System

### 4.1 Timeline Rendering Architecture

```
Frontend Timeline Rendering

Data Source (API Response)
    │
    ├─> Parse events JSON
    │
    ├─> Sort by date (DESC)
    │
    ├─> Build timeline structure
    │   For each event:
    │   ├─ Create timeline-event div
    │   ├─ Add visual indicator (color-coded circle)
    │   ├─ Add event card with details
    │   ├─ Add attachments list
    │   └─ Add click handler for modal
    │
    ├─> Render to DOM
    │   ├─ Left vertical line connecting all events
    │   ├─ Event circles positioned on line
    │   ├─ Event cards to the right
    │   └─ Date labels
    │
    ├─> Apply styling
    │   ├─ Color coding by event type:
    │   │   ├─ Consultation: Blue (#3498db)
    │   │   ├─ Diagnosis: Red (#e74c3c)
    │   │   ├─ Lab: Purple (#9b59b6)
    │   │   ├─ Procedure: Orange (#f39c12)
    │   │   └─ Prescription: Teal (#1abc9c)
    │   │
    │   ├─ Hover effects
    │   └─ Animations
    │
    └─> Display to user

Example Timeline HTML Structure:

<div class="timeline">
  <div class="timeline::before">  <!-- vertical line -->
  
  <div class="timeline-event consultation">  <!-- event 1 -->
    <div class="timeline-event::before">  <!-- circle marker -->
    <div class="timeline-date">10 Sep 2024</div>
    <div class="event-card">
      <div class="event-header">
        <span class="event-type">CONSULTATION</span>
      </div>
      <div class="event-title">Routine Checkup - Dr. Priya Kumar</div>
      <div class="event-description">...</div>
    </div>
  </div>
  
  <div class="timeline-event lab">  <!-- event 2 -->
    ...
  </div>
</div>

Visual Result:
    Date
     │     Event Circle
     │        ●
     │    Event Card
     │    ┌─────────────────┐
     │    │ CONSULTATION    │
     │    │ Routine Checkup │
     │    └─────────────────┘
     │
     ├──────── Vertical Line
     │
     │        ●
     │    ┌─────────────────┐
     │    │ LAB             │
     │    │ Blood Test      │
     │    └─────────────────┘
     │
```

### 4.2 Interactive Features

```
User Interactions:

1. Click Event Card
   ├─ Open modal with full details
   ├─ Show rich information
   ├─ Display attachments
   ├─ Provide download links
   └─ Allow sharing/printing

2. Hover Over Event
   ├─ Highlight event card
   ├─ Expand details
   ├─ Show action buttons
   └─ Tooltip with date

3. Filter by Type
   ├─ Click category checkbox
   ├─ Re-render timeline
   ├─ Animate changes
   └─ Update counts

4. Search Events
   ├─ Type in search box
   ├─ Real-time filtering
   ├─ Highlight matches
   ├─ Show result count
   └─ Clear search with button

5. Date Range Selection
   ├─ Choose from/to dates
   ├─ Apply filters
   ├─ Show events in range
   └─ Update statistics
```

---

## 5. Search, Filter & Export Capabilities

### 5.1 Advanced Search & Filter System

#### Search Algorithm
```
Full-Text Search Implementation:

User Input: "thyroid medication results"

1. Tokenize: ["thyroid", "medication", "results"]

2. Search Across Fields:
   ├─ Event titles
   ├─ Event descriptions
   ├─ Doctor notes
   ├─ Lab parameters
   ├─ Medication names
   ├─ Diagnosis names
   ├─ ICD-10 codes
   └─ Attachments (OCR'd text)

3. Scoring Algorithm:
   ├─ Exact match: 100 points
   ├─ Title match: 80 points
   ├─ Description match: 50 points
   ├─ Notes match: 40 points
   ├─ Metadata match: 30 points
   └─ Partial match: 20 points

4. Rank Results by Score (Descending)

5. Return Top 20 Results

Example Search Results:
├─ Lab Event: "Thyroid Function Test" (Score: 100)
│  └─ Parameters: TSH 2.5 mIU/L, T3 110 ng/dL, T4 7.8 mcg/dL
│
├─ Prescription: "Levothyroxine 50mcg" (Score: 90)
│  └─ "For thyroid hormone replacement therapy"
│
└─ Consultation: "Follow-up for thyroid management" (Score: 85)
   └─ "Patient on thyroid medication, results improved"
```

#### Filter Combinations
```
Filter Options:

1. Event Type Filters
   ├─ Consultation ☑
   ├─ Diagnosis ☑
   ├─ Lab Test ☑
   ├─ Procedure ☑
   └─ Prescription ☑

2. Date Range
   ├─ From: [date picker]
   └─ To: [date picker]

3. Doctor Filter
   ├─ Dr. Priya Kumar
   ├─ Dr. Rajesh Sharma
   ├─ Dr. Vikram Singh
   └─ ...

4. Severity Filter (for diagnoses)
   ├─ Mild
   ├─ Moderate
   ├─ Severe
   └─ Critical

5. Lab Filter
   ├─ Quick Labs
   ├─ Apollo Diagnostics
   ├─ Metropolis Labs
   └─ ...

6. Status Filter (for prescriptions)
   ├─ Active
   ├─ Expired
   ├─ Discontinued
   └─ Pending

Example Filter Query:
SELECT * FROM medical_events me
JOIN consultation_events ce ON me.event_id = ce.event_id
WHERE me.user_id = 'USER-001'
  AND me.event_date BETWEEN '2024-01-01' AND '2024-12-31'
  AND me.event_type IN ('consultation', 'lab')
  AND me.doctor_id = 'DOC-045'
ORDER BY me.event_date DESC
```

### 5.2 Export Capabilities

#### Export Format 1: PDF Report
```
PDF Structure:

┌─────────────────────────────────────────┐
│  Medical History Report                 │
│  Patient: Ramsay Kumar                  │
│  Report Date: 13 September 2024         │
│  Report ID: RH-2024-0913-001            │
└─────────────────────────────────────────┘

[Table of Contents]

[Executive Summary]
├─ Total Events: 24
├─ Date Range: Jan 2024 - Sep 2024
├─ Event Distribution:
│  ├─ Consultations: 18
│  ├─ Lab Tests: 12
│  ├─ Diagnoses: 6
│  ├─ Procedures: 3
│  └─ Prescriptions: 32
└─ Active Diagnoses: Hypertension

[Detailed Timeline]
Each event includes:
├─ Date & type
├─ Title & description
├─ Full details
├─ Attachments (embedded)
└─ Doctor information

[Lab Results Summary]
├─ Most recent tests
├─ Abnormal findings highlighted
└─ Trends and comparisons

[Current Medications]
├─ Active prescriptions
├─ Dosage & frequency
├─ Start & end dates
└─ Interactions (if any)

[Active Diagnoses]
├─ Current conditions
├─ Severity levels
└─ Management plans

[Footer]
Generated: 13-Sep-2024 14:30 IST
Patient Signature: _____________
Doctor Review: _____________
```

#### Export Format 2: CSV Data
```
Column Headers:
Date, Event_Type, Title, Doctor, Facility, Details, Test_Name, Results, Medication, Dosage, ICD10, Attachments

Example Rows:
2024-09-10, Consultation, Routine Checkup, Dr. Priya Kumar, Apollo Clinic, "BP: 120/80, Good health", , , , , , consultation-note.pdf
2024-08-28, Lab, CBC Test, , Quick Labs, "Normal results", Complete Blood Count, "WBC: 7.5, RBC: 5.2", , , , cbc-report.pdf
2024-08-15, Diagnosis, Hypertension, Dr. Rajesh Sharma, Apollo Clinic, "Stage 1 hypertension", , , , , I10, 
2024-08-10, Prescription, Metoprolol Tartrate, Dr. Rajesh Sharma, , "50mg twice daily", , , Metoprolol 50mg, "One tablet twice daily", , 

Note: CSV format suitable for:
├─ Import into Excel/Google Sheets
├─ Analysis in data tools
├─ Backup and archival
└─ Sharing with spreadsheet-based workflows
```

#### Export Format 3: JSON Full Data
```json
{
  "export": {
    "version": "1.0",
    "generated_at": "2024-09-13T14:30:00Z",
    "patient": {
      "patient_id": "PAT-2024-001",
      "name": "Ramsay Kumar",
      "date_of_birth": "1992-05-15",
      "phone": "91-9876543210",
      "email": "ramsay@example.com"
    },
    "export_info": {
      "total_events": 24,
      "date_range": {
        "from": "2024-01-01",
        "to": "2024-09-13"
      },
      "included_types": ["consultation", "diagnosis", "lab", "procedure", "prescription"],
      "includes_attachments": true
    },
    "events": [
      {
        "event_id": "EVT-2024-001",
        "date": "2024-09-10",
        "type": "consultation",
        "title": "Routine Checkup",
        "doctor": {
          "name": "Dr. Priya Kumar",
          "specialization": "Internal Medicine",
          "license": "MCI-98765"
        },
        "clinic": "Apollo Clinic, HSR Layout",
        "details": {
          "chief_complaint": "Regular checkup",
          "findings": "Normal vitals, good health",
          "notes": "BP: 120/80, Pulse: 72, Weight: 72kg"
        },
        "attachments": [
          {
            "file_name": "consultation-note.pdf",
            "file_type": "pdf",
            "size_kb": 256
          }
        ]
      }
    ],
    "compliance": {
      "dpdpa_version": "2023",
      "data_protection": "AES-256 encrypted",
      "data_retention": "Indefinite (user controlled)",
      "data_deletion_url": "https://aetos.com/settings/data-deletion"
    }
  }
}
```

---

## 6. Database Schema & Storage Strategy

### 6.1 Complete Schema with Indexes

```sql
-- Users table (reference)
CREATE TABLE users (
    user_id VARCHAR(50) PRIMARY KEY,
    email VARCHAR(100) UNIQUE,
    phone VARCHAR(20),
    name VARCHAR(255),
    date_of_birth DATE,
    gender ENUM('M', 'F', 'O'),
    blood_group VARCHAR(10),
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    
    INDEX idx_email (email),
    INDEX idx_phone (phone)
);

-- Doctors table
CREATE TABLE doctors (
    doctor_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(100),
    phone VARCHAR(20),
    specialization VARCHAR(255),
    license_number VARCHAR(50),
    registration_number VARCHAR(50),
    clinic_id VARCHAR(50),
    bio TEXT,
    rating DECIMAL(3,2),
    is_verified BOOLEAN
);

-- Facilities (clinics, labs, hospitals)
CREATE TABLE facilities (
    facility_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255),
    facility_type ENUM('clinic', 'hospital', 'lab', 'diagnostic_center'),
    address TEXT,
    phone VARCHAR(20),
    email VARCHAR(100),
    website VARCHAR(500),
    is_verified BOOLEAN,
    rating DECIMAL(3,2)
);

-- Medical events (main table)
CREATE TABLE medical_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(50) NOT NULL,
    event_type ENUM('consultation', 'diagnosis', 'lab', 'procedure', 'prescription') NOT NULL,
    event_date DATE NOT NULL,
    
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    doctor_id VARCHAR(50),
    facility_id VARCHAR(50),
    
    severity ENUM('mild', 'moderate', 'severe', 'critical'),
    status ENUM('active', 'resolved', 'pending', 'archived') DEFAULT 'active',
    
    code_type ENUM('icd10', 'cpt', 'loinc', 'atc'),
    code_value VARCHAR(50),
    
    notes TEXT,
    is_private BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id),
    FOREIGN KEY (facility_id) REFERENCES facilities(facility_id),
    
    INDEX idx_user_date (user_id, event_date DESC),
    INDEX idx_user_type (user_id, event_type),
    INDEX idx_user_status (user_id, status),
    INDEX idx_code (code_type, code_value),
    INDEX idx_created (user_id, created_at DESC)
);

-- Event-specific details tables (as shown in section 3.1)
-- consultation_events, lab_events, diagnosis_events, etc.

-- Attachments
CREATE TABLE event_attachments (
    attachment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50),
    file_size BIGINT,
    mime_type VARCHAR(100),
    
    s3_bucket VARCHAR(100),
    s3_key VARCHAR(500),
    
    file_hash VARCHAR(64),  -- SHA-256
    
    uploaded_by VARCHAR(50),
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_public BOOLEAN DEFAULT FALSE,
    expiry_date TIMESTAMP,
    
    FOREIGN KEY (event_id) REFERENCES medical_events(event_id),
    INDEX idx_event_attachments (event_id),
    INDEX idx_upload_date (upload_date DESC)
);

-- Access logs (HIPAA compliance)
CREATE TABLE medical_record_access_logs (
    log_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_id UUID,
    user_id VARCHAR(50),
    access_type ENUM('view', 'download', 'share', 'export'),
    access_ip VARCHAR(45),
    access_device VARCHAR(255),
    access_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration_seconds INT,
    
    FOREIGN KEY (event_id) REFERENCES medical_events(event_id),
    INDEX idx_event_access (event_id, access_timestamp DESC),
    INDEX idx_user_access (user_id, access_timestamp DESC)
);

-- Search index table (for Elasticsearch sync)
CREATE TABLE medical_events_search_index (
    search_id UUID PRIMARY KEY,
    event_id UUID NOT NULL,
    user_id VARCHAR(50),
    
    full_text TEXT,  -- Combined searchable content
    event_type VARCHAR(50),
    event_date DATE,
    
    last_indexed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_event_search (event_id),
    INDEX idx_user_search (user_id)
);
```

### 6.2 Data Retention & Archival Strategy

```
Data Lifecycle:

Active Period (0-2 years):
├─ Storage: Hot storage (PostgreSQL, SSD)
├─ Access: Instant (< 100ms)
├─ Replicas: 3 (high availability)
├─ Backups: Daily
└─ Cost: $X per month

Warm Period (2-5 years):
├─ Storage: Warm storage (Glacier)
├─ Access: 5-10 minutes
├─ Replicas: 1
├─ Backups: Weekly
└─ Cost: $Y per month (lower)

Cold Period (5+ years):
├─ Storage: Cold storage (Deep Archive)
├─ Access: 12 hours
├─ Replicas: 1
├─ Backups: Monthly
└─ Cost: $Z per month (lowest)

Archive on User Request:
├─ Move to S3 Glacier Deep Archive
├─ Retain for 7 years (HIPAA requirement)
├─ After 7 years: Secure deletion
└─ Provide deletion certificate

Retention Rules:
├─ Active diagnoses: Indefinite (user-controlled)
├─ Resolved events: 7 years
├─ Lab results: 7 years (regulatory)
├─ Prescriptions: 3 years (regulatory)
├─ Access logs: 6 years (audit)
└─ Deleted records: 30-day soft delete, then purge
```

---

## 7. API Design & Endpoints

### 7.1 REST API Endpoints

#### 1. Get Medical History Timeline
```
GET /api/v1/medical-history/timeline

Query Parameters:
├─ date_from: "2024-01-01" (optional)
├─ date_to: "2024-12-31" (optional)
├─ event_types: "consultation,diagnosis,lab" (comma-separated)
├─ limit: 50
├─ offset: 0
└─ sort: "date" (date, -date, type)

Response (200 OK):
{
  "success": true,
  "data": {
    "total_count": 150,
    "page_count": 3,
    "current_page": 1,
    "page_size": 50,
    "events": [
      {
        "event_id": "EVT-2024-001",
        "date": "2024-09-10",
        "type": "consultation",
        "title": "Routine Checkup - Dr. Priya Kumar",
        "description": "Regular annual physical examination",
        "doctor": {
          "id": "DOC-045",
          "name": "Dr. Priya Kumar",
          "specialization": "Internal Medicine"
        },
        "severity": null,
        "status": "active",
        "attachments_count": 2,
        "created_at": "2024-09-10T10:30:00Z"
      }
    ],
    "filters_applied": {
      "date_range": ["2024-01-01", "2024-12-31"],
      "event_types": ["consultation", "diagnosis", "lab"]
    }
  }
}
```

#### 2. Get Event Details
```
GET /api/v1/medical-history/events/{event_id}

Response (200 OK):
{
  "success": true,
  "data": {
    "event_id": "EVT-2024-001",
    "date": "2024-09-10",
    "type": "consultation",
    "title": "Routine Checkup",
    "description": "Regular annual physical examination",
    "doctor": {
      "id": "DOC-045",
      "name": "Dr. Priya Kumar",
      "specialization": "Internal Medicine",
      "license": "MCI-98765",
      "contact": "9876543210"
    },
    "clinic": {
      "id": "FLC-101",
      "name": "Apollo Clinic, HSR Layout",
      "address": "123 Main Street, HSR Layout, Bangalore"
    },
    "consultation_details": {
      "chief_complaint": "Routine checkup",
      "findings": "Normal vitals, good health",
      "notes": "BP: 120/80, Pulse: 72, Weight: 72kg",
      "recommendations": "Continue current lifestyle",
      "follow_up_date": "2025-09-10",
      "vitals": {
        "bp": "120/80",
        "pulse": 72,
        "weight": 72,
        "height": 180
      }
    },
    "attachments": [
      {
        "id": "ATT-001",
        "name": "consultation-note.pdf",
        "type": "pdf",
        "size_kb": 256,
        "download_url": "https://aetos.com/api/v1/attachments/ATT-001/download",
        "view_url": "https://aetos.com/api/v1/attachments/ATT-001/preview"
      }
    ],
    "sharing": {
      "shared_with": ["DOC-045"],
      "shared_date": "2024-09-10",
      "can_revoke": true
    }
  }
}
```

#### 3. Search Medical History
```
GET /api/v1/medical-history/search

Query Parameters:
├─ q: "thyroid medication" (search query)
├─ limit: 20
└─ offset: 0

Response (200 OK):
{
  "success": true,
  "data": {
    "query": "thyroid medication",
    "total_results": 5,
    "results": [
      {
        "event_id": "EVT-2024-005",
        "type": "lab",
        "title": "Thyroid Function Test",
        "match_score": 95,
        "match_fields": ["title", "parameters"],
        "snippet": "...Thyroid Function Test with TSH, T3, T4 levels showing normal..."
      }
    ]
  }
}
```

#### 4. Export Medical History
```
POST /api/v1/medical-history/export

Request:
{
  "format": "pdf",  // pdf, csv, json
  "date_from": "2024-01-01",
  "date_to": "2024-12-31",
  "event_types": ["consultation", "diagnosis", "lab"],
  "include_attachments": true,
  "include_analysis": true
}

Response (202 Accepted):
{
  "success": true,
  "data": {
    "export_id": "EXP-2024-001",
    "status": "processing",
    "format": "pdf",
    "estimated_size_mb": 15,
    "estimated_ready_time_mins": 2,
    "download_url": "https://aetos.com/api/v1/exports/EXP-2024-001/download",
    "expires_at": "2024-09-20T14:30:00Z"
  }
}
```

#### 5. Share Medical History with Doctor
```
POST /api/v1/medical-history/share

Request:
{
  "doctor_id": "DOC-045",
  "event_ids": ["EVT-2024-001", "EVT-2024-005"],
  "message": "Please review my recent test results",
  "expiry_days": 30
}

Response (200 OK):
{
  "success": true,
  "data": {
    "share_id": "SHARE-2024-001",
    "doctor": {
      "id": "DOC-045",
      "name": "Dr. Priya Kumar"
    },
    "events_shared": 2,
    "shared_at": "2024-09-13T14:30:00Z",
    "expires_at": "2024-10-13T14:30:00Z",
    "access_link": "https://aetos.com/share/SHARE-2024-001",
    "can_revoke": true
  }
}
```

---

## 8. Security & Access Control

### 8.1 Authentication & Authorization

```
Access Control Model:

1. User Access
   ├─ Owns all their medical records
   ├─ Can view, edit, delete events
   ├─ Can share with doctors
   ├─ Can export data
   └─ Cannot access others' records

2. Doctor Access
   ├─ Can view only shared records
   ├─ Can add new events (consultation, prescription)
   ├─ Can view access logs
   ├─ Can revoke permissions
   └─ Read-only on past events (audit trail)

3. Admin Access
   ├─ Can view anonymized aggregates
   ├─ Can support user issues
   ├─ Can audit access logs
   ├─ Cannot access individual records
   └─ Can enforce compliance

4. System Access
   ├─ Background jobs for archival
   ├─ Notification services
   ├─ Search indexing
   └─ Backup services

Authentication Method:
├─ JWT tokens with 1-hour expiry
├─ Refresh tokens with 30-day expiry
├─ 2FA for sensitive operations
├─ API keys for service accounts
└─ OAuth 2.0 for doctor integrations

Authorization Checks:
For every API call:
├─ Validate JWT signature
├─ Check user identity
├─ Verify resource ownership
├─ Check sharing permissions
└─ Log access attempt
```

### 8.2 Data Security

```
Encryption Strategy:

1. In Transit
   ├─ TLS 1.3 for all HTTPS
   ├─ 256-bit cipher suites
   ├─ Certificate pinning on mobile
   └─ HSTS headers enforced

2. At Rest
   ├─ AES-256 encryption for all PII
   ├─ Encrypted database backups
   ├─ Encrypted S3 files
   ├─ Key management with AWS KMS
   └─ Key rotation every 90 days

3. Database Security
   ├─ Row-level security (RLS) policies
   ├─ Encrypted sensitive columns
   ├─ Parameterized queries
   ├─ SQL injection prevention
   └─ Audit triggers on sensitive tables

4. API Security
   ├─ Rate limiting (100 req/min per user)
   ├─ Input validation & sanitization
   ├─ SQL injection prevention
   ├─ XSS protection
   ├─ CSRF tokens
   └─ API key rotation

5. File Security
   ├─ Virus scanning on upload
   ├─ File type validation
   ├─ Size limits (100MB max)
   ├─ Secure deletion on removal
   └─ Quarantine of suspicious files
```

---

## 9. Compliance & Data Retention

### 9.1 DPDPA 2023 Compliance

```
Data Subject Rights:

1. Right to Access
   ├─ User can download all personal data
   ├─ Available in JSON format
   ├─ Includes all historical data
   ├─ Response time: 30 days max
   └─ Export includes: Events, attachments, access logs

2. Right to Rectification
   ├─ Users can correct inaccurate data
   ├─ Automatic versioning of changes
   ├─ Audit trail of modifications
   └─ Notification to shared doctors

3. Right to Erasure
   ├─ User can request complete deletion
   ├─ Soft delete after 30-day review period
   ├─ Permanent deletion after 30 days
   ├─ Access logs retained for 6 years
   └─ Compliance certificate provided

4. Right to Data Portability
   ├─ Export in standard formats (PDF, CSV, JSON)
   ├─ FHIR-compliant XML export option
   ├─ Multiple formats supported
   └─ No restrictions on data transfer

5. Right to Restrict Processing
   ├─ User can restrict sharing
   ├─ Can pause doctor access
   ├─ Can revoke sharing permissions
   └─ Can disable export functionality

Data Retention Policy:

Active Records:
├─ Retained indefinitely (user-controlled)
├─ Stored in PostgreSQL
├─ Accessible within seconds
└─ Regular backups

Resolved/Archived Records:
├─ Retained for 7 years (HIPAA + DPDPA)
├─ Moved to cold storage after 2 years
├─ Access time: 5-10 minutes
└─ Cheaper storage costs

After 7 Years:
├─ Secure deletion initiated
├─ Cryptographic erasure
├─ Deletion certificate issued
└─ No recovery possible

Consent Management:
├─ Explicit consent for each sharing
├─ Revocable at any time
├─ Audit trail of consents
├─ Consent expiry dates enforced
└─ Regular re-confirmation (annual)
```

---

## 10. Performance Metrics & Scalability

### 10.1 Performance Targets

```
API Response Times (p95):
├─ Get timeline: < 200ms (cached)
├─ Get event details: < 150ms
├─ Search events: < 500ms
├─ Export (initiate): < 1000ms
├─ Share event: < 500ms
└─ Upload attachment: < 5000ms

Database Performance:
├─ Timeline query: < 100ms (avg)
├─ Event lookup: < 50ms (avg)
├─ Search query: < 300ms (avg)
├─ Index size: < 1GB (for 1M events)
└─ Query parallelization: 4 workers

Scalability Targets:
├─ Users: 1M+ active users
├─ Events per user: 500+
├─ Total events: 500M+
├─ Concurrent users: 10,000+
├─ API requests/sec: 100,000+
└─ Storage: 500GB+ (compressed)

Optimization Techniques:
├─ Database indexing on user_id, event_date
├─ Redis caching (1-hour TTL)
├─ Elasticsearch for full-text search
├─ CDN for attachment delivery
├─ Database connection pooling
└─ Asynchronous export jobs
```

---

## 11. Rollout Plan & Timeline

### 11.1 4-Week Implementation Plan

**Week 1: Foundation & Core Features**
- Days 1-2: Database schema creation, table setup
- Days 3-4: Core API endpoints (get timeline, get event details)
- Days 5-7: Frontend timeline rendering, filtering
- Testing: Unit tests, schema validation

**Week 2: Search & Advanced Features**
- Days 8-9: Search implementation (Elasticsearch setup)
- Days 10-11: Export functionality (PDF/CSV/JSON)
- Days 12-14: Doctor sharing & access control
- Testing: Integration tests, search accuracy

**Week 3: Security & Compliance**
- Days 15-16: Encryption setup, AES-256 implementation
- Days 17-18: Access logging, audit trail
- Days 19-21: DPDPA compliance checks, data deletion flow
- Testing: Security audit, penetration testing

**Week 4: Launch & Optimization**
- Days 22-23: Performance optimization, caching setup
- Days 24-25: Load testing (1M events, 10K concurrent users)
- Days 26-28: Gradual rollout (10% → 50% → 100%)
- Testing: UAT, real-world usage monitoring

---

## 12. Expected Outcomes

### 12.1 Key Performance Indicators

| Metric | Target | Impact |
|--------|--------|--------|
| Timeline Load Time | < 2 sec | User satisfaction |
| Search Accuracy | 95%+ | Quick event discovery |
| Export Success Rate | 99%+ | Data portability trust |
| Doctor Share Adoption | 40%+ | Care coordination |
| Data Access Compliance | 100% | Legal compliance |
| User Retention | +20% | Feature stickiness |

### 12.2 Success Criteria

✓ Launch Success: All features working, zero critical bugs
✓ Month 1: 75%+ feature adoption among users
✓ Month 3: 90%+ user adoption of timeline view
✓ Compliance: 100% DPDPA 2023 compliance verified
✓ Performance: API response times meet targets

---

**Document Control:**
- Version: 1.0
- Status: Final - Ready for Implementation
- Author: Aetos Medical Hub Dev Team
- Last Updated: September 13, 2024
