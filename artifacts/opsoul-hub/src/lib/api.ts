async function attemptSilentRefresh(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json();
    const newToken = data.accessToken as string | undefined;
    if (!newToken) return null;
    localStorage.setItem('opsoul_token', newToken);
    window.dispatchEvent(new CustomEvent('auth-token-refreshed', { detail: { token: newToken } }));
    return newToken;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('opsoul_token');
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    if (endpoint !== '/auth/refresh') {
      const newToken = await attemptSilentRefresh();
      if (newToken) {
        const retryHeaders = new Headers(options.headers);
        retryHeaders.set('Authorization', `Bearer ${newToken}`);
        if (!retryHeaders.has('Content-Type') && !(options.body instanceof FormData)) {
          retryHeaders.set('Content-Type', 'application/json');
        }
        const retryResponse = await fetch(`/api${endpoint}`, { ...options, headers: retryHeaders });
        if (retryResponse.status === 401) {
          localStorage.removeItem('opsoul_token');
          window.dispatchEvent(new Event('auth-unauthorized'));
          throw new Error('Unauthorized');
        }
        if (!retryResponse.ok) {
          let errorMessage = 'An error occurred';
          try {
            const errorData = await retryResponse.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
          } catch { }
          throw new Error(errorMessage);
        }
        if (retryResponse.status === 204 || retryResponse.headers.get('Content-Length') === '0') {
          return {} as T;
        }
        return retryResponse.json();
      }
    }
    localStorage.removeItem('opsoul_token');
    window.dispatchEvent(new Event('auth-unauthorized'));
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    let errorMessage = 'An error occurred';
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch {
      // Ignored
    }
    throw new Error(errorMessage);
  }

  // Handle empty responses (like 204 No Content)
  if (response.status === 204 || response.headers.get('Content-Length') === '0') {
    return {} as T;
  }

  return response.json();
}
