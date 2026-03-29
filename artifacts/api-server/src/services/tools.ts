export interface ToolParam {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  required: boolean;
}

export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  };
}

export function buildOpenAITools(
  tools: { name: string; description: string; parametersSchema: string; webhookUrl: string }[]
): OpenAITool[] {
  return tools.map(tool => {
    let params: ToolParam[] = [];
    try {
      params = JSON.parse(tool.parametersSchema);
      if (!Array.isArray(params)) params = [];
    } catch {
      params = [];
    }

    const properties: Record<string, { type: string; description: string }> = {};
    const required: string[] = [];

    for (const p of params) {
      properties[p.name] = { type: p.type, description: p.description };
      if (p.required) required.push(p.name);
    }

    return {
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: "object" as const,
          properties,
          required,
        },
      },
    };
  });
}

function isValidHttpUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function callToolWebhook(
  webhookUrl: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  if (!isValidHttpUrl(webhookUrl)) {
    return JSON.stringify({ error: `Invalid webhook URL for tool "${toolName}"` });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return JSON.stringify({ error: `Tool "${toolName}" webhook returned HTTP ${response.status}` });
    }

    const text = await response.text();
    return text || JSON.stringify({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: `Tool "${toolName}" webhook call failed: ${msg}` });
  }
}
