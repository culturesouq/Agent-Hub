/**
 * App-builder tools (domain: appbuilder) for elbani.studio (Bani Studio).
 *
 * Bani is an AI app-builder: its agent scaffolds a project, edits code, installs
 * packages, runs builds/tests, provisions a database, and ships a preview +
 * deployment with an optional custom domain. None of that is OpSoul-ported — it
 * is a fresh toolset — but it obeys the exact SDK tool contract used by
 * web.ts / data.ts / dev.ts.
 *
 * Every external effect goes through a pluggable connector resolved from
 * `ctx.connectors`, NEVER the host filesystem or a raw shell. A deployment wires
 * its own sandbox/host (a container, a Firecracker microVM, a remote build
 * service, …). When the required connector is absent each tool returns a
 * graceful, non-fatal `ok:false` "<tool> is not connected for this deployment."
 * result — never a throw, never a placeholder stub.
 *
 *   - ProjectStore   → ctx.connectors.project         (the project file tree)
 *   - BuildSandbox   → ctx.connectors.sandbox         (isolated command/build exec)
 *   - Deployer       → ctx.connectors.deployer        (preview + deploy + domain)
 *   - DbProvisioner  → ctx.connectors.db_provisioner  (DISTINCT from the read-only `db`)
 *
 * Env-var tools persist through the durable `store` connector (the SDK's
 * secure-storage substrate) under a per-deployment namespace, so a build's
 * runtime config survives without a bespoke backend.
 */

import type { ToolContext, ToolDef, ToolResult } from "@cultureyes/types";
import type { StoreSink } from "./_shared.js";
import { ok, requireString } from "./_shared.js";

// ─── pluggable connector interfaces ─────────────────────────────────────────

/** Result of a command/build/test/lint run inside the sandbox. */
export interface SandboxRun {
  /** Process exit code; 0 means success. */
  exitCode: number;
  /** Combined stdout/stderr (or split if the host provides it). */
  output: string;
  /** Optional wall-clock duration in milliseconds. */
  durationMs?: number;
}

/** A single entry in a project-tree listing. */
export interface ProjectFileEntry {
  path: string;
  kind: "file" | "dir";
  /** Optional size in bytes for files. */
  size?: number;
}

/**
 * The project file tree — the editable source of the app being built. An
 * implementation maps these onto its own storage (a workspace volume, an object
 * store, a git working tree, …). Paths are repo-relative POSIX paths.
 */
export interface ProjectStore {
  name: string;
  /** Lays down a starter project from a named template; returns created paths. */
  scaffold(template: string, projectName: string): Promise<{ files: string[] }>;
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
  /** Lists files under `dir` (default: project root). */
  listFiles(dir?: string): Promise<ProjectFileEntry[]>;
  deleteFile(path: string): Promise<void>;
  /** Applies a unified-diff patch to a single file. */
  applyPatch(path: string, patch: string): Promise<void>;
  /** Captures a labelled snapshot of the whole tree; returns its id. */
  snapshot(label?: string): Promise<{ snapshotId: string }>;
  /** Restores the tree to a previously captured snapshot. */
  rollback(snapshotId: string): Promise<void>;
}

/**
 * An isolated execution sandbox bound to the project tree. Commands run inside
 * the deployment's own container/VM — the SDK process never shells out itself.
 */
export interface BuildSandbox {
  name: string;
  runCommand(cmd: string): Promise<SandboxRun>;
  installPackage(pkg: string, opts?: { dev?: boolean }): Promise<SandboxRun>;
  removePackage(pkg: string): Promise<SandboxRun>;
  build(): Promise<SandboxRun>;
  /** Starts the dev server; returns its run handle and (if known) a URL. */
  startDevServer(): Promise<SandboxRun & { url?: string }>;
  runTests(filter?: string): Promise<SandboxRun>;
  lint(): Promise<SandboxRun>;
  format(): Promise<SandboxRun>;
}

