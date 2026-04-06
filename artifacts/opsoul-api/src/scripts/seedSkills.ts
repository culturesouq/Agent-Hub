import { db, pool } from '@workspace/db';
import { platformSkillsTable } from '@workspace/db';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const SKILLS = [
  // ── Executor ─────────────────────────────────────────────────────────────
  {
    name: 'Task Breakdown',
    archetype: 'Executor',
    description: 'Breaks a goal into actionable steps with owners and deadlines.',
    triggerDescription: 'user has a goal or project and wants it broken into clear tasks with owners and timelines',
    instructions: `Ask what the goal is and when it needs to be done. Then produce a structured breakdown:
1. List every required action (be specific — name the actual task, not a vague category)
2. For each task: assign a suggested owner type and a target deadline
3. Flag any dependencies (task B cannot start until task A is done)
4. Identify the first task to start today
Keep it concrete. If the goal is vague, ask one clarifying question first.`,
    outputFormat: 'Task list → owner → deadline → dependencies → first action today',
  },
  {
    name: 'Progress Tracker',
    archetype: 'Executor',
    description: 'Summarizes what is done, what is pending, and what is blocked.',
    triggerDescription: 'user wants a status update on a project or set of tasks',
    instructions: `Ask them to share their task list or describe what they are working on. Then produce a clean status summary:
1. Done — what has been completed (be specific)
2. In Progress — what is actively being worked on and by whom
3. Pending — what has not started yet and why
4. Blocked — what cannot move forward and what is blocking it
5. Next 24h — the most important thing to complete in the next day
Do not editorialize. Stick to the facts they give you. If the picture is unclear, ask for the missing piece.`,
    outputFormat: 'Done / In Progress / Pending / Blocked / Next 24h',
  },
  {
    name: 'Priority Sorter',
    archetype: 'Executor',
    description: 'Ranks tasks by urgency and impact so the right things get done first.',
    triggerDescription: 'user has too many tasks and does not know what to do first',
    instructions: `Ask them to list everything on their plate. Then sort it using a 2x2 urgency/impact matrix:
1. Do now — high urgency, high impact (these go first)
2. Schedule — low urgency, high impact (protect time for these)
3. Delegate or compress — high urgency, low impact (do fast or hand off)
4. Drop — low urgency, low impact (remove from the list)
Be direct. Name what can be dropped. Name what must be done today. Give them a clear sequence for the next 48 hours.`,
    outputFormat: 'Do now → schedule → delegate/compress → drop → sequence for next 48h',
  },
  {
    name: 'Blocker Resolver',
    archetype: 'Executor',
    description: 'Identifies what is blocking progress and proposes concrete solutions.',
    triggerDescription: 'user is stuck and cannot move forward on a task or project',
    instructions: `Identify the blocker precisely. Ask: "What exactly cannot happen right now, and why?"
Then analyze:
1. Root cause — what is the actual constraint (resource? decision? dependency? skill gap?)
2. Workarounds — at least two paths that could unblock this without solving the root cause
3. Root fix — what would permanently remove this blocker
4. Fastest path — what can be done in the next hour to make any progress
Do not let them leave without something they can do. Even if the blocker is real, there is always a next action.`,
    outputFormat: 'Root cause → workarounds → root fix → fastest path today',
  },
  {
    name: 'Deadline Monitor',
    archetype: 'Executor',
    description: 'Flags overdue items and suggests recovery plans to get back on track.',
    triggerDescription: 'user has missed a deadline or is at risk of missing one and needs a recovery plan',
    instructions: `Ask what was due, when it was due, and what the current state is. Then:
1. Assess the actual gap — how far behind are they, and is recovery realistic?
2. Identify the cause — what led to the miss? (scoping? execution? dependencies?)
3. Build a recovery plan — specific actions, revised timeline, and any scope cuts needed to hit a new date
4. Flag downstream impact — what else is affected by this delay?
5. Propose a new commitment — a specific date they can confidently commit to
Be honest about what is recoverable and what is not. False optimism costs more than clear bad news.`,
    outputFormat: 'Gap assessment → cause → recovery plan → downstream impact → new commitment date',
  },

  // ── Advisor ──────────────────────────────────────────────────────────────
  {
    name: 'Decision Framework',
    archetype: 'Advisor',
    description: 'Structures a decision with options, tradeoffs, and a clear recommendation.',
    triggerDescription: 'user is facing a decision and needs a structured way to think through it',
    instructions: `Identify the decision clearly. Ask: "What exactly are you deciding, and by when?"
Then structure it:
1. Decision statement — one sentence defining exactly what is being chosen
2. Options — list every realistic option (including doing nothing)
3. Criteria — what matters most in making this choice (cost, speed, risk, alignment, etc.)
4. Tradeoffs — for each option, the key upside and key downside
5. Recommendation — which option best fits the criteria and why
Make the recommendation clear. Do not hide behind "it depends" unless the criteria genuinely conflict — and if they do, say which criterion should win.`,
    outputFormat: 'Decision statement → options → criteria → tradeoffs → recommendation',
  },
  {
    name: 'Risk Assessment',
    archetype: 'Advisor',
    description: 'Identifies risks in a plan and rates their likelihood and impact.',
    triggerDescription: 'user wants to stress-test a plan or understand what could go wrong',
    instructions: `Ask them to describe the plan or initiative. Then identify risks across categories:
- Execution risk: what could fail in delivery?
- Market risk: what could the environment do to this?
- Resource risk: what people, money, or time assumptions might not hold?
- Dependency risk: what external factors is this relying on?
For each risk: name it clearly, rate likelihood (Low / Medium / High) and impact (Low / Medium / High), and propose a mitigation.
Highlight the top 2 risks they must address before proceeding.`,
    outputFormat: 'Risk name → likelihood → impact → mitigation → top 2 to address first',
  },
  {
    name: 'Strategy Review',
    archetype: 'Advisor',
    description: 'Evaluates a strategy against stated goals to find gaps and misalignments.',
    triggerDescription: 'user has a strategy or plan and wants an honest evaluation of whether it will achieve the goal',
    instructions: `Ask them to share the strategy and the goal it is meant to achieve. Then evaluate:
1. Goal clarity — is the goal specific and measurable?
2. Strategic fit — does the strategy actually address the goal, or is there a gap?
3. Strengths — what parts of the strategy are well-designed?
4. Weaknesses — what will not work, and why?
5. Missing elements — what is not in the strategy that should be?
6. Verdict — will this strategy achieve the goal as written? Yes / No / Partially
Be direct. Advisors who only validate are useless. Name what does not work.`,
    outputFormat: 'Goal clarity → fit assessment → strengths → weaknesses → gaps → verdict',
  },
  {
    name: 'Options Mapper',
    archetype: 'Advisor',
    description: 'Lists all viable paths for a problem with pros and cons for each.',
    triggerDescription: 'user is facing a problem and wants a full view of their options before deciding',
    instructions: `Understand the problem and constraints. Then map every viable path:
- Include the obvious options
- Include the non-obvious options (the ones they might not have considered)
- Include the "do nothing" option if relevant
For each option:
1. What it involves (briefly)
2. Main pro
3. Main con
4. Who it is best suited for
End with a synthesis: which 1-2 options stand out given their situation, and why.`,
    outputFormat: 'Option name → what it involves → pro → con → best for → synthesis',
  },
  {
    name: 'Assumption Checker',
    archetype: 'Advisor',
    description: 'Surfaces hidden assumptions in a plan or argument before they become problems.',
    triggerDescription: 'user is making a case or presenting a plan and you want to identify the assumptions holding it up',
    instructions: `Read their plan or argument carefully. Extract every assumption embedded in it — especially the ones they have not made explicit.
For each assumption:
1. State it clearly ("This assumes that X")
2. Ask: has this been validated, or is it taken for granted?
3. Rate the risk if this assumption is wrong: Low / Medium / High
4. Suggest how to test or de-risk it
Focus on the load-bearing assumptions — the ones that, if wrong, collapse the whole plan. Flag those first.`,
    outputFormat: 'Assumption → validated? → risk if wrong → how to test it → top load-bearing ones',
  },

  // ── Expert ───────────────────────────────────────────────────────────────
  {
    name: 'Deep Research',
    archetype: 'Expert',
    description: 'Finds and synthesizes authoritative information on a topic into a clear summary.',
    triggerDescription: 'user needs thorough, reliable information on a specific topic or question',
    instructions: `Identify the exact topic or question. Then research and synthesize:
1. Core answer — what does the evidence say? (be direct, not hedging)
2. Key findings — 3-5 specific, substantive points worth knowing
3. What the experts say — cite authoritative perspectives where relevant
4. Where the evidence is uncertain or contested — do not hide complexity
5. Practical implications — what does this mean for the user's situation?
Use only reliable sources. Flag where information is incomplete or debated. Do not pad with obvious facts.`,
    outputFormat: 'Core answer → key findings → expert perspectives → uncertainty → implications',
  },
  {
    name: 'Fact Checker',
    archetype: 'Expert',
    description: 'Verifies claims against reliable sources and flags what is unverified.',
    triggerDescription: 'user has a claim, statistic, or assertion they want to verify',
    instructions: `Take the claim being made. Then:
1. Restate it clearly so there is no ambiguity
2. Check it against what is known from reliable sources
3. Verdict: True / False / Partially True / Unverified — with explanation
4. If false or partial: what is actually true?
5. Source quality: rate the reliability of the sources used
Be honest about what you can and cannot confirm. "Unverified" is a valid verdict — never invent confidence you do not have.`,
    outputFormat: 'Claim restated → verdict → explanation → what is actually true → source quality',
  },
  {
    name: 'Concept Explainer',
    archetype: 'Expert',
    description: 'Explains complex ideas in clear, accessible terms without dumbing them down.',
    triggerDescription: 'user wants to understand a concept, field, or technical idea',
    instructions: `Identify what they want to understand. Then explain it in layers:
1. Core idea — one or two sentences that capture what this actually is
2. Why it matters — what problem does it solve or what does it make possible?
3. How it works — the mechanism, process, or structure (as simple as accurate allows)
4. A concrete example — one real-world case that makes it tangible
5. Common misconceptions — one thing people usually get wrong about this
Do not oversimplify. Precision matters. If a concept has nuance, preserve the nuance.`,
    outputFormat: 'Core idea → why it matters → how it works → concrete example → common misconception',
  },
  {
    name: 'Comparative Analysis',
    archetype: 'Expert',
    description: 'Compares two or more approaches, tools, or ideas across the dimensions that matter.',
    triggerDescription: 'user wants to compare two or more options, tools, frameworks, or ideas',
    instructions: `Identify what is being compared and the context in which they need to choose. Then compare across relevant dimensions:
1. Define the comparison criteria (what matters given their context)
2. Evaluate each option against each criterion — be specific, not vague
3. Identify where the options are similar (do not manufacture differences)
4. Identify where they genuinely differ (the real decision points)
5. Verdict — which is better for their specific situation and why
Do not sit on the fence. Give a recommendation. If it genuinely depends on a factor they have not specified, ask that one question.`,
    outputFormat: 'Criteria → evaluation by option → where they differ → verdict for their context',
  },
  {
    name: 'Knowledge Summarizer',
    archetype: 'Expert',
    description: 'Distills a long document, field, or topic into its most important points.',
    triggerDescription: 'user has a lot of content or a complex topic and wants the key points extracted',
    instructions: `Ask them to share the content or describe the topic. Then produce a tight summary:
1. The central point or thesis (one sentence)
2. 3-5 key insights — things that are non-obvious or high-value
3. What to do with this information — practical takeaways
4. What is missing or left unanswered
Keep it short. Cut everything that is obvious, repetitive, or decorative. One insight clearly stated is worth more than five vague ones.`,
    outputFormat: 'Central point → key insights → practical takeaways → what is missing',
  },

  // ── Connector ────────────────────────────────────────────────────────────
  {
    name: 'Intro Drafter',
    archetype: 'Connector',
    description: 'Writes a warm, contextual introduction between two people.',
    triggerDescription: 'user wants to introduce two people and needs a well-crafted intro message',
    instructions: `Ask for: who person A is, who person B is, and why they should meet. Then write a double opt-in intro that:
1. Respects both people's time (keep it under 150 words)
2. States clearly why this connection is valuable for each person
3. Names the specific opportunity, question, or collaboration that makes the intro worthwhile
4. Uses a warm but professional tone — no hollow superlatives
5. Ends with a soft ask: "Happy to make the intro if you're open to it"
Do not make promises about either person. Stick to facts and genuine context.`,
    outputFormat: 'Email intro → subject line → body under 150 words',
  },
  {
    name: 'Outreach Composer',
    archetype: 'Connector',
    description: 'Drafts a personalized outreach message for a specific goal.',
    triggerDescription: 'user wants to reach out to someone cold or warm and needs a message that will actually get a response',
    instructions: `Ask: who are they reaching out to, what do they want from this person, and what do they know about them?
Then draft a message that:
1. Opens with something specific to that person (not generic flattery)
2. Gets to the ask in 2-3 sentences
3. Makes the ask clear, small, and easy to say yes to
4. Shows what is in it for them, briefly
5. Closes simply — no desperation, no pressure
The message should read like it was written for this person, not copied from a template.`,
    outputFormat: 'Subject line → message body (under 120 words) → optional follow-up line',
  },
  {
    name: 'Relationship Mapper',
    archetype: 'Connector',
    description: 'Identifies who to talk to for a given objective.',
    triggerDescription: 'user has a goal and needs to figure out who in their network (or beyond) to contact',
    instructions: `Understand the goal clearly. Then map the relationship landscape:
1. Direct contacts — people they almost certainly know who are directly relevant
2. Second-degree — types of people one connection away who would help
3. Warm paths — specific paths to reach the right person (through who?)
4. Cold outreach targets — types of people worth reaching out to directly
5. First move — the single best relationship to activate this week
Be practical. Do not just describe the map — give them a next action on the most valuable connection.`,
    outputFormat: 'Direct contacts → second-degree types → warm paths → cold targets → first move',
  },
  {
    name: 'Follow-up Writer',
    archetype: 'Connector',
    description: 'Drafts a thoughtful follow-up after a meeting or interaction.',
    triggerDescription: 'user just had a meeting or conversation and wants to follow up in a way that moves things forward',
    instructions: `Ask: what was the meeting about, what was agreed or discussed, and what is the next step? Then write a follow-up that:
1. Thanks them without being sycophantic (one brief line max)
2. Summarizes the key points or agreements from the conversation
3. States the next step clearly — who does what by when
4. Leaves the door open for questions or adjustments
Keep it short. The best follow-ups are ones people actually read. Under 100 words unless there are complex action items.`,
    outputFormat: 'Opening → key takeaways → next steps with owners → close',
  },
  {
    name: 'Collaboration Proposal',
    archetype: 'Connector',
    description: 'Structures a partnership or collaboration pitch.',
    triggerDescription: 'user wants to propose a collaboration, partnership, or joint project to another person or organization',
    instructions: `Understand what they want to build together and with whom. Then structure the proposal:
1. The shared problem or opportunity — what are both parties trying to achieve?
2. What each party brings — specific strengths, assets, or capabilities
3. What collaboration looks like — what is actually being proposed?
4. Why now — why is this the right moment?
5. What success looks like — a concrete outcome both parties would agree is a win
6. Ask — what do you need from them to move forward?
Make it feel like an invitation, not a pitch. The other party should see themselves clearly in it.`,
    outputFormat: "Shared opportunity → each party's contribution → collaboration model → success definition → ask",
  },

  // ── Creator ──────────────────────────────────────────────────────────────
  {
    name: 'Content Planner',
    archetype: 'Creator',
    description: 'Builds a content calendar or topic list aligned to a specific goal.',
    triggerDescription: 'user wants to plan their content output and needs a structured topic list or calendar',
    instructions: `Ask: what is the content for, who is the audience, and what do they want the content to do (educate, convert, build trust, etc.)?
Then build a content plan:
1. Themes — 3-4 content pillars that serve the goal and audience
2. Topic list — 10-15 specific topics across the pillars (concrete enough to write from)
3. Suggested cadence — how often to publish and on which channels
4. Quick wins — 2-3 topics they could write today that would have immediate impact
5. Evergreen vs timely split — what proportion should be long-term vs news-driven
Make the topics specific. "5 mistakes founders make" beats "leadership tips".`,
    outputFormat: 'Themes → topic list → cadence → quick wins → evergreen/timely split',
  },
  {
    name: 'Draft Writer',
    archetype: 'Creator',
    description: 'Writes a first draft of any content format — post, article, script, or email.',
    triggerDescription: 'user wants a draft of a piece of content and knows roughly what they want to say',
    instructions: `Ask: what format is this (post, article, email, script, thread)? What is the main point? Who is the audience? What tone?
Then write a first draft that:
1. Opens with a hook that earns the next sentence
2. Delivers the core point clearly and early — do not bury the lead
3. Supports it with specifics (not vague generalities)
4. Closes with something that makes the reader want to act or think
5. Matches the requested tone throughout
Mark the draft clearly as a starting point. Do not polish it to death — first drafts are for thinking, not finishing.`,
    outputFormat: 'Full draft → optional: 1-2 notes on what to refine in the next pass',
  },
  {
    name: 'Idea Generator',
    archetype: 'Creator',
    description: 'Produces a list of creative directions for a brief.',
    triggerDescription: 'user needs creative ideas for a project, campaign, post, product, or problem',
    instructions: `Understand the brief: what is this for, who is it for, and what are the constraints?
Then generate 8-12 ideas across a range of directions:
- Include the obvious, well-executed version
- Include the unexpected or counterintuitive version
- Include one that breaks the assumed format
- Include one that is simpler than they are probably thinking
For each idea: give it a name and one sentence of context — enough to picture it. Do not over-explain.
End with your top 2 picks and why.`,
    outputFormat: 'Idea name → one-sentence description → top 2 picks with rationale',
  },
  {
    name: 'Story Framer',
    archetype: 'Creator',
    description: 'Turns a raw idea into a narrative structure worth building from.',
    triggerDescription: 'user has an idea or experience they want to turn into a story, piece of content, or presentation',
    instructions: `Ask them to share the raw idea, experience, or information. Then frame it as a story:
1. The setup — who is the character, what is their world before the change?
2. The tension — what problem, challenge, or question drives the story forward?
3. The turn — what shifts, what is discovered, or what is decided?
4. The resolution — how does it land? What changes?
5. The takeaway — what does the audience leave with?
This is structure, not prose. Give them the bones — they can write the flesh.`,
    outputFormat: 'Setup → tension → turn → resolution → takeaway',
  },
  {
    name: 'Tone Rewriter',
    archetype: 'Creator',
    description: 'Rewrites existing content in a different tone or style while preserving the core message.',
    triggerDescription: 'user has content that needs to be rewritten in a different voice, tone, or style',
    instructions: `Ask for the original content and the desired new tone (e.g. conversational, authoritative, playful, direct, academic). Then rewrite:
1. Keep the core meaning and key information intact
2. Shift the vocabulary, sentence structure, and voice to match the target tone
3. Remove anything that clashes with the new tone (hedging, jargon, formality, etc.)
4. Note what changed and why — so they can learn the difference
Do not just soften or harden the language randomly. Make deliberate choices. The new version should sound like it was written natively in the target tone.`,
    outputFormat: 'Rewritten content → brief note on what changed and why',
  },

  // ── Guardian ─────────────────────────────────────────────────────────────
  {
    name: 'Policy Checker',
    archetype: 'Guardian',
    description: 'Reviews a decision or action against stated rules or policies.',
    triggerDescription: 'user wants to check whether a proposed action or decision is consistent with their rules, policies, or stated principles',
    instructions: `Ask for: the proposed action or decision, and the policy or principles it should be checked against.
Then review:
1. What the policy says (restate it clearly)
2. Whether the proposed action complies, partially complies, or violates it
3. Where the tension is — if there is ambiguity, name it exactly
4. Verdict: compliant / non-compliant / grey zone
5. If non-compliant: what change would bring it into compliance?
Be precise. Do not add moral commentary beyond what the policy says. Your role is to check the rule, not to judge it.`,
    outputFormat: 'Policy restated → compliance verdict → where the tension is → recommended fix if needed',
  },
  {
    name: 'Risk Flagging',
    archetype: 'Guardian',
    description: 'Identifies ethical, legal, or reputational risks in a plan before it is executed.',
    triggerDescription: 'user is about to take an action and wants to know what could go wrong from an ethical, legal, or reputational angle',
    instructions: `Review the plan or proposed action. Flag risks across three categories:
1. Ethical risks — does this conflict with stated values or harm anyone?
2. Legal risks — are there laws, regulations, or liabilities this could trigger?
3. Reputational risks — how could this look to customers, press, regulators, or the public?
For each risk: name it, rate it (Low / Medium / High), and describe the worst-case scenario.
Finish with: the one risk they absolutely must address before proceeding.`,
    outputFormat: 'Ethical risks → legal risks → reputational risks → must-address item',
  },
  {
    name: 'Compliance Reviewer',
    archetype: 'Guardian',
    description: 'Checks a document or process against a compliance standard.',
    triggerDescription: 'user has a document, policy, or process and wants to verify it meets a specific compliance standard',
    instructions: `Ask for: what needs to be reviewed, and what compliance standard applies (GDPR, SOC2, ISO, internal policy, etc.).
Then review systematically:
1. What the standard requires in the relevant areas
2. What the document or process currently does
3. Where it meets the standard
4. Where it falls short — be specific, not vague
5. What changes are needed to close the gaps
Prioritize gaps by severity. A critical compliance gap is not the same as a minor documentation issue.`,
    outputFormat: 'Standard requirements → current state → gaps → required changes → prioritized by severity',
  },
  {
    name: 'Incident Logger',
    archetype: 'Guardian',
    description: 'Structures an incident report with facts, impact, and next steps.',
    triggerDescription: 'user needs to document an incident — security, operational, customer-facing, or compliance',
    instructions: `Ask for the facts of the incident. Then structure a clean incident report:
1. Incident summary — one sentence: what happened, when, and who was affected
2. Timeline — key events in order (discovery, escalation, response, resolution)
3. Root cause — what actually caused this (not what triggered it on the surface)
4. Impact — what was the effect on users, systems, data, or operations?
5. Immediate actions taken — what was done to stop the bleeding?
6. Next steps — what must happen to prevent recurrence?
Be factual. No speculation. If something is unknown, say so.`,
    outputFormat: 'Summary → timeline → root cause → impact → actions taken → next steps',
  },
  {
    name: 'Boundary Enforcer',
    archetype: 'Guardian',
    description: 'Flags when a request conflicts with defined ethical boundaries.',
    triggerDescription: 'user or someone interacting with this operator is making a request that may conflict with stated ethical boundaries',
    instructions: `Review the request against the operator's defined ethical boundaries and values.
1. State the boundary that is relevant
2. Describe exactly how the request conflicts with it
3. Explain why this boundary exists (briefly — not preachy)
4. Decline clearly and without apology
5. Offer an alternative if one exists that achieves a legitimate version of the goal
Do not lecture. Do not moralize. Name the boundary, name the conflict, decline cleanly, and offer a path forward if possible.`,
    outputFormat: 'Boundary named → conflict described → clear decline → alternative if available',
  },
];

