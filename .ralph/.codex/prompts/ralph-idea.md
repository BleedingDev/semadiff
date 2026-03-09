# /prompts:ralph-idea - BMAD Brainstorm Mode

Autonom brainstorm-loop för att utforska en vag idé och skapa en PROJECT-BRIEF.

## Usage

```
/prompts:ralph-idea "Din vaga idé här"
/prompts:ralph-idea "todo-app"
/prompts:ralph-idea "nåt med AI och musik"
```

## LANGUAGE SETTING

**FIRST: Detect language automatically**

```bash
LANG=$(grep -o '"language"[[:space:]]*:[[:space:]]*"[^"]*"' .ralph/config.json 2>/dev/null | cut -d'"' -f4)
echo "Language: ${LANG:-en}"
```

Use the detected language for ALL output.

---

## STEP 1: Choose Mode

```
How do you want to brainstorm?

1) Autonomous (YOLO) - I run all techniques, you review at the end
2) Interactive - We go through each technique together

Reply with number:
```

---

## MODE 1: AUTONOMOUS (YOLO)

**DU SKA KÖRA ALLA TEKNIKER AUTONOMT**

Kör VARJE teknik nedan. Iterera tills PROJECT-BRIEF är komplett.
Fråga INTE användaren under loopen - brainstorma själv!

Först när ALLA tekniker är klara → visa PROJECT-BRIEF för användaren.

---

## MODE 2: INTERACTIVE

Gå genom varje teknik med användaren:

1. Kör tekniken
2. Visa resultatet
3. Fråga: "Vill du lägga till något? (eller 'next' för nästa teknik)"
4. Fortsätt till nästa teknik

Detta ger användaren chans att styra brainstormen och lägga till egna idéer.

---

## BRAINSTORM TECHNIQUES (Kör alla!)

### Technique 1: 5 WHYS - Hitta kärn-motivation

```
🔍 5 WHYS
```

Fråga "varför?" 5 gånger för att hitta den verkliga motivationen:

```
Idé: "Todo-app"
├── Varför todo-app? → "Vill lära mig React"
├── Varför React? → "Populärt, bra för jobb"
├── Varför just todos? → "Klassiskt projekt"
├── Varför inte nåt annat? → "Hmm... vet inte"
└── Vad brinner du för egentligen? → "Gillar musik!"

💡 Insight: Kanske todo-app för musiker?
```

**Output:** Kärn-motivation och eventuella pivots

---

### Technique 2: CRAZY 8s - 8 varianter

```
🎨 CRAZY 8s
```

Generera 8 olika varianter/vinklar på idén:

```
Idé: "Todo-app"

1. Standard todo (baseline)
2. Todo med AI-prioritering
3. Todo som spel (XP, levels, achievements)
4. Todo för par/familjer (delad)
5. Todo med voice input
6. Todo + kalender hybrid
7. Todo + pomodoro inbyggt
8. Todo för specifik nisch (devs, writers, musicians)
```

**Output:** 8 varianter, markera de mest intressanta

---

### Technique 3: COMPETITOR MASHUPS

```
🔀 MASHUPS
```

Kombinera kända produkter för nya idéer:

```
• Todoist + Duolingo = Gamified habits med streaks
• Things + Spotify = Mood-based productivity playlists
• TickTick + GitHub = Developer-focused tasks med commits
• Notion + Tinder = Swipe-baserad prioritering
• Trello + Strava = Social productivity med leaderboards
```

**WebSearch:** Googla de produkter du kombinerar för inspiration

**Output:** 3-5 mashup-idéer

---

### Technique 4: HOW MIGHT WE (HMW)

```
❓ HOW MIGHT WE
```

Omformulera problem till möjligheter:

```
Problem: "Todos är tråkigt"
→ HMW göra todos mindre tråkigt?
→ HMW hjälpa folk faktiskt slutföra tasks?
→ HMW differentiera från 1000 andra todo-appar?
→ HMW göra productivity fun utan att vara distraherande?
→ HMW belöna completion utan att bli manipulativt?
```

**Output:** 5+ HMW-frågor

---

### Technique 5: SCAMPER

```
🔧 SCAMPER
```

Systematisk innovation på idén:

| Letter               | Question                      | Applied to todo-app             |
| -------------------- | ----------------------------- | ------------------------------- |
| **S**ubstitute       | Vad kan ersättas?             | Text → Voice input?             |
| **C**ombine          | Vad kan kombineras?           | Todo + Calendar?                |
| **A**dapt            | Vad kan anpassas från annat?  | Gaming mechanics?               |
| **M**odify           | Vad kan förstoras/förminskas? | Micro-tasks only?               |
| **P**ut to other use | Annat användningsområde?      | Team retrospectives?            |
| **E**liminate        | Vad kan tas bort?             | No due dates = less stress?     |
| **R**earrange        | Annan ordning/struktur?       | Priority-first, not list-first? |

**Output:** Minst 3 SCAMPER-insights

---

### Technique 6: TARGET AUDIENCE FLIP

```
👥 AUDIENCE FLIP
```

