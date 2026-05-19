/**
 * MCP HTTP endpoint — exposes OpSoul's universal toolset over the Model
 * Context Protocol so external MCP-capable agents (Hajeri, Claude, GPT,
 * Cursor, any MCP client) can call the same tools that internal operators
 * use.
 *
 * Mount path (set in index.ts):
 *   POST /api/operators/:operatorId/conversations/:convId/mcp
 *
 * The URL binds each MCP session to a specific operator + conversation.
 * Tool calls execute against that operator's scope, write to that
 * conversation, persist into that operator's memory + KB — identical
 * persistence to internal chat-route tool calls. Owner can see MCP
 * activity in the same conversation history.
 *
 * Auth: same JWT/cookie flow as chat.ts (requireAuth middleware verifies
 * req.owner.ownerId owns the operator). External MCP clients need a valid
 * OpSoul session token in the Authorization header or cookie.
 *
 * Transport: StreamableHTTPServerTransport in stateless mode (sessionIdGenerator
 * undefined). Each POST creates a fresh per-request server + transport, handles
 * one MCP request (initialize, tools/list, or tools/call), then both are GC'd.
 * Stateful mode (long-lived sessions with session IDs) is a future upgrade
 * when we add WebSocket support.
 */

import { Router, type Request, type Response } from 'express';
import { db } from '@workspace/db';
import {
  operatorsTable,
  conversationsTable,
  operatorSecretsTable,
} from '@workspace/db';
import { and, eq } from 'drizzle-orm';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { buildOwnerScope } from '../utils/scopeResolver.js';
import { isWebSearchAvailable } from '../utils/capabilityEngine.js';
import { createMcpServerForContext } from '../utils/mcpServer.js';
import type { ToolHandlerContext } from '../utils/toolHandlers.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

/**
 * POST / — handle a single MCP request (initialize, tools/list, tools/call,
 * etc.) bound to the operator + conversation in the URL.
 *
 * Body: standard JSON-RPC 2.0 envelope per MCP spec.
 * Response: standard JSON-RPC 2.0 reply, possibly streamed via SSE.
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  // 1. Resolve operator (owner-scoped) — same pattern as chat.ts
  const [operator] = await db
    .select()
    .from(operatorsTable)
    .where(and(
      eq(operatorsTable.id, req.params.operatorId as string),
      eq(operatorsTable.ownerId, req.owner!.ownerId),
    ));
  if (!operator) {
    res.status(404).json({ error: 'Operator not found' });
    return;
  }

  // 2. Resolve conversation in the operator's owner scope
  const scope = buildOwnerScope(req.owner!.ownerId);
  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(and(
      eq(conversationsTable.id, req.params.convId as string),
      eq(conversationsTable.operatorId, operator.id),
      eq(conversationsTable.scopeId, scope.scopeId),
    ));
  if (!conv) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  // 3. Gather context the handlers need (same data chat.ts collects)
  const liveSecrets = await db
    .select({ key: operatorSecretsTable.key })
    .from(operatorSecretsTable)
    .where(eq(operatorSecretsTable.operatorId, operator.id));

  const handlerCtx: ToolHandlerContext = {
    operatorId: operator.id,
    ownerId: operator.ownerId,
    conversationId: conv.id,
    scope: {
      scopeId: scope.scopeId,
      scopeTrust: scope.scopeTrust,
      // owner scope corresponds to the 'owner' scope type
      scopeType: 'owner',
    },
    mandate: operator.mandate ?? '',
  };

  // 4. Build per-request MCP server bound to this operator
  const server = createMcpServerForContext({
    handlerCtx,
    hasWebSearch: isWebSearchAvailable(),
    liveSecrets: liveSecrets.map((s) => s.key),
  });

  // 5. Stateless transport — one server per request
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err: any) {
    console.error('[mcp] handleRequest failed:', err?.message);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'MCP request failed',
        detail: err?.message ?? 'unknown error',
      });
    }
  }
});

/**
 * GET / — convenience probe. Returns a tiny JSON describing the endpoint
 * so a curl/browser hit doesn't get a confusing 404 or Method Not Allowed.
 * The actual MCP protocol uses POST.
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  res.json({
    protocol: 'Model Context Protocol',
    transport: 'streamable_http',
    method: 'POST',
    operatorId: req.params.operatorId,
    conversationId: req.params.convId,
    info: 'Send MCP JSON-RPC 2.0 requests via POST to this URL.',
    examples: {
      list_tools: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      call_tool: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_current_time', arguments: { timezone: 'Asia/Dubai' } } },
    },
  });
});

export default router;