async function run() {
  let inserted = 0;
  let skipped = 0;

  for (const skill of SKILLS) {
    const existing = await db
      .select({ id: platformSkillsTable.id })
      .from(platformSkillsTable)
      .where(
        and(
          eq(platformSkillsTable.name, skill.name),
          eq(platformSkillsTable.archetype, skill.archetype),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      console.log(`  SKIP  ${skill.archetype} / ${skill.name}`);
      skipped++;
      continue;
    }

    await db.insert(platformSkillsTable).values({
      id: randomUUID(),
      name: skill.name,
      description: skill.description,
      triggerDescription: skill.triggerDescription,
      instructions: skill.instructions,
      outputFormat: skill.outputFormat,
      archetype: skill.archetype,
      author: 'opsoul',
      installCount: 0,
    });

    console.log(`  INSERT  ${skill.archetype} / ${skill.name}`);
    inserted++;
  }

  console.log(`\nDone. Inserted: ${inserted}  Skipped: ${skipped}`);

  const archetypes = ['Executor', 'Advisor', 'Expert', 'Connector', 'Creator', 'Guardian'];
  for (const archetype of archetypes) {
    const rows = await db
      .select({ id: platformSkillsTable.id })
      .from(platformSkillsTable)
      .where(eq(platformSkillsTable.archetype, archetype));
    console.log(`  ${archetype}: ${rows.length}`);
  }

  await pool.end();
}

run().catch(err => {
  console.error(err);
  pool.end().catch(() => {});
  process.exit(1);
});
