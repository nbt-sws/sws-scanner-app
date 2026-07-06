import { useQuery } from '@tanstack/react-query';
import { getJson } from '../api';

export function usePrices(code, rarity, options = {}) {
  return useQuery({
    queryKey: ['prices', code, rarity],
    queryFn: () => getJson(`/prices?code=${encodeURIComponent(code)}&rarity=${encodeURIComponent(rarity)}`),
    enabled: Boolean(code && rarity),
    ...options,
  });
}
