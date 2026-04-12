export interface ScopeResult {
  scopeId: string;
  scopeType: 'owner' | 'slot' | 'guest';
}

export function resolveScope(opts: {
  operatorId: string;
  source: 'owner' | 'slot' | 'guest';
  callerId: string;
}): ScopeResult {
  const { operatorId, source, callerId } = opts;

  if (source === 'owner') {
    return {
      scopeId: `owner:${operatorId}:${callerId}`,
      scopeType: 'owner',
    };
  }

  if (source === 'slot') {
    return {
      scopeId: `slot:${callerId}`,
      scopeType: 'slot',
    };
  }

  return {
    scopeId: `guest:${callerId}`,
    scopeType: 'guest',
  };
}
