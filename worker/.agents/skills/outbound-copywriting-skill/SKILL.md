---
name: outbound-copywriting-skill
description: Use in Phase 6 (Outreach Copywriting) to write a personalised 3-email cold sequence plus a LinkedIn message for each selected qualified lead, self-score it on the 5-point quality checklist, and regenerate low-scoring drafts. Load this before calling qualityCheckOutreach or generateOutreach.
---

## Outbound Copywriting Skill

Your job in Phase 6 is to generate personalized, review-ready cold outreach
for each qualified lead. Only generate copy for leads with status = "qualified"
AND `selected = true` (the top leads within the user's target count —
`mcp__leadAgent__listRunLeads` with filter "needs_outreach" returns exactly these).

### Required Output Per Lead

For each lead, generate:
1. Email 1 (subject, body, cta, personalization_note, source_url)
2. Email 2 (subject, body, cta, personalization_note, source_url)
3. Email 3 (subject, body, cta, personalization_note, source_url)
4. LinkedIn message (message, source_url)

### Email Sequence Structure

EMAIL 1 — Cold Open:
- Open with a relevant observation from their website/source context
- Connect the observation to the problem Koya's offer solves
- Ask a low-pressure, single question as your CTA
- Keep it under 100 words

EMAIL 2 — Second Angle:
- Add a different relevant angle (workflow bottleneck, scaling challenge,
  operational pattern, hiring signal)
- Connect to Koya's offer from a new direction
- One clear CTA
- Keep it under 80 words

EMAIL 3 — Brief Follow-Up:
- Short and direct (under 50 words)
- Invite a reply even if timing or fit is wrong
- No pressure

LINKEDIN MESSAGE:
- Shorter and more conversational than emails
- Reference one specific company detail
- Under 60 words

### Personalization Rules

GOOD personalization references real evidence:
- Website positioning or product category
- Audience they serve
- Hiring or scaling signal
- Public workflow or operational clue from their site

BAD personalization is vague:
- "Loved what you are building"
- "Your company looks impressive"
- "I saw your website"

Every email and LinkedIn message MUST include at least one real,
specific company detail traceable to source_url. `source_url` must be one of the
lead's `source_urls` from getLeadContext. Do not invent details about the company.
Do not include any email addresses or phone numbers. Use a neutral greeting
("Hi there," or "Hi {{first_name}},") — never guess a person's name.

### Campaign Settings to Apply

Use the campaign settings injected in your system prompt:
- Tone: apply to all copy (professional = formal, direct = concise, friendly = warm)
- Offer: this is Koya's specific pitch for this campaign — reference it naturally
- Target Persona: write to this person's perspective and concerns
- Additional Context: apply any extra constraints or style notes

### Quality Check (Self-Evaluate Before Storing)

For each lead:
1. Get context with `mcp__leadAgent__getLeadContext`.
2. Draft the copy.
3. Call `mcp__leadAgent__qualityCheckOutreach` with the drafts. It returns
   deterministic lint (word counts, banned hype phrases, source_url validity,
   contact details present).
4. Answer these 5 questions honestly, using the lint results as input:
   1. Does each email mention a real, company-specific detail?
   2. Can each claim be traced to a source URL?
   3. Is the CTA clear?
   4. Is the tone calm and credible? (No fake urgency, no exaggeration, no "!!!",
      no "AMAZING", no "LIMITED TIME")
   5. Would a human want to review this before sending? (i.e. it is ready for review)

Score 0.0 to 1.0 (1 point per question = 0.2 each). Any failed lint check means the
related question fails.

5. Call `mcp__leadAgent__generateOutreach` with the drafts, quality_score,
   quality_check_results and `attempt` (1, 2 or 3).

If score < 0.75:
- Regenerate automatically (up to 2 more attempts, attempt=2 then attempt=3)
- If still < 0.75 after the regenerations, the tool sets
  flagged_for_phase_seven_review = true
- The tool keeps the best-scoring attempt, so always submit every attempt.

Batch: work through up to 4 leads, then continue with the next 4.
Call `mcp__leadAgent__storePhaseState` (phase 6) at the start and end of the phase.
