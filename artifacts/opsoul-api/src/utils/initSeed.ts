import { db } from '@workspace/db';
import { platformSkillsTable, ownersTable, operatorsTable } from '@workspace/db';
import { eq, and, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { OWNER_EMAIL, OWNER_OPERATORS } from './ownerOperatorsSeed';

const SKILLS_TO_SEED = [
  // ── Executor ─────────────────────────────────────────────────────────────
  { name: 'Task Breakdown', archetype: 'Executor', description: 'Breaks a goal into actionable steps with owners and deadlines.', triggerDescription: 'user has a goal or project and wants it broken into clear tasks with owners and timelines', instructions: `Ask what the goal is and when it needs to be done. Then produce a structured breakdown:\n1. List every required action (be specific — name the actual task, not a vague category)\n2. For each task: assign a suggested owner type and a target deadline\n3. Flag any dependencies (task B cannot start until task A is done)\n4. Identify the first task to start today\nKeep it concrete. If the goal is vague, ask one clarifying question first.`, outputFormat: 'Task list → owner → deadline → dependencies → first action today' },
  { name: 'Progress Tracker', archetype: 'Executor', description: 'Summarizes what is done, what is pending, and what is blocked.', triggerDescription: 'user wants a status update on a project or set of tasks', instructions: `Ask them to share their task list or describe what they are working on. Then produce a clean status summary:\n1. Done — what has been completed (be specific)\n2. In Progress — what is actively being worked on and by whom\n3. Pending — what has not started yet and why\n4. Blocked — what cannot move forward and what is blocking it\n5. Next 24h — the most important thing to complete in the next day\nDo not editorialize. Stick to the facts they give you. If the picture is unclear, ask for the missing piece.`, outputFormat: 'Done / In Progress / Pending / Blocked / Next 24h' },
  { name: 'Priority Sorter', archetype: 'Executor', description: 'Ranks tasks by urgency and impact so the right things get done first.', triggerDescription: 'user has too many tasks and does not know what to do first', instructions: `Ask them to list everything on their plate. Then sort it using a 2x2 urgency/impact matrix:\n1. Do now — high urgency, high impact (these go first)\n2. Schedule — low urgency, high impact (protect time for these)\n3. Delegate or compress — high urgency, low impact (do fast or hand off)\n4. Drop — low urgency, low impact (remove from the list)\nBe direct. Name what can be dropped. Name what must be done today. Give them a clear sequence for the next 48 hours.`, outputFormat: 'Do now → schedule → delegate/compress → drop → sequence for next 48h' },
  { name: 'Blocker Resolver', archetype: 'Executor', description: 'Identifies what is blocking progress and proposes concrete solutions.', triggerDescription: 'user is stuck and cannot move forward on a task or project', instructions: `Identify the blocker precisely. Ask: "What exactly cannot happen right now, and why?"\nThen analyze:\n1. Root cause — what is the actual constraint (resource? decision? dependency? skill gap?)\n2. Workarounds — at least two paths that could unblock this without solving the root cause\n3. Root fix — what would permanently remove this blocker\n4. Fastest path — what can be done in the next hour to make any progress\nDo not let them leave without something they can do. Even if the blocker is real, there is always a next action.`, outputFormat: 'Root cause → workarounds → root fix → fastest path today' },
  { name: 'Deadline Monitor', archetype: 'Executor', description: 'Flags overdue items and suggests recovery plans to get back on track.', triggerDescription: 'user has missed a deadline or is at risk of missing one and needs a recovery plan', instructions: `Ask what was due, when it was due, and what the current state is. Then:\n1. Assess the actual gap — how far behind are they, and is recovery realistic?\n2. Identify the cause — what led to the miss? (scoping? execution? dependencies?)\n3. Build a recovery plan — specific actions, revised timeline, and any scope cuts needed to hit a new date\n4. Flag downstream impact — what else is affected by this delay?\n5. Propose a new commitment — a specific date they can confidently commit to\nBe honest about what is recoverable and what is not.`, outputFormat: 'Gap assessment → cause → recovery plan → downstream impact → new commitment date' },
  // ── Advisor ──────────────────────────────────────────────────────────────
  { name: 'Decision Framework', archetype: 'Advisor', description: 'Structures a decision with options, tradeoffs, and a clear recommendation.', triggerDescription: 'user is facing a decision and needs a structured way to think through it', instructions: `Identify the decision clearly. Ask: "What exactly are you deciding, and by when?"\nThen structure it:\n1. Decision statement — one sentence defining exactly what is being chosen\n2. Options — list every realistic option (including doing nothing)\n3. Criteria — what matters most in making this choice\n4. Tradeoffs — for each option, the key upside and key downside\n5. Recommendation — which option best fits the criteria and why\nMake the recommendation clear.`, outputFormat: 'Decision statement → options → criteria → tradeoffs → recommendation' },
  { name: 'Risk Assessment', archetype: 'Advisor', description: 'Identifies risks in a plan and rates their likelihood and impact.', triggerDescription: 'user wants to stress-test a plan or understand what could go wrong', instructions: `Ask them to describe the plan or initiative. Then identify risks across categories:\n- Execution risk: what could fail in delivery?\n- Market risk: what could the environment do to this?\n- Resource risk: what people, money, or time assumptions might not hold?\n- Dependency risk: what external factors is this relying on?\nFor each risk: name it clearly, rate likelihood (Low/Medium/High) and impact (Low/Medium/High), and propose a mitigation.\nHighlight the top 2 risks they must address before proceeding.`, outputFormat: 'Risk name → likelihood → impact → mitigation → top 2 to address first' },
  { name: 'Strategy Review', archetype: 'Advisor', description: 'Evaluates a strategy against stated goals to find gaps and misalignments.', triggerDescription: 'user has a strategy or plan and wants an honest evaluation of whether it will achieve the goal', instructions: `Ask them to share the strategy and the goal it is meant to achieve. Then evaluate:\n1. Goal clarity — is the goal specific and measurable?\n2. Strategic fit — does the strategy actually address the goal?\n3. Strengths — what parts of the strategy are well-designed?\n4. Weaknesses — what will not work, and why?\n5. Missing elements — what is not in the strategy that should be?\n6. Verdict — will this strategy achieve the goal as written? Yes / No / Partially\nBe direct. Name what does not work.`, outputFormat: 'Goal clarity → fit assessment → strengths → weaknesses → gaps → verdict' },
  { name: 'Options Mapper', archetype: 'Advisor', description: 'Lists all viable paths for a problem with pros and cons for each.', triggerDescription: 'user is facing a problem and wants a full view of their options before deciding', instructions: `Understand the problem and constraints. Then map every viable path:\n- Include the obvious options\n- Include the non-obvious options\n- Include the "do nothing" option if relevant\nFor each option:\n1. What it involves (briefly)\n2. Main pro\n3. Main con\n4. Who it is best suited for\nEnd with a synthesis: which 1-2 options stand out given their situation, and why.`, outputFormat: 'Option name → what it involves → pro → con → best for → synthesis' },
  { name: 'Assumption Checker', archetype: 'Advisor', description: 'Surfaces hidden assumptions in a plan or argument before they become problems.', triggerDescription: 'user is making a case or presenting a plan and you want to identify the assumptions holding it up', instructions: `Read their plan or argument carefully. Extract every assumption embedded in it.\nFor each assumption:\n1. State it clearly ("This assumes that X")\n2. Ask: has this been validated, or is it taken for granted?\n3. Rate the risk if this assumption is wrong: Low / Medium / High\n4. Suggest how to test or de-risk it\nFocus on the load-bearing assumptions first.`, outputFormat: 'Assumption → validated? → risk if wrong → how to test it → top load-bearing ones' },
  // ── Expert ───────────────────────────────────────────────────────────────
  { name: 'Deep Research', archetype: 'Expert', description: 'Finds and synthesizes authoritative information on a topic into a clear summary.', triggerDescription: 'user needs thorough, reliable information on a specific topic or question', instructions: `Identify the exact topic or question. Then research and synthesize:\n1. Core answer — what does the evidence say?\n2. Key findings — 3-5 specific, substantive points worth knowing\n3. What the experts say — cite authoritative perspectives where relevant\n4. Where the evidence is uncertain or contested\n5. Practical implications — what does this mean for the user's situation?\nUse only reliable sources. Flag where information is incomplete or debated.`, outputFormat: 'Core answer → key findings → expert perspectives → uncertainty → implications' },
  { name: 'Fact Checker', archetype: 'Expert', description: 'Verifies claims against reliable sources and flags what is unverified.', triggerDescription: 'user has a claim, statistic, or assertion they want to verify', instructions: `Take the claim being made. Then:\n1. Restate it clearly so there is no ambiguity\n2. Check it against what is known from reliable sources\n3. Verdict: True / False / Partially True / Unverified — with explanation\n4. If false or partial: what is actually true?\n5. Source quality: rate the reliability of the sources used\nBe honest about what you can and cannot confirm.`, outputFormat: 'Claim restated → verdict → explanation → what is actually true → source quality' },
  { name: 'Concept Explainer', archetype: 'Expert', description: 'Explains complex ideas in clear, accessible terms without dumbing them down.', triggerDescription: 'user wants to understand a concept, field, or technical idea', instructions: `Identify what they want to understand. Then explain it in layers:\n1. Core idea — one or two sentences that capture what this actually is\n2. Why it matters — what problem does it solve?\n3. How it works — the mechanism, process, or structure\n4. A concrete example — one real-world case that makes it tangible\n5. Common misconceptions — one thing people usually get wrong\nDo not oversimplify. Precision matters.`, outputFormat: 'Core idea → why it matters → how it works → concrete example → common misconception' },
  { name: 'Comparative Analysis', archetype: 'Expert', description: 'Compares two or more approaches, tools, or ideas across the dimensions that matter.', triggerDescription: 'user wants to compare two or more options, tools, frameworks, or ideas', instructions: `Identify what is being compared and the context in which they need to choose. Then compare across relevant dimensions:\n1. Define the comparison criteria\n2. Evaluate each option against each criterion — be specific\n3. Identify where the options are similar\n4. Identify where they genuinely differ\n5. Verdict — which is better for their specific situation and why\nDo not sit on the fence. Give a recommendation.`, outputFormat: 'Criteria → evaluation by option → where they differ → verdict for their context' },
  { name: 'Knowledge Summarizer', archetype: 'Expert', description: 'Distills a long document, field, or topic into its most important points.', triggerDescription: 'user has a lot of content or a complex topic and wants the key points extracted', instructions: `Ask them to share the content or describe the topic. Then produce a tight summary:\n1. The central point or thesis (one sentence)\n2. 3-5 key insights — things that are non-obvious or high-value\n3. What to do with this information — practical takeaways\n4. What is missing or left unanswered\nKeep it short. One insight clearly stated is worth more than five vague ones.`, outputFormat: 'Central point → key insights → practical takeaways → what is missing' },
  // ── Connector ────────────────────────────────────────────────────────────
  { name: 'Intro Drafter', archetype: 'Connector', description: 'Writes a warm, contextual introduction between two people.', triggerDescription: 'user wants to introduce two people and needs a well-crafted intro message', instructions: `Ask for: who person A is, who person B is, and why they should meet. Then write a double opt-in intro that:\n1. Respects both people's time (keep it under 150 words)\n2. States clearly why this connection is valuable for each person\n3. Names the specific opportunity that makes the intro worthwhile\n4. Uses a warm but professional tone\n5. Ends with a soft ask: "Happy to make the intro if you're open to it"\nStick to facts and genuine context.`, outputFormat: 'Email intro → subject line → body under 150 words' },
  { name: 'Outreach Composer', archetype: 'Connector', description: 'Drafts a personalized outreach message for a specific goal.', triggerDescription: 'user wants to reach out to someone cold or warm and needs a message that will actually get a response', instructions: `Ask: who are they reaching out to, what do they want, and what do they know about them?\nThen draft a message that:\n1. Opens with something specific to that person\n2. Gets to the ask in 2-3 sentences\n3. Makes the ask clear, small, and easy to say yes to\n4. Shows what is in it for them, briefly\n5. Closes simply\nThe message should read like it was written for this person, not copied from a template.`, outputFormat: 'Subject line → message body (under 120 words) → optional follow-up line' },
  { name: 'Relationship Mapper', archetype: 'Connector', description: 'Identifies who to talk to for a given objective.', triggerDescription: 'user has a goal and needs to figure out who in their network or beyond to contact', instructions: `Understand the goal clearly. Then map the relationship landscape:\n1. Direct contacts — people they almost certainly know who are directly relevant\n2. Second-degree — types of people one connection away who would help\n3. Warm paths — specific paths to reach the right person\n4. Cold outreach targets — types of people worth reaching out to directly\n5. First move — the single best relationship to activate this week\nGive them a next action on the most valuable connection.`, outputFormat: 'Direct contacts → second-degree types → warm paths → cold targets → first move' },
  { name: 'Follow-up Writer', archetype: 'Connector', description: 'Drafts a thoughtful follow-up after a meeting or interaction.', triggerDescription: 'user just had a meeting or conversation and wants to follow up in a way that moves things forward', instructions: `Ask: what was the meeting about, what was agreed, and what is the next step? Then write a follow-up that:\n1. Thanks them without being sycophantic (one brief line max)\n2. Summarizes the key points or agreements\n3. States the next step clearly — who does what by when\n4. Leaves the door open for questions\nKeep it short. Under 100 words unless there are complex action items.`, outputFormat: 'Opening → key takeaways → next steps with owners → close' },
  { name: 'Collaboration Proposal', archetype: 'Connector', description: 'Structures a partnership or collaboration pitch.', triggerDescription: 'user wants to propose a collaboration, partnership, or joint project', instructions: `Understand what they want to build together and with whom. Then structure the proposal:\n1. The shared problem or opportunity\n2. What each party brings\n3. What collaboration looks like — what is actually being proposed?\n4. Why now — why is this the right moment?\n5. What success looks like\n6. Ask — what do you need from them to move forward?\nMake it feel like an invitation, not a pitch.`, outputFormat: "Shared opportunity → each party's contribution → collaboration model → success definition → ask" },
  // ── Creator ──────────────────────────────────────────────────────────────
  { name: 'Content Planner', archetype: 'Creator', description: 'Builds a content calendar or topic list aligned to a specific goal.', triggerDescription: 'user wants to plan their content output and needs a structured topic list or calendar', instructions: `Ask: what is the content for, who is the audience, and what do they want the content to do?\nThen build a content plan:\n1. Themes — 3-4 content pillars that serve the goal and audience\n2. Topic list — 10-15 specific topics across the pillars\n3. Suggested cadence — how often to publish and on which channels\n4. Quick wins — 2-3 topics they could write today\n5. Evergreen vs timely split\nMake the topics specific. "5 mistakes founders make" beats "leadership tips".`, outputFormat: 'Themes → topic list → cadence → quick wins → evergreen/timely split' },
  { name: 'Draft Writer', archetype: 'Creator', description: 'Writes a first draft of any content format — post, article, script, or email.', triggerDescription: 'user wants a draft of a piece of content and knows roughly what they want to say', instructions: `Ask: what format, what is the main point, who is the audience, what tone?\nThen write a first draft that:\n1. Opens with a hook that earns the next sentence\n2. Delivers the core point clearly and early\n3. Supports it with specifics\n4. Closes with something that makes the reader want to act or think\n5. Matches the requested tone throughout\nFirst drafts are for thinking, not finishing.`, outputFormat: 'Full draft → optional: 1-2 notes on what to refine in the next pass' },
  { name: 'Idea Generator', archetype: 'Creator', description: 'Produces a list of creative directions for a brief.', triggerDescription: 'user needs creative ideas for a project, campaign, post, product, or problem', instructions: `Understand the brief: what is this for, who is it for, what are the constraints?\nThen generate 8-12 ideas across a range of directions:\n- Include the obvious, well-executed version\n- Include the unexpected or counterintuitive version\n- Include one that breaks the assumed format\n- Include one that is simpler than they are probably thinking\nFor each idea: give it a name and one sentence of context.\nEnd with your top 2 picks and why.`, outputFormat: 'Idea name → one-sentence description → top 2 picks with rationale' },
  { name: 'Story Framer', archetype: 'Creator', description: 'Turns a raw idea into a narrative structure worth building from.', triggerDescription: 'user has an idea or experience they want to turn into a story, piece of content, or presentation', instructions: `Ask them to share the raw idea or experience. Then frame it as a story:\n1. The setup — who is the character, what is their world before the change?\n2. The tension — what problem drives the story forward?\n3. The turn — what shifts or is discovered?\n4. The resolution — how does it land?\n5. The takeaway — what does the audience leave with?\nGive them the structure — they can write the flesh.`, outputFormat: 'Setup → tension → turn → resolution → takeaway' },
  { name: 'Tone Rewriter', archetype: 'Creator', description: 'Rewrites existing content in a different tone or style while preserving the core message.', triggerDescription: 'user has content that needs to be rewritten in a different voice, tone, or style', instructions: `Ask for the original content and the desired new tone (e.g. conversational, authoritative, playful, direct, academic). Then rewrite:\n1. Keep the core meaning and key information intact\n2. Shift the vocabulary, sentence structure, and voice to match the target tone\n3. Remove anything that clashes with the new tone\n4. Note what changed and why\nMake deliberate choices. The new version should sound like it was written natively in the target tone.`, outputFormat: 'Rewritten content → brief note on what changed and why' },
  // ── Guardian ─────────────────────────────────────────────────────────────
  { name: 'Policy Checker', archetype: 'Guardian', description: 'Reviews a decision or action against stated rules or policies.', triggerDescription: 'user wants to check whether a proposed action or decision is consistent with their rules, policies, or stated principles', instructions: `Ask for: the proposed action and the policy it should be checked against.\nThen review:\n1. What the policy says (restate it clearly)\n2. Whether the proposed action complies, partially complies, or violates it\n3. Where the tension is — if there is ambiguity, name it exactly\n4. Verdict: compliant / non-compliant / grey zone\n5. If non-compliant: what change would bring it into compliance?\nYour role is to check the rule, not to judge it.`, outputFormat: 'Policy restated → compliance verdict → where the tension is → recommended fix if needed' },
  { name: 'Risk Flagging', archetype: 'Guardian', description: 'Identifies ethical, legal, or reputational risks in a plan before it is executed.', triggerDescription: 'user is about to take an action and wants to know what could go wrong from an ethical, legal, or reputational angle', instructions: `Review the plan or proposed action. Flag risks across three categories:\n1. Ethical risks — does this conflict with stated values or harm anyone?\n2. Legal risks — are there laws, regulations, or liabilities this could trigger?\n3. Reputational risks — how could this look to customers, press, or regulators?\nFor each risk: name it, rate it (Low/Medium/High), and describe the worst-case scenario.\nFinish with: the one risk they absolutely must address before proceeding.`, outputFormat: 'Ethical risks → legal risks → reputational risks → must-address item' },
  { name: 'Compliance Reviewer', archetype: 'Guardian', description: 'Checks a document or process against a compliance standard.', triggerDescription: 'user has a document, policy, or process and wants to verify it meets a specific compliance standard', instructions: `Ask for: what needs to be reviewed, and what compliance standard applies.\nThen review systematically:\n1. What the standard requires\n2. What the document or process currently does\n3. Where it meets the standard\n4. Where it falls short — be specific\n5. What changes are needed to close the gaps\nPrioritize gaps by severity.`, outputFormat: 'Standard requirements → current state → gaps → required changes → prioritized by severity' },
  { name: 'Incident Logger', archetype: 'Guardian', description: 'Structures an incident report with facts, impact, and next steps.', triggerDescription: 'user needs to document an incident — security, operational, customer-facing, or compliance', instructions: `Ask for the facts of the incident. Then structure a clean incident report:\n1. Incident summary — one sentence: what happened, when, and who was affected\n2. Timeline — key events in order\n3. Root cause — what actually caused this\n4. Impact — what was the effect on users, systems, or operations?\n5. Immediate actions taken\n6. Next steps — what must happen to prevent recurrence?\nBe factual. No speculation.`, outputFormat: 'Summary → timeline → root cause → impact → actions taken → next steps' },
  { name: 'Boundary Enforcer', archetype: 'Guardian', description: 'Flags when a request conflicts with defined ethical boundaries.', triggerDescription: 'user or someone interacting with this operator is making a request that may conflict with stated ethical boundaries', instructions: `Review the request against the operator's defined ethical boundaries and values.\n1. State the boundary that is relevant\n2. Describe exactly how the request conflicts with it\n3. Explain why this boundary exists (briefly)\n4. Decline clearly and without apology\n5. Offer an alternative if one exists\nDo not lecture. Name the boundary, name the conflict, decline cleanly, and offer a path forward if possible.`, outputFormat: 'Boundary named → conflict described → clear decline → alternative if available' },
];

export async function runInitSeed(): Promise<void> {
  console.log('[initSeed] Checking seed state...');

  // ── Skills ──────────────────────────────────────────────────────────────
  const targetArchetypes = ['Executor', 'Advisor', 'Expert', 'Connector', 'Creator', 'Guardian'];
  const existing = await db
    .select({ name: platformSkillsTable.name, archetype: platformSkillsTable.archetype })
    .from(platformSkillsTable)
    .where(inArray(platformSkillsTable.archetype, targetArchetypes));

  const existingSet = new Set(existing.map((r) => `${r.archetype}::${r.name}`));
  const missing = SKILLS_TO_SEED.filter((s) => !existingSet.has(`${s.archetype}::${s.name}`));

  if (missing.length > 0) {
    console.log(`[initSeed] Inserting ${missing.length} missing platform skills...`);
    for (const skill of missing) {
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
      console.log(`[initSeed]   + ${skill.archetype} / ${skill.name}`);
    }
    console.log('[initSeed] Skills seed complete.');
  } else {
    console.log('[initSeed] All 6 archetype skill sets already present — skipping.');
  }

  // ── Blank operator ───────────────────────────────────────────────────────
  const blankExists = await db
    .select({ id: operatorsTable.id })
    .from(operatorsTable)
    .where(eq(operatorsTable.name, 'Blank'))
    .limit(1);

  if (blankExists.length === 0) {
    console.log('[initSeed] Blank operator not found — creating...');

    const sovereignAdmins = await db
      .select({ id: ownersTable.id })
      .from(ownersTable)
      .where(eq(ownersTable.isSovereignAdmin, true))
      .limit(1);

    if (sovereignAdmins.length === 0) {
      console.warn('[initSeed] No sovereign admin found — skipping Blank creation.');
    } else {
      const newId = randomUUID();
      await db.insert(operatorsTable).values({
        id: newId,
        ownerId: sovereignAdmins[0].id,
        slug: 'blank',
        name: 'Blank',
        archetype: [],
        mandate: 'A clean foundation. No archetype. No predefined purpose. Built to observe, learn, and become.',
        coreValues: [],
        ethicalBoundaries: [],
        layer2Soul: {},
        layer2SoulOriginal: {},
        growLockLevel: 'OPEN',
        safeMode: false,
        freeRoaming: true,
        toolUsePolicy: 'auto',
        deletedAt: null,
      });
      console.log(`[initSeed] Blank operator created — id: ${newId}`);
    }
  } else {
    console.log('[initSeed] Blank operator already exists — skipping.');
  }

  // ── Owner operators ──────────────────────────────────────────────────────
  const ownerRows = await db
    .select({ id: ownersTable.id })
    .from(ownersTable)
    .where(eq(ownersTable.email, OWNER_EMAIL))
    .limit(1);

  if (ownerRows.length === 0) {
    console.log(`[initSeed] Owner ${OWNER_EMAIL} not yet registered — skipping operator seed.`);
  } else {
    const ownerId = ownerRows[0].id;

    const existingOps = await db
      .select({ name: operatorsTable.name })
      .from(operatorsTable)
      .where(eq(operatorsTable.ownerId, ownerId));

    const existingNames = new Set(existingOps.map((r) => r.name));
    let seeded = 0;

    for (const op of OWNER_OPERATORS) {
      if (existingNames.has(op.name)) {
        continue;
      }
      const newId = randomUUID();
      await db.insert(operatorsTable).values({
        id: newId,
        ownerId,
        slug: op.slug,
        name: op.name,
        archetype: op.archetype,
        mandate: op.mandate,
        rawIdentity: op.rawIdentity,
        layer2Soul: op.layer2Soul,
        layer2SoulOriginal: op.layer2Soul,
        coreValues: op.coreValues,
        ethicalBoundaries: op.ethicalBoundaries,
        growLockLevel: op.growLockLevel as 'CONTROLLED' | 'OPEN' | 'LOCKED',
        safeMode: op.safeMode,
        freeRoaming: false,
        toolUsePolicy: 'auto',
        deletedAt: null,
      });
      console.log(`[initSeed]   + operator: ${op.name}`);
      seeded++;
    }

    if (seeded > 0) {
      console.log(`[initSeed] ${seeded} owner operator(s) seeded for ${OWNER_EMAIL}.`);
    } else {
      console.log(`[initSeed] All owner operators already exist — skipping.`);
    }
  }
}
