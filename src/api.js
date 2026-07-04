const API_BASE = process.env.REACT_APP_API_BASE_URL || '/api';

export function apiUrl(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}

export async function postJson(path, body, options = {}) {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
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
    headers: options.headers || {},
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || error.details || response.statusText);
  }
  return response.json();
}