/** A deployment target — preview, tiered deploy, and custom-domain binding. */
export interface Deployer {
  name: string;
  /** Returns the ephemeral preview URL for the current build. */
  previewUrl(): Promise<{ url: string }>;
  /** Ships the app at an optional tier (e.g. "free" | "pro" | "scale"). */
  deploy(opts?: { tier?: string }): Promise<{ url: string; tier?: string }>;
  /** Binds a custom domain; returns DNS records the user must set, if any. */
  connectDomain(domain: string): Promise<{
    domain: string;
    status: string;
    dnsRecords?: Record<string, unknown>[];
  }>;
}

/**
 * A database provisioner for the built app. DISTINCT from the read-only `db`
 * connector (DbConnector) used by data tools: this one creates/migrates/seeds
 * the app's own datastore, it does not answer read queries.
 */
export interface DbProvisioner {
  name: string;
  /** Provisions a datastore of `kind` (e.g. "postgres" | "sqlite" | "kv"). */
  provision(kind: string): Promise<{ kind: string; connectionRef: string }>;
  /** Runs pending migrations, or a single named one. */
  runMigration(name?: string): Promise<SandboxRun>;
  /** Seeds the datastore with starter/fixture data. */
  seed(): Promise<SandboxRun>;
}

/** The optional app-builder connector bag attached to the context. */
export interface AppBuilderConnectors {
  project?: ProjectStore;
  sandbox?: BuildSandbox;
  deployer?: Deployer;
  db_provisioner?: DbProvisioner;
  /** Durable KV substrate, reused for env-var persistence. */
  store?: StoreSink;
}

/** Reads the app-builder connector bag off the context without widening it. */
function appConnectors(ctx: ToolContext): AppBuilderConnectors {
  return (
    (ctx as unknown as { connectors?: AppBuilderConnectors }).connectors ?? {}
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function notConnected(tool: string): ToolResult {
  return {
    ok: false,
    content: `${tool} is not connected for this deployment.`,
    error: `missing connector for ${tool}`,
  };
}

/** Optional non-empty string param (undefined when absent or blank). */
function stringParam(
  params: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = params[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Optional boolean param (undefined when not a boolean). */
function boolParam(
  params: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const v = params[key];
  return typeof v === "boolean" ? v : undefined;
}

/**
 * Turns a sandbox run into a tool result. A non-zero exit is a real, expected
 * outcome of a build/test/lint — reported as `ok:false` with the logs intact,
 * never a throw — so the agent can read the failure and react.
 */
function fromRun(action: string, run: SandboxRun): ToolResult {
  const tail = run.output.replace(/\s+$/, "").slice(-4000);
  if (run.exitCode === 0) {
    return ok(`${action} succeeded (exit 0).`, {
      exitCode: run.exitCode,
      output: tail,
      durationMs: run.durationMs,
    });
  }
  return {
    ok: false,
    content: `${action} failed (exit ${run.exitCode}).`,
    error: `exit ${run.exitCode}`,
    data: { exitCode: run.exitCode, output: tail, durationMs: run.durationMs },
  };
}

/** Per-deployment namespace for env-var keys persisted in the `store` sink. */
function envKey(ctx: ToolContext, name: string): string {
  return `appbuilder:env:${ctx.deploymentId}:${name}`;
}

// ─── project tools ──────────────────────────────────────────────────────────

const scaffoldProject: ToolDef = {
  name: "scaffold_project",
  description:
    "Creates a new app project from a named starter template (e.g. next-app, vite-react, node-api). Returns the list of files created.",
  domain: "appbuilder",
  schema: {
    type: "object",
    properties: {
      template: {
        type: "string",
        description: "Template id, e.g. next-app / vite-react / node-api.",
      },
      name: { type: "string", description: "Project name (folder/package name)." },
    },
    required: ["template", "name"],
  },
  async execute(params, ctx) {
    const template = requireString(params, "template");
    const name = requireString(params, "name");
    const project = appConnectors(ctx).project;
    if (!project) return notConnected("scaffold_project");
    const { files } = await project.scaffold(template, name);
    return ok(
      `Scaffolded "${name}" from template "${template}" (${files.length} file${
        files.length === 1 ? "" : "s"
      }).`,
      { template, name, files },
    );
  },
};

const writeCodeFile: ToolDef = {
  name: "write_code_file",
  description:
    "Writes (creates or overwrites) a file in the project tree at a repo-relative path.",
  domain: "appbuilder",
  schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Repo-relative POSIX path." },
      content: { type: "string", description: "Full file contents." },
    },
    required: ["path", "content"],
  },
  async execute(params, ctx) {
    const path = requireString(params, "path");
    const content = requireString(params, "content");
    const project = appConnectors(ctx).project;
    if (!project) return notConnected("write_code_file");
    await project.writeFile(path, content);
    return ok(`Wrote ${content.length} byte${
      content.length === 1 ? "" : "s"
    } to ${path}.`, { path, bytes: content.length });
  },
};

const readCodeFile: ToolDef = {
  name: "read_code_file",
  description: "Reads a file from the project tree at a repo-relative path.",
  domain: "appbuilder",
  schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Repo-relative POSIX path." },
    },
    required: ["path"],
  },
  async execute(params, ctx) {
    const path = requireString(params, "path");
    const project = appConnectors(ctx).project;
    if (!project) return notConnected("read_code_file");
    const content = await project.readFile(path);
    return ok(`Read ${content.length} byte${
      content.length === 1 ? "" : "s"
    } from ${path}.`, { path, content });
  },
};

