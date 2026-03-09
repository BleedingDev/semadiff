# /ralph:discover - BMAD Analyst Mode

Autonom research och validering för att skapa en komplett PRD från PROJECT-BRIEF.

## Usage

```
/ralph:discover                    # Använder docs/PROJECT-BRIEF.md
/ralph:discover --input brief.md   # Custom input file
/ralph:discover --greenfield       # Skip brief, starta från scratch
```

## LANGUAGE SETTING

**FIRST: Detect language automatically**

```bash
LANG=$(grep -o '"language"[[:space:]]*:[[:space:]]*"[^"]*"' .ralph/config.json 2>/dev/null | cut -d'"' -f4)
echo "Language: ${LANG:-en}"
```

Use the detected language for ALL output.

---

## STEP 1: Input Source

### If PROJECT-BRIEF exists:

```bash
cat docs/PROJECT-BRIEF.md 2>/dev/null
```

Visa brief och bekräfta:

```
Found PROJECT-BRIEF.md:
- Idea: {one-liner}
- Hook: {differentiator}

1) Use this brief
2) Start fresh (greenfield)

Reply with number:
```

### If no brief (or greenfield selected):

Kör förenklad discovery:

```
What are we building?

Describe the product in a few sentences:
```

Then continue with template selection (see STEP 2b below).

---

## STEP 2: Choose Mode

```
How do you want to run discovery?

1) Autonomous (YOLO) - I run all analyst techniques, you review PRD at the end
2) Interactive - We go through each phase together

Reply with number:
```

---

## STEP 2b: Template Selection (if greenfield)

```bash
ls -1 .ralph/templates/stacks/ 2>/dev/null || echo "none"
```

```
Which template?

1) react-supabase - React + Vite + Tailwind + Supabase (recommended for apps with auth/database)
2) custom - Define your own stack

Reply with number:
```

If custom, ask for frontend, backend, deploy target.

---

## ANALYST TECHNIQUES (Kör alla!)

### Technique 1: MARKET RESEARCH

```
🔍 MARKET RESEARCH
```

**WebSearch (Claude Code):** Använd Claude Chrome Extension för att browsa webben under discovery.
Om webbläsning inte är tillgänglig, använd `dev-browser` för att navigera och samla in källor manuellt.

Sök aktivt efter:

- "{category} apps 2024"
- "{product type} market size"
- "best {category} tools comparison"
- "{competitor name} reviews"

**Analysera:**

- Topp 3-5 konkurrenter
- Deras styrkor och svagheter
- Pricing models
- User reviews (vad klagar folk på?)
- Market gaps

**Output:** Konkurrentanalys med actionable insights

---

### Technique 2: USER PERSONAS

```
👤 USER PERSONAS
```

Baserat på PROJECT-BRIEF's target audience, skapa detaljerade personas:

```
PERSONA 1: {Namn}
├── Demografi: {ålder, jobb, situation}
├── Goals: {vad vill de uppnå?}
├── Pains: {vad frustrerar dem?}
├── Tech comfort: {low/medium/high}
├── Current solution: {vad använder de nu?}
└── Trigger: {vad får dem att söka ny lösning?}
```

**Minimum:** 2 personas (primary + secondary)

---

### Technique 3: USER JOURNEYS

```
🗺️ USER JOURNEYS
```

Mappa alla core flows:

```
JOURNEY: {Namn på flow, t.ex. "First todo"}

1. TRIGGER: {Vad startar flödet?}
2. ENTRY: {Hur kommer de in?}
3. STEPS:
   └── Step 1: {action} → {system response}
   └── Step 2: {action} → {system response}
   └── ...
4. SUCCESS: {Vad är "done"?}
5. EDGE CASES: {Vad kan gå fel?}
```

**Minimum flows:**

- Onboarding/signup
- Core action (create todo, send message, etc.)
- Return visit
- Error recovery

---

### Technique 4: FEATURE PRIORITIZATION

```
📋 FEATURE PRIORITIZATION
```

