/**
 * Automation / tasks tools — recurring task lifecycle ported from OpSoul's
 * agency tools (schedule_task / update_task / pause_task / resume_task /
 * delete_task / run_task_now / list_tasks / get_task_history).
 *
 * In OpSoul these handlers talk directly to a Drizzle `tasksTable` and the
 * `runSingleTask` cron executor. Here that backend is abstracted behind a
 * pluggable `TaskStore` connector resolved from `ctx.connectors.tasks`: a
 * deployment wires its own store (Postgres, the OpSoul tasks DB, an in-memory
 * stub, …) and the tool code never changes. When no store is wired the tools
 * return a clear, non-fatal "not connected" result rather than throwing.
 *
 * Behaviour preserved from OpSoul:
 *  - schedule: only `daily` | `weekly`; new tasks start `active`.
 *  - run_task_now executes in-process WITHOUT advancing the recurrence
 *    (rescheduleAfter:false) — the cron tick is left untouched.
 *  - get_task_history returns the last run's time, duration, and the stored
 *    summary (capped at 300 chars, as the cron writes it).
 */

import type { ToolContext, ToolDef, ToolResult } from "@cultureyes/types";
import { ok, requireString } from "./_shared.js";

// ─── pluggable TaskStore connector ──────────────────────────────────────────

/** A recurring schedule cadence. Mirrors OpSoul's `taskType`. */
export type TaskSchedule = "daily" | "weekly";

/** Lifecycle state of a task. */
export type TaskStatus = "active" | "paused";

/** A stored recurring task. Mirrors OpSoul's task row shape. */
export interface Task {
  name: string;
  prompt: string;
  schedule: TaskSchedule;
  status: TaskStatus;
  /** ISO timestamp of the most recent execution, or null if never run. */
  lastRunAt?: string | null;
  /** ISO timestamp of the next scheduled fire, if known. */
  nextRunAt?: string | null;
  /** ≤300-char summary of the last run, as written by the executor. */
  lastRunSummary?: string | null;
  /** Wall-clock seconds the last run took. */
  lastRunDurationSec?: number | null;
}

/** Fields that may be patched on an existing task. */
export interface TaskPatch {
  name?: string;
  prompt?: string;
  schedule?: TaskSchedule;
}

/** Outcome of executing a task in-process. Mirrors `runSingleTask`. */
export interface TaskRunResult {
  ok: boolean;
  /** ≤300-char human summary of what the run produced (or the error). */
  summary: string;
  durationSec: number;
}

/**
 * A recurring-task backend (the OpSoul tasks DB + cron, a Postgres store, an
 * in-memory stub, … — pluggable). All methods key on the human task `name`
 * within the deployment's scope.
 */
export interface TaskStore {
  name: string;
  /** Create a new recurring task; starts `active`. Returns the created task. */
  create(task: {
    name: string;
    prompt: string;
    schedule: TaskSchedule;
  }): Promise<Task>;
  /** Patch an existing task by current name. Returns the task, or null if absent. */
  update(name: string, patch: TaskPatch): Promise<Task | null>;
  /** Set status; returns true if a task was matched. */
  setStatus(name: string, status: TaskStatus): Promise<boolean>;
  /** Delete a task; returns true if a task was removed. */
  delete(name: string): Promise<boolean>;
  /** Execute once in-process without advancing recurrence; null if absent. */
  runNow(name: string): Promise<TaskRunResult | null>;
  /** List all tasks in this scope. */
  list(): Promise<Task[]>;
  /** Fetch the most recent execution record; null if the task is absent. */
  history(name: string): Promise<Task | null>;
}

/** The tasks slice of the connector bag. */
interface TasksConnectors {
  tasks?: TaskStore;
}

function taskStore(ctx: ToolContext): TaskStore | undefined {
  const conn =
    (ctx as unknown as { connectors?: TasksConnectors }).connectors ?? {};
  return conn.tasks;
}

/** Shared graceful failure when no TaskStore is wired for the deployment. */
function notConnected(): ToolResult {
  return {
    ok: false,
    content: "Task automation is not connected for this deployment.",
    error: "tasks connector not provisioned",
  };
}

// ─── tools ──────────────────────────────────────────────────────────────────

export const scheduleTask: ToolDef = {
  name: "schedule_task",
  description:
    "Creates a recurring task with a daily or weekly schedule. The task fires on schedule, executing a stored prompt.",
  domain: "workflow",
  schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Short label for the task." },
      prompt: {
        type: "string",
        description: "The prompt that will execute on each scheduled run.",
      },
      schedule: {
        type: "string",
        enum: ["daily", "weekly"],
        description: "How often the task fires.",
      },
    },
    required: ["name", "prompt", "schedule"],
  },
  async execute(params, ctx) {
    const name = requireString(params, "name");
    const prompt = requireString(params, "prompt");
    const schedule = params.schedule;
    if (schedule !== "daily" && schedule !== "weekly") {
      return {
        ok: false,
        content:
          'schedule_task requires "schedule" to be "daily" or "weekly".',
        error: "invalid schedule",
      };
    }

    const store = taskStore(ctx);
    if (!store) return notConnected();

    const task = await store.create({ name, prompt, schedule });
    const nextRun = task.nextRunAt
      ? ` First run at ${task.nextRunAt}.`
      : "";
    return ok(
      `Task "${name}" scheduled to run ${schedule}.${nextRun} You can pause, edit, or delete it later.`,
      { task },
    );
  },
};