Testa idén på oväntat målgrupp:

```
Todo-app för...
• Barn (6-10 år) → Enkel, visuell, belöningar
• Pensionärer → Stor text, medicin-påminnelser
• ADHD → Dopamine-triggers, no overwhelm
• Blindsla → Voice-first, screen reader
• Minimalist → Max 3 todos, inget mer
```

**Output:** 3+ audience flips med insights

---

### Technique 7: DEVIL'S ADVOCATE

```
😈 DEVIL'S ADVOCATE
```

Utmana ALLA antaganden:

```
❓ "Behöver världen verkligen en till todo-app?"
   → Nej, MEN om vi hittar unik vinkel...

❓ "Kommer du faktiskt använda den själv?"
   → Måste vara ärlig här...

❓ "Vad händer om ingen vill ha detta?"
   → Lär mig fortfarande tech stacken

❓ "Varför skulle någon välja din app över Todoist?"
   → MÅSTE ha differentiator!
```

**Output:** Alla invändningar + hur de addresseras

---

### Technique 8: WEB RESEARCH

```
🌐 WEB RESEARCH
```

**WebSearch:** Sök aktivt efter:

- Konkurrenter och deras reviews
- "best [category] apps 2024"
- "[category] app market size"
- Common complaints om existerande lösningar
- Tekniska lösningar och API:er

**Output:** Research findings sammanfattade

---

## ITERATION LOOP

Efter varje teknik, checka:

```
┌─────────────────────────────────────────┐
│         COMPLETENESS CHECK              │
├─────────────────────────────────────────┤
│ □ 5 Whys - Kärn-motivation klar?        │
│ □ Crazy 8s - 8 varianter genererade?    │
│ □ Mashups - 3+ kombinationer?           │
│ □ HMW - 5+ frågor formulerade?          │
│ □ SCAMPER - 3+ insights?                │
│ □ Audience Flip - 3+ perspektiv?        │
│ □ Devil's Advocate - Invändningar ok?   │
│ □ Web Research - Konkurrenter kända?    │
│ □ Riktning vald - En fokuserad idé?     │
└─────────────────────────────────────────┘
```

**Om något saknas:** Kör den tekniken igen eller utforska djupare.

**Om motsägelser:** Lös dem innan du går vidare.

---

## DEFINITION OF DONE - Brainstorm

| Kriterium                       | Verifiering                    |
| ------------------------------- | ------------------------------ |
| ✅ Alla 8 tekniker körda        | Checklist komplett             |
| ✅ Kärn-motivation identifierad | 5 Whys genomförd               |
| ✅ Minst 8 varianter utforskade | Crazy 8s klar                  |
| ✅ Minst 3 mashup-idéer         | Competitor riffs               |
| ✅ HMW-frågor formulerade       | 5+ frågor                      |
| ✅ SCAMPER-insights             | 3+ insights                    |
| ✅ Audience flips               | 3+ perspektiv                  |
| ✅ Devil's advocate passerad    | Alla invändningar addresserade |
| ✅ Web research gjord           | Konkurrenter kända             |
| ✅ EN fokuserad riktning vald   | Inte 5 idéer, EN idé           |

---

## OUTPUT: PROJECT-BRIEF.md

När ALLA tekniker är klara, skapa `docs/PROJECT-BRIEF.md`:

```markdown
# [Arbetsnamn] - Project Brief

## The Idea (One-liner)

{En mening som beskriver idén}

## Core Motivation (from 5 Whys)

{Varför bygga detta? Den verkliga anledningen}

## The Hook / Differentiator

{Vad gör detta unikt? Varför välja detta över alternativen?}

## Target Audience

{Vem är detta för? Primary och secondary}

## Key HMW Questions

{De viktigaste How Might We-frågorna att lösa}

## Explored Alternatives

{Kort sammanfattning av Crazy 8s och Mashups - vad övervägdes?}

## Competitive Landscape

{Konkurrenter och deras styrkor/svagheter}

## Risks & Concerns (from Devil's Advocate)

{Invändningar och hur de addresseras}

## Initial Feature Ideas

{Brainstormade features, INTE prioriterade ännu}

## Open Questions for Discovery

{Frågor som behöver mer research i nästa fas}

## Confidence Level

{Låg/Medium/Hög - hur säker är vi på riktningen?}

---

_Generated by Ralph Brainstorm Mode_
_Next step: /prompts:ralph-discover to create full PRD_
```

---

## NÄR KLAR

Visa PROJECT-BRIEF för användaren och skriv:

```
BRAINSTORM_COMPLETE

Project Brief sparad till: docs/PROJECT-BRIEF.md

Sammanfattning:
- Idé: {one-liner}
- Hook: {differentiator}
- Confidence: {level}

Nästa steg:
1. Granska PROJECT-BRIEF.md
2. Kör /prompts:ralph-discover för att skapa fullständig PRD med research
```

---

## START NOW

Börja med Technique 1: 5 WHYS på användarens idé.
Kör sedan ALLA tekniker autonomt.
Visa INTE delresultat - kör hela loopen först.