const listProjectFiles: ToolDef = {
  name: "list_project_files",
  description:
    "Lists files and directories in the project tree, optionally scoped to a subdirectory.",
  domain: "appbuilder",
  schema: {
    type: "object",
    properties: {
      dir: {
        type: "string",
        description: "Subdirectory to list. Default: project root.",
      },
    },
  },
  async execute(params, ctx) {
    const dir = stringParam(params, "dir");
    const project = appConnectors(ctx).project;
    if (!project) return notConnected("list_project_files");
    const entries = await project.listFiles(dir);
    const where = dir ? `"${dir}"` : "project root";
    if (entries.length === 0) {
      return ok(`No files found in ${where}.`, { dir, entries });
    }
    return ok(
      `Found ${entries.length} entr${
        entries.length === 1 ? "y" : "ies"
      } in ${where}: ${entries.map((e) => e.path).join(", ")}.`,
      { dir, entries },
    );
  },
};

const deleteCodeFile: ToolDef = {
  name: "delete_code_file",
  description: "Deletes a file from the project tree.",
  domain: "appbuilder",
  schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Repo-relative POSIX path." },
    },
    required: ["path"],
  },
  async execute(params, ctx) {
    const path = requireString(params, "path");
    const project = appConnectors(ctx).project;
    if (!project) return notConnected("delete_code_file");
    await project.deleteFile(path);
    return ok(`Deleted ${path}.`, { path });
  },
};

const applyPatch: ToolDef = {
  name: "apply_patch",
  description:
    "Applies a unified-diff patch to a single file in the project tree (surgical edit without rewriting the whole file).",
  domain: "appbuilder",
  schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Repo-relative POSIX path to patch." },
      patch: { type: "string", description: "Unified-diff text." },
    },
    required: ["path", "patch"],
  },
  async execute(params, ctx) {
    const path = requireString(params, "path");
    const patch = requireString(params, "patch");
    const project = appConnectors(ctx).project;
    if (!project) return notConnected("apply_patch");
    await project.applyPatch(path, patch);
    return ok(`Applied patch to ${path}.`, { path });
  },
};

// ─── codegen tools ──────────────────────────────────────────────────────────
//
// These are deterministic: the caller (the agent's LLM, upstream) supplies the
// generated source as a param and the tool writes it into the tree at the
// conventional location. No LLM call happens inside the tool — the tool is the
// pure, repeatable write step, so a run is reproducible and auditable.