Ta alla feature ideas från PROJECT-BRIEF och prioritera:

**MoSCoW Method:**

| Priority   | Features                    | Rationale                    |
| ---------- | --------------------------- | ---------------------------- |
| **Must**   | {kritiskt för MVP}          | Utan detta funkar inte appen |
| **Should** | {viktigt men inte kritiskt} | Förbättrar upplevelsen       |
| **Could**  | {nice-to-have}              | Om tid finns                 |
| **Won't**  | {out of scope för v1}       | Framtida version             |

**Effort/Impact Matrix:**

```
        HIGH IMPACT
             │
    Quick    │   Big Bets
    Wins     │
─────────────┼───────────── HIGH EFFORT
    Fill     │   Money
    Ins      │   Pit
             │
        LOW IMPACT
```

---

### Technique 5: TECHNICAL FEASIBILITY

```
🏗️ TECHNICAL FEASIBILITY
```

**Validera tech stack:**

| Component | Choice          | Rationale | Risk               |
| --------- | --------------- | --------- | ------------------ |
| Frontend  | {React/Vue/etc} | {varför}  | {potential issues} |
| Backend   | {Supabase/etc}  | {varför}  | {potential issues} |
| Auth      | {method}        | {varför}  | {potential issues} |
| Database  | {type}          | {varför}  | {potential issues} |
| Hosting   | {provider}      | {varför}  | {potential issues} |

**WebSearch:** Sök efter:

- "{tech} + {tech} integration"
- "{tech} limitations"
- "{tech} best practices 2024"

**Identify:**

- Technical risks
- Unknown unknowns
- Dependencies
- Learning curve

---

### Technique 6: SECURITY & COMPLIANCE

```
🔒 SECURITY & COMPLIANCE
```

**Checklist:**

| Area | Requirement        | Implementation            |
| ---- | ------------------ | ------------------------- |
| Auth | {how users login}  | {JWT/session/etc}         |
| Data | {what data stored} | {encryption/etc}          |
| GDPR | {EU users?}        | {consent/deletion/export} |
| PCI  | {payments?}        | {Stripe/etc handles it}   |

**WebSearch:** Om relevant:

- "GDPR requirements for {app type}"
- "{industry} compliance requirements"

---

### Technique 7: BUSINESS MODEL

```
💼 BUSINESS MODEL
```

| Aspect             | Description                       |
| ------------------ | --------------------------------- |
| **Revenue**        | {hur tjänar vi pengar?}           |
| **Pricing**        | {free/freemium/paid/subscription} |
| **Costs**          | {hosting, APIs, etc}              |
| **Unit economics** | {cost per user, etc}              |

**If learning project:** Note that business model is "N/A - learning project"

---

### Technique 8: DEVIL'S ADVOCATE (Final Challenge)

```
😈 DEVIL'S ADVOCATE
```

Utmana ALLT innan PRD anses klar:

```
❓ Är MVP scope för stort?
   → {assessment}

❓ Är tech stack rätt för problemet?
   → {assessment}

❓ Finns det okända risker vi missat?
   → {assessment}

❓ Är personas realistiska?
   → {assessment}

❓ Kan vi faktiskt bygga detta?
   → {assessment}
```

**Om något inte klarar challenge:** Gå tillbaka och fixa innan du fortsätter.

---

## ITERATION LOOP

```
┌─────────────────────────────────────────┐
│         PRD COMPLETENESS CHECK          │
├─────────────────────────────────────────┤
│ □ Market research - 3+ konkurrenter?    │
│ □ Personas - 2+ med goals/pains?        │
│ □ User journeys - Alla core flows?      │
│ □ Features - MoSCoW prioriterade?       │
│ □ Tech - Stack validerad?               │
│ □ Security - Requirements identifierade?│
│ □ Business - Model klar (eller N/A)?    │
│ □ Devil's advocate - Passerad?          │
│ □ Inga open questions kvar?             │
└─────────────────────────────────────────┘
```

