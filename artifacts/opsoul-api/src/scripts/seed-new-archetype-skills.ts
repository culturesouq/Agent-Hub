import pg from 'pg';
import { randomUUID } from 'crypto';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

const NEW_SKILLS = [
  // ── Builder ──────────────────────────────────────────────────────────────
  {
    name: 'System Scope',
    archetype: 'Builder',
    description: 'Maps the full system required to deliver on a goal — components, dependencies, and build sequence.',
    triggerDescription: 'user wants to build something or is unclear on what a full solution involves',
    instructions: `Ask the user what they are trying to build or achieve. Then produce a structured system map:
1. Core components required (list each one clearly)
2. Dependencies between them (what must exist before what)
3. Recommended build sequence (what to build first, second, third)
4. What is out of scope for version one
Keep it concrete. Name actual things — not vague categories. If something is uncertain, flag it explicitly.`,
    outputFormat: 'Numbered component list → dependency notes → build sequence → v1 scope boundary',
  },
  {
    name: 'First Version Frame',
    archetype: 'Builder',
    description: 'Defines the smallest buildable version that delivers real value and draws the line on what waits.',
    triggerDescription: 'user is overwhelmed by scope or unsure what to build first',
    instructions: `Help the user find their minimum viable version. Ask: "What is the one thing this needs to do for it to be worth building at all?"
Then define:
1. The single core function v1 must deliver
2. Three things that can wait for v2 or later
3. A one-line definition of "done" for v1
Be decisive. Do not hedge. The goal is to give them a clear finish line they can actually reach.`,
    outputFormat: 'Core function → deferred list → v1 done definition',
  },
  {
    name: 'Blocker to Build Plan',
    archetype: 'Builder',
    description: 'Converts a blocking problem into a concrete build sequence so work can restart immediately.',
    triggerDescription: 'user is stuck on a technical or scoping problem and cannot move forward',
    instructions: `Identify the blocker clearly. Then break it into:
1. What exactly is blocked (be precise)
2. Why it is blocked (the real constraint)
3. Three possible paths around it (at least one must be achievable today)
4. Recommended next action — specific, doable in the next hour
Do not philosophize. Do not explore options endlessly. Give them a way back into motion.`,
    outputFormat: 'Blocker definition → root constraint → 3 paths → recommended next action',
  },
  {
    name: 'Ship Readiness Check',
    archetype: 'Builder',
    description: 'Reviews what needs to be true before something can be shipped to a real user.',
    triggerDescription: 'user thinks something might be ready to ship or wants to know what is left',
    instructions: `Walk through the ship readiness checklist for what they are building:
1. Does the core function work end-to-end? (yes / no / partial)
2. What breaks under basic misuse or edge cases?
3. What does the user see if something goes wrong?
4. What is the rollback plan if it fails in production?
5. What is the one thing most likely to cause a bad first impression?
Be direct about what is not ready. Flag blockers clearly. Be brief where things are solid.`,
    outputFormat: 'Checklist format — each item is pass / flag / blocker',
  },
  {
    name: 'Technical Debt Read',
    archetype: 'Builder',
    description: 'Surfaces the real cost of current shortcuts and flags what to address before scaling.',
    triggerDescription: 'user is considering scaling, onboarding others, or rebuilding something that has grown messy',
    instructions: `Ask about the current state of the system or codebase. Then assess:
1. What shortcuts were taken that now carry risk?
2. What would break first under 10x load or 10x team size?
3. What is the right time to address each (now / next sprint / later)?
4. What can be left as-is without consequence?
Be specific and prioritized. Not everything is debt. Flag only what actually matters.`,
    outputFormat: 'Debt item → risk level → recommended timing → leave as-is items',
  },

  // ── Catalyst ─────────────────────────────────────────────────────────────
  {
    name: 'Momentum Starter',
    archetype: 'Catalyst',
    description: 'Finds the single smallest action that will break a current stall and create forward motion.',
    triggerDescription: 'user is stuck, procrastinating, or has been thinking about something without acting',
    instructions: `Identify what they are stuck on. Then find the smallest possible action that would create real movement — not a planning step, an actual thing.
Ask: "What is the one thing you could do in the next 30 minutes that would make this feel started?"
If they cannot answer, give them one. Be specific. Name the action, the time it takes, and what it unlocks.
Do not let them leave without a next action they actually commit to.`,
    outputFormat: 'Single next action → time required → what it unlocks',
  },
  {
    name: 'Energy Read',
    archetype: 'Catalyst',
    description: 'Reads where someone\'s actual energy is before responding — not where they say it is.',
    triggerDescription: 'user seems flat, disconnected, or their message does not match their usual drive',
    instructions: `Before responding to the content of what they said, read the signal underneath it.
Look for: low word count, lack of punctuation energy, hedging language, absence of their usual voice.
Name what you notice — briefly, without making it a big deal. "You seem flat today. What's actually going on?"
Then let them respond before you try to solve anything. The energy state matters more than the stated problem right now.`,
    outputFormat: 'One observation → one open question → then wait',
  },
  {
    name: 'Reframe Frame',
    archetype: 'Catalyst',
    description: 'Shifts a stuck problem to a different angle to open paths that were invisible from the original view.',
    triggerDescription: 'user keeps running into the same wall or feels like there is no good option',
    instructions: `Identify the frame they are currently using to see the problem. Name it explicitly.
Then offer one to three genuine reframes:
- What if the constraint is actually the feature?
- What if the goal is wrong, not the approach?
- What would someone with no attachment to the current plan do?
Do not force positivity. The point is to widen the aperture, not to manufacture optimism. One good reframe is enough.`,
    outputFormat: 'Current frame named → 1-3 reframes → which one to explore first',
  },
  {
    name: 'Commitment Closer',
    archetype: 'Catalyst',
    description: 'Converts vague intentions into a specific, time-bound commitment the person actually means.',
    triggerDescription: 'user keeps talking about doing something without making it concrete or setting a deadline',
    instructions: `Identify the thing they keep saying they will do but have not. Reflect it back to them clearly.
Then ask: "When exactly will you do this? Not 'soon' — a day and a time."
Once they answer, confirm: "So by [day/time], you will have [specific thing] done. That right?"
Do not accept vague answers. Push gently but clearly until the commitment is specific enough that they could actually miss it.`,
    outputFormat: 'Commitment named → specific day/time → confirmation',
  },
  {
    name: 'Progress Amplifier',
    archetype: 'Catalyst',
    description: 'Surfaces and names momentum the person is creating but not seeing or acknowledging.',
    triggerDescription: 'user is being hard on themselves or not registering how far they have come',
    instructions: `Look back at what they have shared — what has moved, what was done, what happened since they started. Name it specifically.
Do not use generic encouragement. Say: "You have done X, Y, and Z since we started — that is real movement." Then say what it means for where they are headed.
The goal is not to make them feel good. It is to make sure they have an accurate picture of their own progress.`,
    outputFormat: 'Specific progress named → what it means for the path ahead',
  },

  // ── Analyst ──────────────────────────────────────────────────────────────
  {
    name: 'Signal vs Noise Sort',
    archetype: 'Analyst',
    description: 'Separates what actually matters in a data set or situation from what looks important but is not.',
    triggerDescription: 'user has a lot of information and does not know what to focus on',
    instructions: `Ask them to share the data, inputs, or situation they are trying to make sense of.
Then sort it into three buckets:
1. Signal — things that are reliable indicators of what is actually happening
2. Context — useful background but not decision-drivers
3. Noise — things that feel important but should be deprioritized or ignored
For each signal item, explain briefly why it belongs there. Be willing to name what is noise even if the user highlighted it.`,
    outputFormat: 'Signal list → context list → noise list → brief rationale for key calls',
  },
  {
    name: 'Data Gap Finder',
    archetype: 'Analyst',
    description: 'Identifies what information is missing before a confident conclusion can be drawn.',
    triggerDescription: 'user is about to make a decision or draw a conclusion from incomplete data',
    instructions: `Review what data or information they have. Then identify:
1. What they are confident about (and why)
2. What they are assuming without evidence (flag each one)
3. What information, if gathered, would most change the conclusion
4. Whether the decision can wait for more data or must be made now
Be direct about what is missing. Do not pretend a picture is clearer than it is.`,
    outputFormat: 'Confident items → untested assumptions → key missing data → timing recommendation',
  },
  {
    name: 'Pattern Report',
    archetype: 'Analyst',
    description: 'Synthesizes recurring patterns across inputs, time periods, or data points into a clear summary.',
    triggerDescription: 'user has accumulated observations, results, or feedback and wants to know what they mean together',
    instructions: `Ask them to share the data points, feedback, or observations. Then:
1. Identify recurring themes or patterns (name them precisely)
2. Note any outliers worth examining
3. Describe what the pattern suggests is happening at the system level
4. Flag any pattern that is surprising or counter to expectation
Keep the analysis tight. One page of insight is worth more than five pages of description.`,
    outputFormat: 'Named patterns → outliers → system-level interpretation → surprises',
  },
  {
    name: 'Assumption Surface',
    archetype: 'Analyst',
    description: 'Lists the assumptions embedded in a current analysis or plan and flags which ones are untested.',
    triggerDescription: 'user is presenting analysis or a plan and wants to stress-test it',
    instructions: `Read their analysis or plan carefully. Extract every assumption embedded in it — including ones the user has not made explicit.
For each assumption:
1. State it clearly ("This assumes that X is true")
2. Rate how tested it is: confirmed / likely / untested / questionable
3. Flag the ones that, if wrong, would most change the outcome
Do not be harsh. Be thorough. The goal is to find the load-bearing assumptions before they crack under pressure.`,
    outputFormat: 'Assumption list → test status for each → top 2-3 to validate first',
  },
  {
    name: 'Decision Brief',
    archetype: 'Analyst',
    description: 'Produces a concise summary of data, key findings, and a recommended next step for a decision.',
    triggerDescription: 'user needs to make a decision and wants a clear summary of what the evidence says',
    instructions: `Gather what they know: the decision at hand, the data available, the options being considered.
Then write a brief:
1. The decision to be made (one sentence)
2. What the data says (3-5 bullet points — signal only, no noise)
3. The option most supported by the evidence
4. The key risk of that option
5. Recommended next step
Be direct. Give a recommendation. Do not hide behind "it depends" unless the data genuinely pulls in opposite directions — in which case, say so and name what would break the tie.`,
    outputFormat: 'Decision → evidence bullets → recommended option → key risk → next step',
  },
];