/** Normalizes a component/page name into a PascalCase identifier. */
function pascalCase(name: string): string {
  return name
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

const generateComponent: ToolDef = {
  name: "generate_component",
  description:
    "Writes a UI component into the project. If `content` is supplied it is written verbatim; otherwise a minimal typed component scaffold is generated at the conventional path (src/components/<Name>.tsx).",
  domain: "appbuilder",
  schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Component name (becomes PascalCase)." },
      path: {
        type: "string",
        description:
          "Target path. Default: src/components/<Name>.tsx.",
      },
      content: {
        type: "string",
        description:
          "Full component source. When omitted a deterministic scaffold is written.",
      },
    },
    required: ["name"],
  },
  async execute(params, ctx) {
    const name = requireString(params, "name");
    const project = appConnectors(ctx).project;
    if (!project) return notConnected("generate_component");
    const comp = pascalCase(name);
    const path = stringParam(params, "path") ?? `src/components/${comp}.tsx`;
    const provided = stringParam(params, "content");
    const content =
      provided ??
      `export interface ${comp}Props {}\n\n` +
        `export function ${comp}(_props: ${comp}Props) {\n` +
        `  return <div className="${comp.toLowerCase()}">${comp}</div>;\n` +
        `}\n`;
    await project.writeFile(path, content);
    return ok(
      `Generated component ${comp} at ${path}${
        provided ? "" : " (scaffold)"
      }.`,
      { name: comp, path, scaffold: !provided },
    );
  },
};

const generatePage: ToolDef = {
  name: "generate_page",
  description:
    "Writes a route/page into the project. If `content` is supplied it is written verbatim; otherwise a minimal page scaffold is generated at the conventional path (src/pages/<route>.tsx).",
  domain: "appbuilder",
  schema: {
    type: "object",
    properties: {
      route: {
        type: "string",
        description: 'Route path, e.g. "about" or "dashboard/settings".',
      },
      path: {
        type: "string",
        description: "Target file path. Default: src/pages/<route>.tsx.",
      },
      content: {
        type: "string",
        description:
          "Full page source. When omitted a deterministic scaffold is written.",
      },
    },
    required: ["route"],
  },
  async execute(params, ctx) {
    const route = requireString(params, "route");
    const project = appConnectors(ctx).project;
    if (!project) return notConnected("generate_page");
    const clean = route.replace(/^\/+|\/+$/g, "");
    const path = stringParam(params, "path") ?? `src/pages/${clean}.tsx`;
    const comp = pascalCase(clean.split("/").pop() ?? "Page") + "Page";
    const provided = stringParam(params, "content");
    const content =
      provided ??
      `export default function ${comp}() {\n` +
        `  return <main>${clean || "home"}</main>;\n` +
        `}\n`;
    await project.writeFile(path, content);
    return ok(
      `Generated page "${clean || "/"}" at ${path}${
        provided ? "" : " (scaffold)"
      }.`,
      { route: clean, path, scaffold: !provided },
    );
  },
};

// ─── package tools ──────────────────────────────────────────────────────────

const installPackage: ToolDef = {
  name: "install_package",
  description:
    "Installs an npm package into the project via the sandbox package manager. Set dev:true for a devDependency.",
  domain: "appbuilder",
  schema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: 'Package spec, e.g. "zod" or "react@18".',
      },
      dev: { type: "boolean", description: "Install as a devDependency." },
    },
    required: ["name"],
  },
  async execute(params, ctx) {
    const name = requireString(params, "name");
    const dev = boolParam(params, "dev");
    const sandbox = appConnectors(ctx).sandbox;
    if (!sandbox) return notConnected("install_package");
    const run = await sandbox.installPackage(name, { dev });
    return fromRun(`Install ${name}${dev ? " (dev)" : ""}`, run);
  },
};

const removePackage: ToolDef = {
  name: "remove_package",
  description:
    "Removes an npm package from the project via the sandbox package manager.",
  domain: "appbuilder",
  schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Package name to remove." },
    },
    required: ["name"],
  },
  async execute(params, ctx) {
    const name = requireString(params, "name");
    const sandbox = appConnectors(ctx).sandbox;
    if (!sandbox) return notConnected("remove_package");
    const run = await sandbox.removePackage(name);
    return fromRun(`Remove ${name}`, run);
  },
};

