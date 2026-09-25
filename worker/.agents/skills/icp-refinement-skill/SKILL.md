---
name: icp-refinement-skill
description: Use in Phase 1-2 (ICP Refinement) to turn the user's qualification objective into a structured ICP criteria object with hard filters, soft preferences, disqualifiers and inferred fields, then store it for user review with a cost estimate. Load this before calling refineICP.
---

## ICP Refinement Skill

Your job in Phase 1 is to convert the user's qualification objective into a
structured ICP criteria object before any company search begins.

### Minimum Criteria To Populate

Always populate ALL of the following fields:
- target_company_type (B2B, B2C, etc)
- industries (array — be specific, e.g. ["B2B SaaS", "HR Tech"])
- geography (array of countries or regions)
- headcount_range ({ min: number, max: number })
- buyer_persona (who you are targeting at the company)
- business_problem (what problem they likely have)
- hard_filters (constraints that MUST be true for a lead to qualify)
- soft_preferences (nice-to-have signals — do NOT auto-disqualify if missing)
- disqualifiers (automatic exclusions)

### Hard Filters vs Soft Preferences

Hard filters MUST ALL be true for a lead to be considered qualified.
Examples of hard filters:
- Country must be United States
- Company must be B2B
- Headcount must be between 10 and 100

Soft preferences improve fit but must NOT automatically disqualify.
Examples of soft preferences:
- Recently hiring operations roles
- Uses tools that may connect to automation workflows
- Publishes content about scaling

Do not treat every user preference as a hard filter. Only constraints the user
stated as requirements (or that are unavoidable, like company type) are hard filters.

### Gap Filling Rules

- If the user was specific (gave exact values), preserve them exactly.
  Do NOT reinterpret or loosen specific constraints.
- If the user was vague, infer sensible defaults and clearly mark each
  inferred field (add the field name to `inferred_fields`) so the user can review it.
- Sensible defaults for Koya Talent (AI automation assistants for early-stage teams):
  B2B, 10-100 employees, founders / operations leads / agency owners, teams with
  repetitive operational workflows.
- Keep the ICP narrow enough to search, but not so narrow that no leads can be found.
- Never ask for clarification mid-run. Make your best inference and show the user
  what you inferred so they can edit before proceeding.
- The number of leads is NOT part of the ICP. It is fixed on the run record by the
  user. Ignore any lead count mentioned in the objective — the tools enforce the
  run record's count.

### Output Format

Always produce this exact JSON structure (pass it as `refined_icp` to refineICP):
{
  "target_company_type": "",
  "industries": [],
  "geography": [],
  "headcount_range": { "min": 0, "max": 0 },
  "buyer_persona": "",
  "business_problem": "",
  "hard_filters": [],
  "soft_preferences": [],
  "disqualifiers": [],
  "inferred_fields": []
}

### Phase 1-2 Tool Sequence

1. `mcp__leadAgent__storePhaseState` (phase_number=1, status=in_progress)
2. Reason over the objective using the rules above.
3. `mcp__leadAgent__refineICP` with the ICP object.
4. `mcp__leadAgent__calculateCostEstimate` to get the itemised cost preview.
5. `mcp__leadAgent__checkApifyBalance` to verify funds.
6. `mcp__leadAgent__storePhaseState` (phase_number=1, status=complete, checkpoint_data
   with a short summary).

### After Generating ICP

Then STOP and wait. Do NOT proceed to Phase 3 until the user has reviewed,
edited if needed, and approved the ICP + cost estimate.
The user's confirmation of the ICP review screen IS the trigger to proceed —
it starts a new session. End your turn with a one-paragraph summary of the ICP.
