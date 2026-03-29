import { eq, asc, and } from "drizzle-orm";
import {
  db, agentsTable, knowledgeTable, instructionsTable,
  agentMemoriesTable, agentToolsTable, agentIntegrationsTable,
  activityTable, agentAutomationsTable, automationRunsTable,
} from "@workspace/db";
import { openrouter } from "@workspace/integrations-openrouter-ai";
import { buildSystemPrompt } from "../routes/chat.js";
import { buildOpenAITools, callToolWebhook } from "./tools.js";
import { getToolsForIntegrations, executeIntegrationTool } from "./integrations-catalog.js";
import { braveWebSearch, formatSearchResultsForPrompt } from "./search.js";

export async function runAgentTask(
  agentId: number,
  prompt: string,
  contextVars: Record<string, string> = {}
): Promise<{ response: string; status: "success" | "error" }> {
  try {
    const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
    if (!agent) return { response: "Agent not found", status: "error" };

    const resolvedPrompt = Object.entries(contextVars).reduce(
      (p, [k, v]) => p.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v),
      prompt
    );

    const [knowledge, instructions, memories, agentTools, enabledIntegrations] = await Promise.all([
      db.select().from(knowledgeTable).where(eq(knowledgeTable.agentId, agentId)),
      db.select().from(instructionsTable).where(eq(instructionsTable.agentId, agentId)),
      db.select().from(agentMemoriesTable).where(eq(agentMemoriesTable.agentId, agentId)).orderBy(asc(agentMemoriesTable.createdAt)),
      db.select().from(agentToolsTable).where(eq(agentToolsTable.agentId, agentId)),
      db.select().from(agentIntegrationsTable).where(and(eq(agentIntegrationsTable.agentId, agentId), eq(agentIntegrationsTable.isEnabled, true))),
    ]);

    const enabledIntegrationIds = enabledIntegrations.map(i => i.serviceId);
    const systemPrompt = buildSystemPrompt(
      { ...agent, searchAvailable: !!process.env.BRAVE_SEARCH_API_KEY },
      knowledge, instructions, memories, enabledIntegrationIds
    );

    const model = agent.model || "openai/gpt-4.1-mini";
    const openAITools = buildOpenAITools(agentTools);
    const integrationTools = getToolsForIntegrations(enabledIntegrationIds);
    const integrationToolNames = new Set(integrationTools.map(t => t.name));

    for (const t of integrationTools) {
      openAITools.push({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters as Parameters<typeof openrouter.chat.completions.create>[0]["tools"][number]["function"]["parameters"],
        },
      });
    }

    if (agent.webSearchEnabled && process.env.BRAVE_SEARCH_API_KEY) {
      openAITools.push({
        type: "function",
        function: {
          name: "web_search",
          description: "Search the internet for information.",
          parameters: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
          },
        },
      });
    }

    type Msg = Parameters<typeof openrouter.chat.completions.create>[0]["messages"][number];
    const messages: Msg[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: resolvedPrompt },
    ];

    const MAX_TOOL_ITERATIONS = 5;
    let toolIterations = 0;
    let fullResponse = "";

    const runCall = async (callMessages: Msg[]): Promise<void> => {
      const response = await openrouter.chat.completions.create({
        model,
        max_tokens: 4096,
        messages: callMessages,
        stream: false,
        ...(openAITools.length > 0 ? { tools: openAITools as Parameters<typeof openrouter.chat.completions.create>[0]["tools"], tool_choice: "auto" as const } : {}),
      });

      const choice = (response as { choices?: { finish_reason?: string; message?: { content?: string | null; tool_calls?: unknown[] } }[] }).choices?.[0];
      const message = choice?.message;

      if (message?.content) {
        fullResponse += message.content;
      }

      const toolCalls = message?.tool_calls as { id: string; function: { name: string; arguments: string } }[] | undefined;
      if (choice?.finish_reason === "tool_calls" && toolCalls && toolCalls.length > 0 && toolIterations < MAX_TOOL_ITERATIONS) {
        toolIterations++;

        const toolResultMsgs: Msg[] = [];
        for (const tc of toolCalls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }

          let result: string;
          if (tc.function.name === "web_search") {
            const query = (args.query as string) || "";
            try {
              const results = await braveWebSearch(query);
              result = formatSearchResultsForPrompt(query, results);
            } catch { result = JSON.stringify({ error: "Search failed" }); }
          } else if (integrationToolNames.has(tc.function.name)) {
            result = await executeIntegrationTool(tc.function.name, args);
          } else {
            const toolDef = agentTools.find(t => t.name === tc.function.name);
            if (toolDef) {
              result = await callToolWebhook(toolDef.webhookUrl, tc.function.name, args);
            } else {
              result = JSON.stringify({ error: `Unknown tool: ${tc.function.name}` });
            }
          }

          toolResultMsgs.push({
            role: "tool" as const,
            tool_call_id: tc.id,
            content: result,
          } as Msg);
        }

        const nextMessages: Msg[] = [
          ...callMessages,
          { role: "assistant" as const, content: message.content ?? null, tool_calls: toolCalls } as Msg,
          ...toolResultMsgs,
        ];
        await runCall(nextMessages);
      }
    };

    await runCall(messages);

    const memoryRegex = /\[MEMORY:\s*([^\]]+)\]/gi;
    const memoryMatches = [...fullResponse.matchAll(memoryRegex)];
    const cleanedResponse = fullResponse
      .replace(/\[MEMORY:[^\]]*\]/gi, "")
      .replace(/\[SEARCH:[^\]]*\]/gi, "")
      .trim();

    for (const match of memoryMatches) {
      const memContent = match[1]?.trim();
      if (memContent) {
        await db.insert(agentMemoriesTable).values({ agentId, content: memContent });
      }
    }

    await db.insert(activityTable).values({
      agentId,
      userMessage: `[AUTOMATION] ${resolvedPrompt.slice(0, 200)}`,
      agentResponse: cleanedResponse.slice(0, 2000),
    });

    await db.update(agentsTable).set({ lastActivity: new Date() }).where(eq(agentsTable.id, agentId));

    return { response: cleanedResponse || "(no response)", status: "success" };
  } catch (err) {
    console.error("Agent runner error:", err);
    return { response: String(err), status: "error" };
  }
}

export async function executeAutomation(automationId: number, promptOverride?: string): Promise<void> {
  const [automation] = await db
    .select()
    .from(agentAutomationsTable)
    .where(eq(agentAutomationsTable.id, automationId));

  if (!automation) return;

  const prompt = promptOverride || automation.prompt;

  const [runRow] = await db
    .insert(automationRunsTable)
    .values({
      automationId,
      prompt,
      status: "pending",
    })
    .returning();

  const { response, status } = await runAgentTask(automation.agentId, prompt);

  await db
    .update(automationRunsTable)
    .set({ response, status })
    .where(eq(automationRunsTable.id, runRow.id));

  await db
    .update(agentAutomationsTable)
    .set({ lastRunAt: new Date() })
    .where(eq(agentAutomationsTable.id, automationId));
}