// ─── exec / build tools ─────────────────────────────────────────────────────

const runCommand: ToolDef = {
  name: "run_command",
  description:
    "Runs a shell command inside the isolated build sandbox (never on the host). Returns exit code and output.",
  domain: "appbuilder",
  schema: {
    type: "object",
    properties: {
      cmd: { type: "string", description: "Command line to execute." },
    },
    required: ["cmd"],
  },
  async execute(params, ctx) {
    const cmd = requireString(params, "cmd");
    const sandbox = appConnectors(ctx).sandbox;
    if (!sandbox) return notConnected("run_command");
    const run = await sandbox.runCommand(cmd);
    return fromRun(`Command \`${cmd}\``, run);
  },
};

const runBuild: ToolDef = {
  name: "run_build",
  description:
    "Runs the project's production build in the sandbox. Returns exit code and build output.",
  domain: "appbuilder",
  schema: { type: "object", properties: {} },
  async execute(_params, ctx) {
    const sandbox = appConnectors(ctx).sandbox;
    if (!sandbox) return notConnected("run_build");
    const run = await sandbox.build();
    return fromRun("Build", run);
  },
};

const runDevServer: ToolDef = {
  name: "run_dev_server",
  description:
    "Starts the project's dev server in the sandbox. Returns the local URL (if known) and startup logs.",
  domain: "appbuilder",
  schema: { type: "object", properties: {} },
  async execute(_params, ctx) {
    const sandbox = appConnectors(ctx).sandbox;
    if (!sandbox) return notConnected("run_dev_server");
    const run = await sandbox.startDevServer();
    const tail = run.output.replace(/\s+$/, "").slice(-4000);
    if (run.exitCode !== 0) {
      return {
        ok: false,
        content: `Dev server failed to start (exit ${run.exitCode}).`,
        error: `exit ${run.exitCode}`,
        data: { exitCode: run.exitCode, output: tail, url: run.url },
      };
    }
    return ok(
      run.url
        ? `Dev server started at ${run.url}.`
        : "Dev server started.",
      { exitCode: run.exitCode, output: tail, url: run.url },
    );
  },
};

const runTests: ToolDef = {
  name: "run_tests",
  description:
    "Runs the project's test suite in the sandbox, optionally filtered to matching tests. Returns exit code and output.",
  domain: "appbuilder",
  schema: {
    type: "object",
    properties: {
      filter: {
        type: "string",
        description: "Optional test name/path filter.",
      },
    },
  },
  async execute(params, ctx) {
    const filter = stringParam(params, "filter");
    const sandbox = appConnectors(ctx).sandbox;
    if (!sandbox) return notConnected("run_tests");
    const run = await sandbox.runTests(filter);
    return fromRun(`Tests${filter ? ` (filter: ${filter})` : ""}`, run);
  },
};

const lintCode: ToolDef = {
  name: "lint_code",
  description:
    "Runs the project's linter in the sandbox. A non-zero exit (lint errors) is reported as a graceful failure with the lint output.",
  domain: "appbuilder",
  schema: { type: "object", properties: {} },
  async execute(_params, ctx) {
    const sandbox = appConnectors(ctx).sandbox;
    if (!sandbox) return notConnected("lint_code");
    const run = await sandbox.lint();
    return fromRun("Lint", run);
  },
};

const formatCode: ToolDef = {
  name: "format_code",
  description:
    "Runs the project's formatter in the sandbox. Returns exit code and output.",
  domain: "appbuilder",
  schema: { type: "object", properties: {} },
  async execute(_params, ctx) {
    const sandbox = appConnectors(ctx).sandbox;
    if (!sandbox) return notConnected("format_code");
    const run = await sandbox.format();
    return fromRun("Format", run);
  },
};

// ─── preview / deploy tools ─────────────────────────────────────────────────

