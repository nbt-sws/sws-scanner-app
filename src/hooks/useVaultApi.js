import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getJson, postJson, patchJson, deleteJson } from '../api';
import { useServiceUserId } from '../lib/userId';

const VAULT_API_ENABLED = Boolean(
  process.env.REACT_APP_VAULT_API_URL || process.env.REACT_APP_USE_VAULT_API === 'true'
);

function headersFor(serviceUserId, token) {
  const h = {};
  if (serviceUserId) h['X-User-ID'] = serviceUserId;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export function isVaultApiEnabled() {
  return VAULT_API_ENABLED;
}

export function useVaultItems(user, getToken, options = {}) {
  const serviceUserId = useServiceUserId(user, getToken);
  return useQuery({
    queryKey: ['vault', 'items', serviceUserId],
    queryFn: async () => {
      const token = await getToken?.();
      const data = await getJson(
        '/vault/items?holderId=' + encodeURIComponent(serviceUserId),
        { headers: headersFor(serviceUserId, token) }
      );
      return (data?.items || []).map(fromApiItem);
    },
    enabled: VAULT_API_ENABLED && Boolean(serviceUserId),
    ...options,
  });
}

export function useCreateVaultItem(user, getToken, options = {}) {
  const qc = useQueryClient();
  const serviceUserId = useServiceUserId(user, getToken);
  return useMutation({
    mutationFn: async (item) => {
      const token = await getToken?.();
      const payload = toApiItem(item, serviceUserId);
      const data = await postJson('/vault/items', payload, {
        headers: headersFor(serviceUserId, token),
      });
      return fromApiItem(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vault', 'items', serviceUserId] }),
    ...options,
  });
}

export function useUpdateVaultItem(user, getToken, options = {}) {
  const qc = useQueryClient();
  const serviceUserId = useServiceUserId(user, getToken);
  return useMutation({
    mutationFn: async ({ id, patch }) => {
      const token = await getToken?.();
      const data = await patchJson(`/vault/items/${id}`, patch, {
        headers: headersFor(serviceUserId, token),
      });
      return fromApiItem(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vault', 'items', serviceUserId] }),
    ...options,
  });
}

export function useDeleteVaultItem(user, getToken, options = {}) {
  const qc = useQueryClient();
  const serviceUserId = useServiceUserId(user, getToken);
  return useMutation({
    mutationFn: async (id) => {
      const token = await getToken?.();
      return deleteJson(`/vault/items/${id}`, {
        headers: headersFor(serviceUserId, token),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vault', 'items', serviceUserId] }),
    ...options,
  });
}

function toApiItem(item, holderId) {
  return {
    name: item.nameEn || item.name || item.code,
    sku: item.code,
    category: item.tcg || item.game || 'TCG',
    subCategory: item.setName || item.set || '',
    itemFormat: item.condition || 'Raw',
    condition: item.condition || 'Raw',
    holderId,
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
