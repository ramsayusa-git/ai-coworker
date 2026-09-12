/**
 * FHIR-lite resource shapes used across the Aetos One Clinics core and its add-ons.
 *
 * These are deliberately a *subset* of full FHIR R4 — enough structure to (a) map
 * cleanly onto real FHIR resources when talking to the ABDM adapter / OpenMRS FHIR2,
 * and (b) stay easy for the clinic UI and AI add-ons to read and write directly.
 * Every resource carries tenantId for row-level tenant isolation (see prisma schema).
 */
import { z } from 'zod';

export const ResourceMeta = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const PatientSchema = ResourceMeta.extend({
  resourceType: z.literal('Patient'),
  abhaNumber: z.string().optional(),
  abhaAddress: z.string().optional(),
  name: z.object({ given: z.string(), family: z.string().optional() }),
  gender: z.enum(['male', 'female', 'other', 'unknown']),
  birthDate: z.string().optional(),
  phone: z.string(),
  address: z
    .object({ line: z.string().optional(), district: z.string().optional(), state: z.string().optional(), pincode: z.string().optional() })
    .optional(),
  preferredLanguage: z.enum(['hi', 'en', 'te', 'ta', 'kn']).default('en'),
});
export type Patient = z.infer<typeof PatientSchema>;

export const AppointmentSchema = ResourceMeta.extend({
  resourceType: z.literal('Appointment'),
  patientId: z.string().uuid(),
  practitionerId: z.string().uuid(),
  start: z.string().datetime(),
  end: z.string().datetime().optional(),
  status: z.enum(['booked', 'checked-in', 'in-progress', 'completed', 'cancelled', 'no-show']),
  tokenNumber: z.number().int().optional(),
  triageScore: z.number().min(0).max(100).optional(), // written by the smart-queue add-on
});
export type Appointment = z.infer<typeof AppointmentSchema>;

export const ObservationSchema = ResourceMeta.extend({
  resourceType: z.literal('Observation'),
  encounterId: z.string().uuid(),
  patientId: z.string().uuid(),
  code: z.object({ system: z.enum(['loinc', 'snomed', 'local']), code: z.string(), display: z.string() }),
  valueString: z.string().optional(),
  valueQuantity: z.object({ value: z.number(), unit: z.string() }).optional(),
  source: z.enum(['staff', 'patient-intake', 'ai-scribe']).default('staff'),
});
export type Observation = z.infer<typeof ObservationSchema>;

export const ConditionSchema = ResourceMeta.extend({
  resourceType: z.literal('Condition'),
  encounterId: z.string().uuid(),
  patientId: z.string().uuid(),
  code: z.object({ system: z.enum(['icd10', 'snomed']), code: z.string(), display: z.string() }),
  clinicalStatus: z.enum(['active', 'resolved', 'recurrence']).default('active'),
});
export type Condition = z.infer<typeof ConditionSchema>;

export const MedicationRequestSchema = ResourceMeta.extend({
  resourceType: z.literal('MedicationRequest'),
  encounterId: z.string().uuid(),
  patientId: z.string().uuid(),
  medication: z.object({ code: z.string(), display: z.string(), salt: z.string().optional() }),
  dosage: z.object({ text: z.string(), frequency: z.string().optional(), durationDays: z.number().int().optional() }),
  status: z.enum(['draft', 'active', 'completed', 'stopped']),
  // Filled by the med-safety add-on before the prescription can move from draft -> active.
  safetyCheck: z
    .object({
      checkedAt: z.string().datetime(),
      severity: z.enum(['none', 'caution', 'contraindicated']),
      findings: z.array(z.string()),
    })
    .optional(),
});
export type MedicationRequest = z.infer<typeof MedicationRequestSchema>;

export const EncounterSchema = ResourceMeta.extend({
  resourceType: z.literal('Encounter'),
  patientId: z.string().uuid(),
  practitionerId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  status: z.enum(['planned', 'in-progress', 'finished', 'cancelled']),
  visitTemplateId: z.string().optional(),
  soapNote: z
    .object({
      subjective: z.string().optional(),
      objective: z.string().optional(),
      assessment: z.string().optional(),
      plan: z.string().optional(),
      generatedBy: z.enum(['staff', 'ai-scribe']).default('staff'),
    })
    .optional(),
});
export type Encounter = z.infer<typeof EncounterSchema>;

export const InvoiceSchema = ResourceMeta.extend({
  resourceType: z.literal('Invoice'),
  patientId: z.string().uuid(),
  encounterId: z.string().uuid().optional(),
  lineItems: z.array(z.object({ description: z.string(), amount: z.number(), code: z.string().optional() })),
  totalAmount: z.number(),
  status: z.enum(['draft', 'issued', 'paid', 'void']),
  paymentMethod: z.enum(['upi', 'razorpay', 'cash']).optional(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;