const previewApp: ToolDef = {
  name: "preview_app",
  description:
    "Returns an ephemeral preview URL for the current build via the deployer.",
  domain: "appbuilder",
  schema: { type: "object", properties: {} },
  async execute(_params, ctx) {
    const deployer = appConnectors(ctx).deployer;
    if (!deployer) return notConnected("preview_app");
    const { url } = await deployer.previewUrl();
    return ok(`Preview available at ${url}.`, { url });
  },
};

const deployApp: ToolDef = {
  name: "deploy_app",
  description:
    "Deploys the app via the deployer at an optional tier (e.g. free, pro, scale). Returns the live URL.",
  domain: "appbuilder",
  schema: {
    type: "object",
    properties: {
      tier: {
        type: "string",
        description: "Deployment tier, e.g. free / pro / scale.",
      },
    },
  },
  async execute(params, ctx) {
    const tier = stringParam(params, "tier");
    const deployer = appConnectors(ctx).deployer;
    if (!deployer) return notConnected("deploy_app");
    const result = await deployer.deploy({ tier });
    return ok(
      `Deployed${result.tier ? ` on the ${result.tier} tier` : ""} at ${
        result.url
      }.`,
      result,
    );
  },
};

const connectDomain: ToolDef = {
  name: "connect_domain",
  description:
    "Binds a custom domain to the deployed app via the deployer. Returns the binding status and any DNS records the user must set.",
  domain: "appbuilder",
  schema: {
    type: "object",
    properties: {
      domain: {
        type: "string",
        description: 'Custom domain, e.g. "app.example.com".',
      },
    },
    required: ["domain"],
  },
  async execute(params, ctx) {
    const domain = requireString(params, "domain");
    const deployer = appConnectors(ctx).deployer;
    if (!deployer) return notConnected("connect_domain");
    const result = await deployer.connectDomain(domain);
    return ok(`Domain ${result.domain} is ${result.status}.`, result);
  },
};

// ─── data tools (provisioning, distinct from the read-only `db`) ─────────────

const provisionDatabase: ToolDef = {
  name: "provision_database",
  description:
    "Provisions a datastore for the built app (e.g. postgres, sqlite, kv) via the db_provisioner. Returns a connection reference.",
  domain: "appbuilder",
  schema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        description: "Datastore kind, e.g. postgres / sqlite / kv.",
      },
    },
    required: ["kind"],
  },
  async execute(params, ctx) {
    const kind = requireString(params, "kind");
    const provisioner = appConnectors(ctx).db_provisioner;
    if (!provisioner) return notConnected("provision_database");
    const result = await provisioner.provision(kind);
    return ok(`Provisioned a ${result.kind} datastore.`, result);
  },
};

const runMigration: ToolDef = {
  name: "run_migration",
  description:
    "Runs database migrations for the built app via the db_provisioner, or a single named migration. Returns exit code and output.",
  domain: "appbuilder",
  schema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Optional single migration name. Default: all pending.",
      },
    },
  },
  async execute(params, ctx) {
    const name = stringParam(params, "name");
    const provisioner = appConnectors(ctx).db_provisioner;
    if (!provisioner) return notConnected("run_migration");
    const run = await provisioner.runMigration(name);
    return fromRun(`Migration${name ? ` ${name}` : ""}`, run);
  },
};

const seedDatabase: ToolDef = {
  name: "seed_database",
  description:
    "Seeds the built app's datastore with starter/fixture data via the db_provisioner. Returns exit code and output.",
  domain: "appbuilder",
  schema: { type: "object", properties: {} },
  async execute(_params, ctx) {
    const provisioner = appConnectors(ctx).db_provisioner;
    if (!provisioner) return notConnected("seed_database");
    const run = await provisioner.seed();
    return fromRun("Seed", run);
  },
};

// ─── env / versioning tools ─────────────────────────────────────────────────

