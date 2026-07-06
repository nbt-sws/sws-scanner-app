import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getJson, patchJson } from '../api';

export function useNotifications(getToken, options = {}) {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const token = await getToken?.();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const data = await getJson('/notifications', { headers });
      return Array.isArray(data) ? data : data?.items || data?.notifications || [];
    },
    enabled: true,
    ...options,
  });
}

export function useMarkNotificationRead(getToken, options = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const token = await getToken?.();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      return patchJson(`/notifications/${id}/read`, {}, { headers });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
    ...options,
  });
}
