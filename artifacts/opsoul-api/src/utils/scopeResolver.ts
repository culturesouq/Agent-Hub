import crypto from 'crypto';

export interface ScopeParams {
  operatorId: string;
  source: 'owner' | 'telegram' | 'whatsapp' | 'api' | 'guest' | string;
  callerId?: string;
}

export interface ResolvedScope {
  scopeId: string;
  scopeType: string;
}

export function resolveScope(params: ScopeParams): ResolvedScope {
  const { source, callerId } = params;

  switch (source) {
    case 'owner':
      return { scopeId: `owner:${callerId ?? 'unknown'}`, scopeType: 'owner' };

    case 'telegram':
      return { scopeId: `telegram:${callerId ?? crypto.randomUUID()}`, scopeType: 'telegram' };

    case 'whatsapp':
      return { scopeId: `whatsapp:${callerId ?? crypto.randomUUID()}`, scopeType: 'whatsapp' };

    case 'api':
      return { scopeId: `api:${callerId ?? crypto.randomUUID()}`, scopeType: 'api' };

    case 'guest':
      return { scopeId: `guest:${callerId ?? crypto.randomUUID()}`, scopeType: 'guest' };

    default:
      return { scopeId: `${source}:${callerId ?? crypto.randomUUID()}`, scopeType: source };
  }
}
