import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addVaultItem as addFirestoreVaultItem } from '../vault';
import { isVaultApiEnabled, useCreateVaultItem as useApiCreateVaultItem } from './useVaultApi';

export function useAddVaultItem(user, getToken, options = {}) {
  const qc = useQueryClient();
  const apiCreate = useApiCreateVaultItem(user, getToken);

  return useMutation({
    mutationFn: async ({ item }) => {
      if (isVaultApiEnabled()) {
        return apiCreate.mutateAsync(item);
      }
      return addFirestoreVaultItem(user?.uid, item);
    },
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: ['vault', 'items', user?.uid] });
      options.onSuccess?.(...args);
    },
    onError: options.onError,
  });
}
