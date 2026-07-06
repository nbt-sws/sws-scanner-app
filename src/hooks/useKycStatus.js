import { useQuery } from '@tanstack/react-query';
import { getJson } from '../api';
import { useServiceUserId } from '../lib/userId';

export function useKycStatus(user, getToken, options = {}) {
  const serviceUserId = useServiceUserId(user, getToken);
  return useQuery({
    queryKey: ['kyc', 'status', serviceUserId],
    queryFn: async () => {
      const token = await getToken?.();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      return getJson(`/kyc/status/${encodeURIComponent(serviceUserId)}`, { headers });
    },
    enabled: Boolean(serviceUserId),
    retry: false,
    ...options,
  });
}