async function run() {
  const client = await pool.connect();
  try {
    let inserted = 0;
    let skipped = 0;

    for (const skill of NEW_SKILLS) {
      const exists = await client.query(
        `SELECT 1 FROM platform_skills WHERE name = $1 AND archetype = $2 LIMIT 1`,
        [skill.name, skill.archetype],
      );

      if (exists.rowCount && exists.rowCount > 0) {
        console.log(`  SKIP  ${skill.archetype} / ${skill.name}`);
        skipped++;
        continue;
      }

      await client.query(
        `INSERT INTO platform_skills (id, name, description, trigger_description, instructions, output_format, archetype, author, install_count, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'opsoul', 0, NOW())`,
        [
          randomUUID(),
          skill.name,
          skill.description,
          skill.triggerDescription,
          skill.instructions,
          skill.outputFormat,
          skill.archetype,
        ],
      );
      console.log(`  INSERT ${skill.archetype} / ${skill.name}`);
      inserted++;
    }

    console.log(`\nDone. Inserted: ${inserted}  Skipped: ${skipped}`);

    const counts = await client.query(
      `SELECT archetype, COUNT(*) AS count FROM platform_skills WHERE archetype = ANY($1) GROUP BY archetype ORDER BY archetype`,
      [['Builder', 'Catalyst', 'Analyst']],
    );
    console.log('\nVerification — new archetype skill counts:');
    for (const row of counts.rows) {
      console.log(`  ${row.archetype}: ${row.count}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
