import { useQuery } from '@tanstack/react-query';
import { getJson } from '../api';

export function useWhoami(token, options = {}) {
  return useQuery({
    queryKey: ['whoami', token],
    queryFn: () =>
      getJson('/whoami', token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    enabled: true,
    ...options,
  });
}
