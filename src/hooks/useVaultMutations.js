import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addVaultItem, updateVaultItem, deleteVaultItem } from '../vault';

export function useAddVaultItem(options = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ uid, item }) => addVaultItem(uid, item),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vault'] });
    },
    ...options,
  });
}

export function useUpdateVaultItem(options = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, patch }) => updateVaultItem(itemId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vault'] });
    },
    ...options,
  });
}

export function useDeleteVaultItem(options = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId) => deleteVaultItem(itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vault'] });
    },
    ...options,
  });
}
