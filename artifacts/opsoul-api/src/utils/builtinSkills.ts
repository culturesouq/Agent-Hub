/**
 * Built-in operator capabilities — every operator carries these by default.
 *
 * Each entry describes WHAT the capability does (capability fact), not WHEN
 * to use it (which would be instruction). Per § 3 rule 12: skill descriptions
 * are knowledge, not rules. Operators decide when to invoke from soul +
 * Layer 4 + situation.
 *
 * Each entry corresponds to a tool wired in the chat route loop. The
 * `availability` flag describes when the underlying tool is offered:
 *  - 'always': offered in every chat
 *  - 'web':    offered when web search is configured
 *  - 'secrets': offered when the operator has stored API secrets
 */

export type BuiltinSkillAvailability = 'always' | 'web' | 'secrets';

export interface BuiltinSkill {
  name:         string;
  description:  string;
  category:     'research' | 'workspace' | 'integration' | 'automation';
  availability: BuiltinSkillAvailability;
}

export const BUILTIN_SKILLS: BuiltinSkill[] = [
  {
    name:         'Web search',
    description:  'Issues a search query and returns ranked results (URLs and snippets).',
    category:     'research',
    availability: 'web',
  },
  {
    name:         'Knowledge seed',
    description:  'Adds an entry to the operator\'s knowledge base. The entry is embedded at insertion time and becomes retrievable in subsequent conversations.',
    category:     'research',
    availability: 'web',
  },
  {
    name:         'Write file',
    description:  'Creates or replaces a file in the operator\'s workspace under a chosen name. Files persist across conversations and are visible in the Files tab.',
    category:     'workspace',
    availability: 'always',
  },
  {
    name:         'Read file',
    description:  'Returns the contents of a workspace file by name.',
    category:     'workspace',
    availability: 'always',
  },
  {
    name:         'List files',
    description:  'Enumerates files present in the workspace with size and last-updated timestamp.',
    category:     'workspace',
    availability: 'always',
  },
  {
    name:         'Current time',
    description:  'Returns the current date and time for any timezone (IANA identifier). Defaults to Asia/Dubai (GST).',
    category:     'research',
    availability: 'always',
  },
  {
    name:         'Schedule task',
    description:  'Creates a recurring task with a daily or weekly schedule. The task fires on schedule, executing a stored prompt against the operator.',
    category:     'automation',
    availability: 'always',
  },
  {
    name:         'Update task',
    description:  'Modifies the name, prompt, or schedule of an existing task, identified by current name.',
    category:     'automation',
    availability: 'always',
  },
  {
    name:         'Pause / resume task',
    description:  'Toggles a task between active and paused states. A paused task is preserved but does not fire on its schedule.',
    category:     'automation',
    availability: 'always',
  },
  {
    name:         'Delete task',
    description:  'Removes a task permanently from the operator\'s task list.',
    category:     'automation',
    availability: 'always',
  },
  {
    name:         'HTTP request',
    description:  'Issues an HTTP request to an external endpoint. Methods: GET, POST, PUT, PATCH, DELETE. Stored secrets are referenced via the {{SECRET_NAME}} syntax in URL, headers, or body; the label resolves to its value at call time.',
    category:     'integration',
    availability: 'secrets',
  },
];
