import { Router, type IRouter } from "express";
import { eq, sql, asc } from "drizzle-orm";
import { db, agentsTable, connectionsTable, knowledgeTable, instructionsTable, activityTable, agentMemoriesTable, agentToolsTable } from "@workspace/db";
import { openrouter } from "@workspace/integrations-openrouter-ai";
import { buildSystemPrompt } from "./chat";
import { braveWebSearch, formatSearchResultsForPrompt } from "../services/search";
import { buildOpenAITools, callToolWebhook } from "../services/tools";

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

  const [knowledge, instructions, memories, agentTools] = await Promise.all([
    db.select().from(knowledgeTable).where(eq(knowledgeTable.agentId, agent.id)),
    db.select().from(instructionsTable).where(eq(instructionsTable.agentId, agent.id)),
    db.select().from(agentMemoriesTable).where(eq(agentMemoriesTable.agentId, agent.id)).orderBy(asc(agentMemoriesTable.createdAt)),
    db.select().from(agentToolsTable).where(eq(agentToolsTable.agentId, agent.id)).orderBy(asc(agentToolsTable.createdAt)),
  ]);

  const systemPrompt = buildSystemPrompt(
    { ...agent, searchAvailable: !!process.env.BRAVE_SEARCH_API_KEY },
    knowledge, instructions, memories
  );

  const history = (body.conversationHistory || []).slice(-20).map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const model = agent.model || "openai/gpt-4.1-mini";
  const webSearchEnabled = agent.webSearchEnabled;
  const hasBraveKey = !!process.env.BRAVE_SEARCH_API_KEY;

  const openAITools = buildOpenAITools(agentTools);

  type Msg = { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_call_id?: string; tool_calls?: unknown[] };

  const messages: Msg[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: body.message },
  ];

  let searchContextMessages: Msg[] = [];
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
          content: `The following are current web search results to help you answer the user's question. Use them to give accurate, up-to-date information:\n\n${searchContext}\n\nIMPORTANT: You now have the search results above. Answer the user's question directly using these results. Do NOT output any [SEARCH: ...] tags in your response.`,
        },
      ];
    }
  }

  const finalMessages: Msg[] = searchContextMessages.length > 0
    ? [messages[0], ...searchContextMessages, ...messages.slice(1)]
    : messages;

  const callWithToolLoop = async (callMessages: Msg[]): Promise<string> => {
    const callParams: Parameters<typeof openrouter.chat.completions.create>[0] = {
      model,
      max_tokens: 8192,
      messages: callMessages as Parameters<typeof openrouter.chat.completions.create>[0]["messages"],
      ...(openAITools.length > 0 ? { tools: openAITools as Parameters<typeof openrouter.chat.completions.create>[0]["tools"], tool_choice: "auto" as const } : {}),
    };

    const completion = await openrouter.chat.completions.create(callParams);
    const choice = completion.choices[0];

    if (choice?.finish_reason === "tool_calls" && choice.message.tool_calls) {
      const assistantMsg: Msg = {
        role: "assistant",
        content: choice.message.content ?? null,
        tool_calls: choice.message.tool_calls,
      };

      const toolResultMsgs: Msg[] = [];
      for (const tc of choice.message.tool_calls) {
        const toolDef = agentTools.find(t => t.name === tc.function.name);
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }

        const result = toolDef
          ? await callToolWebhook(toolDef.webhookUrl, tc.function.name, args)
          : JSON.stringify({ error: `Unknown tool: ${tc.function.name}` });

        toolResultMsgs.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }

      return callWithToolLoop([...callMessages, assistantMsg, ...toolResultMsgs]);
    }

    return choice?.message?.content ?? "";
  };

  const rawResponse = await callWithToolLoop(finalMessages);

  const memoryRegex = /\[MEMORY:\s*([^\]]+)\]/gi;
  const memoryMatches = [...rawResponse.matchAll(memoryRegex)];
  const responseText = rawResponse
    .replace(/\[MEMORY:[^\]]*\]/gi, "")
    .replace(/\[SEARCH:[^\]]*\]/gi, "")
    .trim();

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
    sources: allSourceUrls.length > 0 ? [...new Set(allSourceUrls)] : undefined,
  });
});

export default router;
