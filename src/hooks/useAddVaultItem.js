import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addVaultItem } from '../vault';
import { isVaultApiEnabled, useCreateVaultItem as useApiCreateVaultItem } from './useVaultApi';
import { useServiceUserId } from '../lib/userId';

export function useAddVaultItem(user, getToken, options = {}) {
  const qc = useQueryClient();
  const serviceUserId = useServiceUserId(user, getToken);
  const apiCreate = useApiCreateVaultItem(user, getToken);

  return useMutation({
    mutationFn: async ({ item }) => {
      if (isVaultApiEnabled()) {
        return apiCreate.mutateAsync(item);
      }
      return addVaultItem(user?.uid, item);
    },
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: ['vault', 'items', serviceUserId] });
      options.onSuccess?.(...args);
    },
    onError: options.onError,
  });
}
