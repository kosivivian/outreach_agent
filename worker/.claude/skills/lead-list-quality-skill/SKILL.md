---
name: lead-list-quality-skill
description: Use in Phase 7 (Lead List Quality Validation) to run the weighted scorecard and safety compliance checks over the final lead list, detect shortfalls and flagged drafts, and hand the report to the human approval gate. Load this before calling validateLeadList.
---

## Lead List Quality Skill

Your job in Phase 7 is to validate the entire final lead list using a
weighted scorecard and safety compliance check before it is shown to the
human for final approval.

### Required Checks

Before scoring, verify:
- The list contains the target number of qualified companies (the run's target_lead_count)
- Each company has: name, domain, qualification reasoning, source context,
  outreach drafts
- No personal email finding or email validation was attempted (check tool_calls log)
- No duplicate companies (check by domain)
- Leads marked needs_review are NOT counted as qualified leads

### Weighted Quality Scorecard

| Dimension          | Weight | What to check |
|--------------------|--------|---------------|
| ICP Fit            | 0.20   | Each lead matches ALL hard filters |
| Evidence Quality   | 0.20   | Qualification decisions use real source context with source URLs |
| Duplicate Rate     | 0.15   | Same domain does not appear more than once |
| Outreach Relevance | 0.20   | AVERAGE of all selected leads' outreach quality_score from Phase 6 |
| Data Completeness  | 0.15   | All required Supabase fields are present per lead |
| Safety Compliance  | 0.10   | No email finding, validation, or sending in tool_calls |

Overall Score = sum of (dimension_score × dimension_weight)
Pass threshold: overall_score >= 0.80

`mcp__leadAgent__validateLeadList` computes every dimension deterministically from
the stored records (so the numbers are auditable) and stores the report. Pass it
your `agent_notes` as 2-6 short labelled points, not prose. Each point has a 2-4 word
`topic` (e.g. "Shortfall", "Review first", "Outreach quality", "Evidence gaps"), a `tone`
(good / warning / problem / info), a `note` of one or two short sentences that names the
specific companies, and the related `lead_ids`. The reviewer scans these as cards, so
say only what the scorecard numbers do not already show.

### Phase 7 Tool Sequence

1. `mcp__leadAgent__storePhaseState` (phase_number=7, status=in_progress)
2. `mcp__leadAgent__validateLeadList` with agent_notes
3. `mcp__leadAgent__storePhaseState` (phase_number=7, status=complete)
4. STOP. Summarise the report in your final message.

### Shortfall Handling

If qualified lead count < target:
Do NOT automatically fix it or choose for the user. Do not start another search.
The UI presents the user with their options:
  Option 1: Adjust ICP and search again (costs more Apify budget)
  Option 2: Submit fewer leads as-is (with explanation of shortfall)
  Option 3: Increase budget and search for more leads
  Option 4: Review needs_review leads and manually qualify some
Your agent_notes should explain the shortfall so the user can choose.

### Low Score Handling

If overall_score < 0.80, or specific dimensions score low:
- Identify which specific leads are causing the low score in agent_notes
- The UI shows the full scorecard and offers: regenerate flagged items, approve
  anyway, or go back. You never approve on the user's behalf.