**Om något saknas:** Kör den tekniken igen.
**Om motsägelser:** Lös dem innan du går vidare.

---

## DEFINITION OF DONE - Discovery

| Kriterium                           | Verifiering                  |
| ----------------------------------- | ---------------------------- |
| ✅ Alla 8 tekniker körda            | Checklist komplett           |
| ✅ Minst 3 konkurrenter analyserade | Market research klar         |
| ✅ Minst 2 personas                 | Med goals & pains            |
| ✅ Core user journeys               | Alla MVP-flows mappade       |
| ✅ Features prioriterade            | MoSCoW eller liknande        |
| ✅ Tech stack validerat             | Risker identifierade         |
| ✅ Security requirements            | Definierade                  |
| ✅ Devil's advocate passerad        | Alla utmaningar addresserade |
| ✅ Open Questions tom               | Eller endast nice-to-have    |

---

## OUTPUT: PRD.md

När ALLA tekniker är klara, skapa `docs/PRD.md`:

```markdown
# [Produktnamn] - Product Requirements Document

## Executive Summary

{2-3 meningar som sammanfattar produkten}

## Vision & Problem Statement

{Vad löser vi? Varför behövs detta?}
{Referera till PROJECT-BRIEF motivation}

## Market Analysis

### Competitive Landscape

{Konkurrenter och positionering}

### Market Opportunity

{Gaps vi fyller}

## Target Users

### Primary Persona: {Namn}

{Full persona description}

### Secondary Persona: {Namn}

{Full persona description}

## User Journeys

### Journey 1: {namn}

{Detaljerat flow}

### Journey 2: {namn}

{Detaljerat flow}

## Feature Requirements

### Must Have (MVP)

| Feature   | Description | Acceptance Criteria    |
| --------- | ----------- | ---------------------- |
| {feature} | {what}      | {how we know it works} |

### Should Have

{prioriterad lista}

### Could Have

{prioriterad lista}

### Won't Have (v1)

{explicit out of scope}

## Technical Architecture

### Stack

{Frontend, Backend, Database, etc}

### System Diagram

{ASCII eller beskrivning}

### Integrations

{Externa API:er och tjänster}

### Technical Risks

{Identifierade risker och mitigations}

## Security & Compliance

{Auth, data, GDPR, etc}

## Business Model

{Revenue, pricing, costs - eller "N/A learning project"}

## Success Metrics

{Hur vet vi att produkten lyckas?}

## Open Questions

{MÅSTE VARA TOM för production-ready PRD}
{OK att ha "nice-to-have" frågor}

## Appendix

### From PROJECT-BRIEF

{Länk eller sammanfattning av brainstorm-fasen}

---

_Generated by Ralph Analyst Mode_
_Next step: /ralph:plan to create implementation specs_
```

---

## AFTER PRD: Setup Files

### 1. Create/Update CLAUDE.md

Om template valdes, kopiera:

```bash
cp .ralph/templates/stacks/{template}/CLAUDE.md CLAUDE.md
```

Om custom, generera CLAUDE.md med:

- Project description
- Tech stack
- Security rules
- Workflow instructions

### 2. Create .env.example

Om relevant (Supabase, etc):

```bash
cat > .env.example << 'EOF'
# Supabase
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
EOF
```

---

## NÄR KLAR

Visa PRD-sammanfattning och skriv:

```
DISCOVERY_COMPLETE

PRD sparad till: docs/PRD.md

Sammanfattning:
- Produkt: {namn}
- MVP Features: {antal} must-haves
- Tech: {stack summary}
- Personas: {antal}

Nästa steg:
1. Granska docs/PRD.md
2. Kör /ralph:preflight för att verifiera requirements
3. Kör /ralph:plan för att skapa implementation specs
```

---

## START NOW

1. Check for PROJECT-BRIEF.md
2. Ask for mode (Autonomous/Interactive)
3. Run all analyst techniques
4. Generate PRD.md
5. Setup project files
