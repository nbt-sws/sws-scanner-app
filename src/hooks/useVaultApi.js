import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getJson, postJson, patchJson, deleteJson } from '../api';

const VAULT_API_ENABLED = Boolean(
  process.env.REACT_APP_VAULT_API_URL || process.env.REACT_APP_USE_VAULT_API === 'true'
);

function headersFor(user, token) {
  const h = {};
  if (user?.uid) h['X-User-ID'] = user.uid;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export function isVaultApiEnabled() {
  return VAULT_API_ENABLED;
}

export function useVaultItems(user, getToken, options = {}) {
  return useQuery({
    queryKey: ['vault', 'items', user?.uid],
    queryFn: async () => {
      const token = await getToken?.();
      const data = await getJson('/vault/items?holderId=' + encodeURIComponent(user.uid), {
        headers: headersFor(user, token),
      });
      return (data?.items || []).map(fromApiItem);
    },
    enabled: VAULT_API_ENABLED && Boolean(user?.uid),
    ...options,
  });
}

export function useCreateVaultItem(user, getToken, options = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item) => {
      const token = await getToken?.();
      const payload = toApiItem(item);
      const data = await postJson('/vault/items', payload, {
        headers: headersFor(user, token),
      });
      return fromApiItem(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vault', 'items', user?.uid] }),
    ...options,
  });
}

export function useUpdateVaultItem(user, getToken, options = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }) => {
      const token = await getToken?.();
      const data = await patchJson(`/vault/items/${id}`, patch, {
        headers: headersFor(user, token),
      });
      return fromApiItem(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vault', 'items', user?.uid] }),
    ...options,
  });
}

export function useDeleteVaultItem(user, getToken, options = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const token = await getToken?.();
      return deleteJson(`/vault/items/${id}`, {
        headers: headersFor(user, token),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vault', 'items', user?.uid] }),
    ...options,
  });
}

function toApiItem(item) {
  return {
    name: item.nameEn || item.name || item.code,
    sku: item.code,
    category: item.tcg || item.game || 'TCG',
    subCategory: item.setName || item.set || '',
    itemFormat: item.condition || 'Raw',
    condition: item.condition || 'Raw',
    description: JSON.stringify({
      language: item.language,
      rarity: item.rarity,
      image: item.image,
      paid: item.paid,
      current: item.current,
    }),
  };
}

function fromApiItem(api) {
  let meta = {};
  try {
    meta = JSON.parse(api.description || '{}');
  } catch { /* ignore */ }
  return {
    id: api.id,
    code: api.sku,
    nameEn: api.name,
    name: api.name,
    tcg: api.category,
    setName: api.subCategory,
    condition: api.condition,
    status: api.status,
    language: meta.language,
    rarity: meta.rarity,
    image: meta.image,
    paid: meta.paid || 0,
    current: meta.current || 0,
    ownerId: api.owner_id,
    holderId: api.holder_id,
    createdAt: api.created_at,
  };
}
