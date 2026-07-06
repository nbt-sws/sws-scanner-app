const API_BASE = process.env.REACT_APP_API_BASE_URL || '/api';

export function getMockAuthHeaders() {
  if (typeof window === 'undefined') return {};
  try {
    const key = window.localStorage.getItem('sws_mock_auth_key');
    if (key) return { 'X-Mock-Auth-Key': key };
  } catch { /* ignore */ }
  return {};
}

function buildHeaders(options) {
  const headers = {
    ...getMockAuthHeaders(),
    ...(options.headers || {}),
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  return headers;
}

export function apiUrl(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}

export async function postJson(path, body, options = {}) {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildHeaders(options),
    },
    body: JSON.stringify(body),
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || error.details || response.statusText);
  }
  return response.json();
}

export async function getJson(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    headers: buildHeaders(options),
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || error.details || response.statusText);
  }
  return response.json();
}

export async function patchJson(path, body, options = {}) {
  const response = await fetch(apiUrl(path), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildHeaders(options),
    },
    body: JSON.stringify(body),
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || error.details || response.statusText);
  }
  return response.json();
}

export async function deleteJson(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    method: 'DELETE',
    headers: buildHeaders(options),
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || error.details || response.statusText);
  }
  return response.json().catch(() => ({}));
}
