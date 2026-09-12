"""
Deterministic medication-safety rule engine.

This is the source of truth for every safety finding. The LLM (see main.py)
is only ever asked to phrase a finding this engine already produced — it is
never given the power to add or suppress a finding. Seed data below is a small
illustrative set; production seeds from a licensed Indian drug/interaction
database (see the project proposal, section 3.5 "Security, privacy and
compliance" and section 4 "Technology stack" — drug/interaction DB row).
"""
from dataclasses import dataclass
from typing import Literal

Severity = Literal["none", "caution", "contraindicated"]

# code -> set of codes it interacts with, and the clinical reason
INTERACTIONS: dict[str, dict[str, str]] = {
    "warfarin": {
        "aspirin": "Concurrent use significantly increases bleeding risk (both affect hemostasis).",
        "ibuprofen": "NSAIDs increase GI bleeding risk when combined with warfarin.",
    },
    "metformin": {
        "iodinated-contrast": "Risk of contrast-induced nephropathy and lactic acidosis.",
    },
    "sildenafil": {
        "nitroglycerin": "Concurrent use can cause severe, life-threatening hypotension.",
    },
}

# code -> allergy tags it should be flagged against (matched against patient allergy list)
ALLERGY_CROSS_REACTIVITY: dict[str, list[str]] = {
    "amoxicillin": ["penicillin", "beta-lactam"],
    "cefixime": ["penicillin", "cephalosporin"],
}


@dataclass
class SafetyResult:
    severity: Severity
    findings: list[str]


def check(
    new_medication_code: str,
    active_medication_codes: list[str],
    patient_allergies: list[str],
) -> SafetyResult:
    findings: list[str] = []
    severity: Severity = "none"

    new_code = new_medication_code.lower()

    # Interaction check (bidirectional)
    for active_code in active_medication_codes:
        active_code_l = active_code.lower()
        reason = INTERACTIONS.get(new_code, {}).get(active_code_l) or INTERACTIONS.get(active_code_l, {}).get(new_code)
        if reason:
            findings.append(f"Interaction with active medication '{active_code}': {reason}")
            severity = "contraindicated"

    # Allergy cross-reactivity check
    cross_tags = ALLERGY_CROSS_REACTIVITY.get(new_code, [])
    for allergy in patient_allergies:
        if allergy.lower() in [t.lower() for t in cross_tags]:
            findings.append(f"Patient has a documented '{allergy}' allergy; '{new_medication_code}' cross-reacts.")
            severity = "contraindicated"

    if not findings:
        return SafetyResult(severity="none", findings=[])
    return SafetyResult(severity=severity, findings=findings)
