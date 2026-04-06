# OpSoul

## Overview

OpSoul is an AI operator platform featuring a 5-layer identity architecture, dual knowledge bases, and a GROW self-evolution system. It includes multi-tenant JWT authentication and pgvector semantic search for enhanced AI capabilities. The platform aims to provide a robust framework for managing and evolving AI agents, offering advanced features for identity management, self-improvement, and integration with external services. The business vision is to empower users with highly capable and adaptable AI operators, enhancing productivity and enabling complex AI-driven workflows.

## User Preferences

I want iterative development and detailed explanations. Ask before making major changes.

## System Architecture

OpSoul is structured as a monorepo containing shared libraries and distinct services. The core components include an Express-based API server (`opsoul-api`) and a React/Vite frontend (`opsoul-hub`).

**Monorepo Structure:**
- `lib/db`: Drizzle ORM with PostgreSQL schema for all OpSoul tables.
- `lib/opsoul-utils`: Shared utilities for environment validation, AES-256-GCM encryption, and OpenAI embeddings.
- `artifacts/opsoul-api`: Express REST API server running on port 3001, handling authentication, operator management, and core business logic.
- `artifacts/opsoul-hub`: React/Vite frontend application served at `/`, providing the user interface for interacting with the platform.

**Database:**
The system uses PostgreSQL with Drizzle ORM, managing 23 tables. Key tables include `owners`, `operators` (with 5-layer identity), `conversations`, `grow_proposals`, `owner_kb`, `operator_kb` (for knowledge bases), and `self_awareness`. Encryption (AES-256-GCM) is used for sensitive data like integration tokens.

**API Server (`opsoul-api`):**
- **Auth:** JWT-based authentication with 24-hour access tokens and 30-day refresh tokens. Supports email/password and Google OAuth.
- **Operator Management:** CRUD operations for AI operators, including setting identity layers, managing GROW lock levels (OPEN, CONTROLLED, LOCKED, FROZEN), and handling Layer 1 identity locking (preventing operator self-modification).
- **Soul Schema:** A Zod-validated schema defines the Layer 2 soul, encompassing personality traits, tone, communication style, quirks, values, emotional range, decision-making, and conflict resolution.
- **Integrations:** Routes for initiating and handling Google OAuth integrations, securely storing encrypted tokens.

**AI Stack:**
- **Live Chat:** `anthropic/claude-sonnet-4-5` (default), `anthropic/claude-haiku-4-5` (short/no context), `google/gemini-flash-2.0` (attachments) via OpenRouter. Operator can override per-operator in Model & AI settings.
- **GROW Evaluation:** `anthropic/claude-sonnet-4-5` via OpenRouter (explicit, separate from CHAT_MODEL).
- **Memory Distillation:** `anthropic/claude-haiku-4-5` — used in both memoryEngine.ts and kbIntake.ts.
- **Embeddings:** `text-embedding-3-small` via OpenAI direct.
- **Llama is permanently removed** — `meta-llama/llama-3.3-70b-instruct` has been purged from all code paths: model picker, memory distillation, KB intake, and API key verification. It is not available as an operator default model.
- **Agency (Skill Trigger):** Evaluates ALL installed skills per message via cosine similarity. Selects the BEST match (highest similarity) above threshold 0.45. Does NOT take the first match — all skills are scored before a winner is chosen.

**Frontend (`opsoul-hub`):**
- Built with React and Vite, featuring a dark mission-control aesthetic.
- Provides a dashboard for operator management and a detailed workspace for each operator, including sections for Identity, Chat, Knowledge Base, GROW & Self-Awareness, Memory, Integrations, Mission Contexts, Skills, and Capability Requests.
- Implements SSE streaming chat with live typing indicators.
- Supports mobile navigation with a hamburger menu.

**Key Features:**
- **5-Layer Identity Architecture:** Comprehensive definition of an AI operator's identity.
- **GROW Self-Evolution System:** AI operators can propose and evaluate changes to their own "soul" based on interactions and learning.
- **Dual Knowledge Bases:** Owner-level and operator-level knowledge bases with pgvector semantic search and RAG context assembly.
- **Memory System:** Semantic memory entries with vector embeddings, decay, and AI-driven distillation from conversations.
- **Self-Awareness Engine:** Computes and tracks an operator's `identity_state`, `soul_state`, `capability_state`, `task_history`, and a `health_score`.
- **Skills Engine:** Platform-wide library of skills and per-operator skill assignment.
- **Mission Contexts:** Allows for conversation-specific overrides of tone, KB, and GROW behavior.
- **Safe Mode:** A toggle to restrict GROW cron operations.
- **Drift Cron:** Periodically calculates semantic distance between original and current operator souls to detect behavioral drift.

## External Dependencies

- **OpenRouter:** For AI model access (Llama 3.3 70B for chat, Claude Sonnet 4-5 for GROW evaluation).
- **OpenAI:** For `text-embedding-3-small` embeddings.
- **PostgreSQL:** The primary database.
- **SendGrid:** For email services (e.g., forgot password, welcome emails).
- **Google OAuth:** For user authentication and integration with Google services (Gmail, Calendar, Drive).
- **GitHub:** For version control and deployment (requires GitHub PAT).