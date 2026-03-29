import { Router, type IRouter } from "express";
import { eq, sql, asc } from "drizzle-orm";
import { db, agentsTable, connectionsTable, knowledgeTable, instructionsTable, activityTable, agentMemoriesTable } from "@workspace/db";
import { openrouter } from "@workspace/integrations-openrouter-ai";
import { buildSystemPrompt } from "./chat";
import { braveWebSearch, formatSearchResultsForPrompt } from "../services/search";

const router: IRouter = Router();

router.post("/public/chat", async (req, res): Promise<void> => {
  const body = req.body as {
    apiKey: string;
    message: string;
    conversationHistory?: { role: "user" | "assistant"; content: string }[];
    userId?: string | null;
  };

  if (!body.apiKey || !body.message) {
    res.status(400).json({ error: "apiKey and message are required" });
    return;
  }

  const [connection] = await db
    .select()
    .from(connectionsTable)
    .where(eq(connectionsTable.apiKey, body.apiKey));

  if (!connection) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, connection.agentId));
  if (!agent || !agent.isActive) {
    res.status(404).json({ error: "Agent not found or inactive" });
    return;
  }

  const [knowledge, instructions, memories] = await Promise.all([
    db.select().from(knowledgeTable).where(eq(knowledgeTable.agentId, agent.id)),
    db.select().from(instructionsTable).where(eq(instructionsTable.agentId, agent.id)),
    db.select().from(agentMemoriesTable).where(eq(agentMemoriesTable.agentId, agent.id)).orderBy(asc(agentMemoriesTable.createdAt)),
  ]);

  const systemPrompt = buildSystemPrompt(agent, knowledge, instructions, memories);

  const history = (body.conversationHistory || []).slice(-20).map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const model = agent.model || "openai/gpt-4.1-mini";
  const webSearchEnabled = agent.webSearchEnabled;
  const hasBraveKey = !!process.env.BRAVE_SEARCH_API_KEY;

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: body.message },
  ];

  let searchContextMessages: { role: "system" | "user" | "assistant"; content: string }[] = [];
  const allSourceUrls: string[] = [];

  if (webSearchEnabled && hasBraveKey) {
    const probeCompletion = await openrouter.chat.completions.create({
      model,
      max_tokens: 512,
      messages: [
        ...messages,
        {
          role: "system",
          content: "ONLY output [SEARCH: <query>] tags if you need real-time or current information to answer. Output NOTHING else. If you can answer from existing knowledge, output: NO_SEARCH",
        },
      ],
    });

    const probeResponse = probeCompletion.choices[0]?.message?.content ?? "";
    const searchMatches = [...probeResponse.matchAll(/\[SEARCH:\s*([^\]]+)\]/gi)];

    if (searchMatches.length > 0) {
      const searchResults = await Promise.all(
        searchMatches.map(async (match) => {
          const query = match[1]?.trim() ?? "";
          const results = await braveWebSearch(query);
          allSourceUrls.push(...results.map(r => r.url));
          return formatSearchResultsForPrompt(query, results);
        })
      );

      const searchContext = searchResults.join("\n\n");
      searchContextMessages = [
        {
          role: "system",
          content: `The following are current web search results to help you answer the user's question. Use them to give accurate, up-to-date information:\n\n${searchContext}`,
        },
      ];
    }
  }

  const finalMessages: { role: "system" | "user" | "assistant"; content: string }[] = searchContextMessages.length > 0
    ? [messages[0], ...searchContextMessages, ...messages.slice(1)]
    : messages;

  const completion = await openrouter.chat.completions.create({
    model,
    max_tokens: 8192,
    messages: finalMessages,
  });

  const rawResponse = completion.choices[0]?.message?.content || "";

  const memoryRegex = /\[MEMORY:\s*([^\]]+)\]/gi;
  const memoryMatches = [...rawResponse.matchAll(memoryRegex)];
  const responseText = rawResponse.replace(/\[MEMORY:[^\]]*\]/gi, "").trim();

  for (const match of memoryMatches) {
    const memContent = match[1]?.trim();
    if (memContent) {
      await db.insert(agentMemoriesTable).values({ agentId: agent.id, content: memContent });
    }
  }

  await db.update(connectionsTable)
    .set({
      requestCount: sql`${connectionsTable.requestCount} + 1`,
      lastUsed: new Date(),
    })
    .where(eq(connectionsTable.id, connection.id));

  await db.update(agentsTable).set({ lastActivity: new Date() }).where(eq(agentsTable.id, agent.id));

  await db.insert(activityTable).values({
    agentId: agent.id,
    connectionId: connection.id,
    appName: connection.appName,
    userMessage: body.message,
    agentResponse: responseText,
  });

  res.json({
    response: responseText,
    agentName: agent.name,
    sources: allSourceUrls.length > 0 ? allSourceUrls : undefined,
  });
});

export default router;
