/**
 * Built-in operator capabilities — every operator has these by default.
 *
 * These are the standard agent skills (research, files, HTTP, scheduling)
 * surfaced as named capabilities so the owner can see what their operator
 * can do, regardless of archetype or custom installs.
 *
 * Each entry corresponds to a tool wired in the chat route loop. The
 * `availability` flag describes when the underlying tool is offered:
 *  - 'always': always on (every operator, every chat)
 *  - 'web':    on when web search is configured
 *  - 'secrets': on when the operator has stored API secrets
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
    description:  'Search the web for current information when the operator needs facts beyond its knowledge base.',
    category:     'research',
    availability: 'web',
  },
  {
    name:         'Knowledge seed',
    description:  'Persist a verified knowledge entry into the operator\'s knowledge base. Future conversations retrieve it.',
    category:     'research',
    availability: 'web',
  },
  {
    name:         'Write file',
    description:  'Create or update a file in the operator\'s workspace. Owner sees and downloads it from the Files tab.',
    category:     'workspace',
    availability: 'always',
  },
  {
    name:         'Read file',
    description:  'Re-read a file in the operator\'s workspace by name. Useful for revising drafts or picking up scheduled work.',
    category:     'workspace',
    availability: 'always',
  },
  {
    name:         'List files',
    description:  'See every file in the operator\'s workspace with size and last-updated time.',
    category:     'workspace',
    availability: 'always',
  },
  {
    name:         'Schedule task',
    description:  'Operator creates its own daily or weekly automation. Owner can pause or edit from the Tasks tab.',
    category:     'automation',
    availability: 'always',
  },
  {
    name:         'Update task',
    description:  'Change the name, prompt, or schedule of an existing automation by name.',
    category:     'automation',
    availability: 'always',
  },
  {
    name:         'Pause / resume task',
    description:  'Stop an automation from firing without losing it. Resume later when needed.',
    category:     'automation',
    availability: 'always',
  },
  {
    name:         'Delete task',
    description:  'Permanently retire an automation when it\'s no longer needed.',
    category:     'automation',
    availability: 'always',
  },
  {
    name:         'HTTP request',
    description:  'Call an external API using stored secrets. Methods: GET, POST, PUT, PATCH, DELETE. Inject secrets with {{SECRET_NAME}}.',
    category:     'integration',
    availability: 'secrets',
  },
];
