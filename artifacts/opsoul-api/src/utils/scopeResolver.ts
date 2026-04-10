import crypto from 'crypto';

export interface ScopeParams {
  operatorId: string;
  source: 'owner' | 'telegram' | 'whatsapp' | 'api' | 'guest' | string;
  callerId?: string;
  slotId?: string;
  scopeTrust?: string;
}

export interface ResolvedScope {
  scopeId: string;
  scopeType: string;
  scopeTrust: string;
}

export function resolveScope(params: ScopeParams): ResolvedScope {
  const { source, callerId, slotId, scopeTrust } = params;

  if (slotId) {
    const userId = callerId ?? crypto.randomUUID();
    return {
      scopeId:   `slot:${slotId}:${userId}`,
      scopeType: source || 'slot',
      scopeTrust: scopeTrust ?? 'guest',
    };
  }

  switch (source) {
    case 'owner':
      return { scopeId: `owner:${callerId ?? 'unknown'}`, scopeType: 'owner', scopeTrust: 'owner' };

    case 'telegram':
      return { scopeId: `telegram:${callerId ?? crypto.randomUUID()}`, scopeType: 'telegram', scopeTrust: 'authenticated' };

    case 'whatsapp':
      return { scopeId: `whatsapp:${callerId ?? crypto.randomUUID()}`, scopeType: 'whatsapp', scopeTrust: 'authenticated' };

    case 'api':
      return { scopeId: `api:${callerId ?? crypto.randomUUID()}`, scopeType: 'api', scopeTrust: 'authenticated' };

    case 'guest':
      return { scopeId: `guest:${callerId ?? crypto.randomUUID()}`, scopeType: 'guest', scopeTrust: 'guest' };

    default:
      return { scopeId: `${source}:${callerId ?? crypto.randomUUID()}`, scopeType: source, scopeTrust: 'guest' };
  }
}