export const updateTask: ToolDef = {
  name: "update_task",
  description:
    "Modifies the name, prompt, or schedule of an existing task, identified by its current name.",
  domain: "workflow",
  schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Current name of the task." },
      newName: { type: "string", description: "Optional new name." },
      newPrompt: {
        type: "string",
        description: "Optional new prompt — what each future run will read.",
      },
      newSchedule: {
        type: "string",
        enum: ["daily", "weekly"],
        description: "Optional new schedule.",
      },
    },
    required: ["name"],
  },
  async execute(params, ctx) {
    const name = requireString(params, "name");
    const store = taskStore(ctx);
    if (!store) return notConnected();

    const patch: TaskPatch = {};
    if (typeof params.newName === "string" && params.newName.length > 0) {
      patch.name = params.newName;
    }
    if (typeof params.newPrompt === "string" && params.newPrompt.length > 0) {
      patch.prompt = params.newPrompt;
    }
    if (params.newSchedule === "daily" || params.newSchedule === "weekly") {
      patch.schedule = params.newSchedule;
    }

    if (Object.keys(patch).length === 0) {
      return ok(`No fields to update on "${name}".`, { updated: false });
    }

    const task = await store.update(name, patch);
    if (!task) {
      return ok(`No task named "${name}" was found.`, { updated: false });
    }
    return ok(`Task "${name}" updated.`, { updated: true, task });
  },
};

export const pauseTask: ToolDef = {
  name: "pause_task",
  description:
    "Sets a task to paused state. A paused task is preserved but does not fire on its schedule.",
  domain: "workflow",
  schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Name of the task to pause." },
    },
    required: ["name"],
  },
  async execute(params, ctx) {
    const name = requireString(params, "name");
    const store = taskStore(ctx);
    if (!store) return notConnected();

    const matched = await store.setStatus(name, "paused");
    return ok(
      matched
        ? `Task "${name}" paused. It will not fire until you resume it.`
        : `No task named "${name}" was found.`,
      { paused: matched },
    );
  },
};

export const resumeTask: ToolDef = {
  name: "resume_task",
  description: "Sets a paused task to active state, resuming its scheduled firing.",
  domain: "workflow",
  schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Name of the paused task to resume." },
    },
    required: ["name"],
  },
  async execute(params, ctx) {
    const name = requireString(params, "name");
    const store = taskStore(ctx);
    if (!store) return notConnected();

    const matched = await store.setStatus(name, "active");
    return ok(
      matched
        ? `Task "${name}" resumed.`
        : `No task named "${name}" was found.`,
      { resumed: matched },
    );
  },
};

export const deleteTask: ToolDef = {
  name: "delete_task",
  description: "Removes a task permanently from the task list.",
  domain: "workflow",
  schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Name of the task to delete." },
    },
    required: ["name"],
  },
  async execute(params, ctx) {
    const name = requireString(params, "name");
    const store = taskStore(ctx);
    if (!store) return notConnected();

    const matched = await store.delete(name);
    return ok(
      matched
        ? `Task "${name}" deleted.`
        : `No task named "${name}" was found.`,
      { deleted: matched },
    );
  },
};

export const runTaskNow: ToolDef = {
  name: "run_task_now",
  description:
    "Immediately executes a scheduled task by name, in-process, without waiting for its next tick. Its recurrence schedule continues unchanged afterward.",
  domain: "workflow",
  schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Task name to run now." },
    },
    required: ["name"],
  },
  async execute(params, ctx) {
    const name = requireString(params, "name");
    const store = taskStore(ctx);
    if (!store) return notConnected();

    const result = await store.runNow(name);
    if (!result) {
      return ok(`No task named "${name}" was found.`, { ran: false });
    }
    return ok(
      result.ok
        ? `Task "${name}" executed in ${result.durationSec.toFixed(1)}s. Result: ${result.summary}`
        : `Task "${name}" failed: ${result.summary}`,
      { ran: true, result },
    );
  },
};

export const listTasks: ToolDef = {
  name: "list_tasks",
  description:
    "Returns the scheduled automations with name, schedule, status, last run time, and next run time.",
  domain: "workflow",
  schema: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const store = taskStore(ctx);
    if (!store) return notConnected();

    const tasks = await store.list();
    if (tasks.length === 0) return ok("No scheduled tasks.", { tasks });

    const lines = tasks.map(
      (t) =>
        `"${t.name}" — ${t.schedule}, ${t.status}` +
        (t.lastRunAt ? `, last run ${t.lastRunAt}` : ", not yet run") +
        (t.nextRunAt ? `, next ${t.nextRunAt}` : ""),
    );
    return ok(`Scheduled tasks (${tasks.length}): ${lines.join("; ")}.`, {
      tasks,
    });
  },
};

export const getTaskHistory: ToolDef = {
  name: "get_task_history",
  description:
    "Returns the most recent execution record for a task — last run time, duration, and the stored summary.",
  domain: "workflow",
  schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Task name." },
    },
    required: ["name"],
  },
  async execute(params, ctx) {
    const name = requireString(params, "name");
    const store = taskStore(ctx);
    if (!store) return notConnected();

    const task = await store.history(name);
    if (!task) {
      return ok(`No task named "${name}" was found.`, { history: null });
    }
    if (!task.lastRunAt) {
      return ok(`Task "${name}" has not run yet.`, { history: task });
    }

    const durationSec = task.lastRunDurationSec ?? null;
    // The executor caps the summary at 300 chars; enforce it defensively here.
    const summary = (task.lastRunSummary ?? "(empty)").slice(0, 300);
    return ok(
      `Last run of "${name}": at ${task.lastRunAt}, took ${durationSec ?? "?"}s. Summary: ${summary}`,
      { history: task },
    );
  },
};

export const tasksTools: ToolDef[] = [
  scheduleTask,
  updateTask,
  pauseTask,
  resumeTask,
  deleteTask,
  runTaskNow,
  listTasks,
  getTaskHistory,
];