const setEnvVar: ToolDef = {
  name: "set_env_var",
  description:
    "Sets a build/runtime environment variable for the deployment, persisted in the durable store under a per-deployment namespace.",
  domain: "appbuilder",
  schema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Env var name (conventionally UPPER_SNAKE_CASE).",
      },
      value: { type: "string", description: "Env var value." },
    },
    required: ["name", "value"],
  },
  async execute(params, ctx) {
    const name = requireString(params, "name");
    const value = requireString(params, "value");
    const store = appConnectors(ctx).store;
    if (!store) return notConnected("set_env_var");
    await store.put(envKey(ctx, name), value);
    // Track the set of known keys so list_env_vars can enumerate them.
    await store.put(`appbuilder:envkeys:${ctx.deploymentId}:${name}`, name);
    return ok(`Set env var ${name}.`, { name });
  },
};

const listEnvVars: ToolDef = {
  name: "list_env_vars",
  description:
    "Lists the environment variable names set for this deployment. Values are not returned (they may be secret); names only.",
  domain: "appbuilder",
  schema: { type: "object", properties: {} },
  async execute(_params, ctx) {
    const conn = appConnectors(ctx);
    const store = conn.store;
    if (!store) return notConnected("list_env_vars");
    // A bare StoreSink is write-only; if the deployment also wires a readable
    // db_provisioner-style index it would surface here. With only a StoreSink we
    // cannot enumerate, so report that clearly rather than guess.
    const lister = (
      store as unknown as { keys?: (prefix: string) => Promise<string[]> }
    ).keys;
    if (typeof lister !== "function") {
      return ok(
        "Env var names are stored but cannot be enumerated by this store backend.",
        { names: [], enumerable: false },
      );
    }
    const keys = await lister(`appbuilder:envkeys:${ctx.deploymentId}:`);
    const names = keys.map((k) => k.split(":").pop() ?? k);
    return ok(
      names.length === 0
        ? "No env vars are set for this deployment."
        : `Found ${names.length} env var${
            names.length === 1 ? "" : "s"
          }: ${names.join(", ")}.`,
      { names, enumerable: true },
    );
  },
};

const snapshotProject: ToolDef = {
  name: "snapshot_project",
  description:
    "Captures a labelled snapshot of the entire project tree via the project store. Returns the snapshot id for later rollback.",
  domain: "appbuilder",
  schema: {
    type: "object",
    properties: {
      label: { type: "string", description: "Optional human label." },
    },
  },
  async execute(params, ctx) {
    const label = stringParam(params, "label");
    const project = appConnectors(ctx).project;
    if (!project) return notConnected("snapshot_project");
    const { snapshotId } = await project.snapshot(label);
    return ok(
      `Captured snapshot ${snapshotId}${label ? ` ("${label}")` : ""}.`,
      { snapshotId, label },
    );
  },
};

const rollbackProject: ToolDef = {
  name: "rollback_project",
  description:
    "Restores the project tree to a previously captured snapshot via the project store.",
  domain: "appbuilder",
  schema: {
    type: "object",
    properties: {
      snapshotId: { type: "string", description: "Snapshot id to restore." },
    },
    required: ["snapshotId"],
  },
  async execute(params, ctx) {
    const snapshotId = requireString(params, "snapshotId");
    const project = appConnectors(ctx).project;
    if (!project) return notConnected("rollback_project");
    await project.rollback(snapshotId);
    return ok(`Rolled the project back to snapshot ${snapshotId}.`, {
      snapshotId,
    });
  },
};

// ─── catalog export ─────────────────────────────────────────────────────────

export const appBuilderTools: ToolDef[] = [
  // project
  scaffoldProject,
  writeCodeFile,
  readCodeFile,
  listProjectFiles,
  deleteCodeFile,
  applyPatch,
  // codegen
  generateComponent,
  generatePage,
  // packages
  installPackage,
  removePackage,
  // exec / build
  runCommand,
  runBuild,
  runDevServer,
  runTests,
  lintCode,
  formatCode,
  // preview / deploy
  previewApp,
  deployApp,
  connectDomain,
  // data
  provisionDatabase,
  runMigration,
  seedDatabase,
  // env / versioning
  setEnvVar,
  listEnvVars,
  snapshotProject,
  rollbackProject,
];
