import { eq, and } from "drizzle-orm";
import { db, agentAutomationsTable } from "@workspace/db";
import { executeAutomation } from "./agent-runner.js";

function matchField(pattern: string, value: number): boolean {
  if (pattern === "*") return true;
  if (pattern.includes(",")) {
    return pattern.split(",").some(p => matchField(p.trim(), value));
  }
  if (pattern.includes("/")) {
    const [range, step] = pattern.split("/");
    const start = range === "*" ? 0 : parseInt(range, 10);
    return (value - start) % parseInt(step, 10) === 0 && value >= start;
  }
  if (pattern.includes("-")) {
    const [min, max] = pattern.split("-").map(Number);
    return value >= min && value <= max;
  }
  return parseInt(pattern, 10) === value;
}

function shouldRunNow(cron: string, now: Date): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [minute, hour, dayMonth, month, dayWeek] = parts;
  return (
    matchField(minute, now.getMinutes()) &&
    matchField(hour, now.getHours()) &&
    matchField(dayMonth, now.getDate()) &&
    matchField(month, now.getMonth() + 1) &&
    matchField(dayWeek, now.getDay())
  );
}

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  const now = new Date();
  now.setSeconds(0, 0);

  try {
    const automations = await db
      .select()
      .from(agentAutomationsTable)
      .where(and(
        eq(agentAutomationsTable.isEnabled, true),
        eq(agentAutomationsTable.triggerType, "schedule")
      ));

    for (const automation of automations) {
      if (!automation.cronExpression) continue;

      try {
        if (shouldRunNow(automation.cronExpression, now)) {
          const lastRun = automation.lastRunAt;
          if (lastRun) {
            const lastRunMinute = new Date(lastRun);
            lastRunMinute.setSeconds(0, 0);
            if (Math.abs(now.getTime() - lastRunMinute.getTime()) < 60_000) {
              continue;
            }
          }

          console.log(`[Scheduler] Running automation ${automation.id} (${automation.name})`);
          executeAutomation(automation.id).catch(err => {
            console.error(`[Scheduler] Automation ${automation.id} failed:`, err);
          });
        }
      } catch (err) {
        console.error(`[Scheduler] Error checking automation ${automation.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[Scheduler] Error loading automations:", err);
  }
}

export function startScheduler(): void {
  if (schedulerInterval) return;
  console.log("[Scheduler] Starting automation scheduler (polling every 60s)");
  schedulerInterval = setInterval(() => { tick().catch(console.error); }, 60_000);
  const nextMinute = new Date();
  nextMinute.setSeconds(60 - nextMinute.getSeconds(), 0);
  setTimeout(() => { tick().catch(console.error); }, nextMinute.getTime() - Date.now());
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
