import { useQuery } from '@tanstack/react-query';
import { getJson } from '../api';

function normalizePrices(data) {
  if (!data) return null;
  if (data.overall) {
    return {
      low: data.overall.lowest,
      median: data.overall.median,
      high: data.overall.highest,
      raw: data.overall,
    };
  }
  if (data.tiers) {
    const firstKey = data.tierOrder?.[0] || Object.keys(data.tiers)[0];
    const tier = firstKey ? data.tiers[firstKey] : null;
    if (tier) {
      return {
        low: tier.lowest,
        median: tier.median,
        high: tier.highest,
        raw: tier,
      };
    }
  }
  return null;
}

export function usePrices(code, rarity, options = {}) {
  return useQuery({
    queryKey: ['prices', code, rarity],
    queryFn: async () => {
      const data = await getJson(
        `/prices?code=${encodeURIComponent(code)}&rarity=${encodeURIComponent(rarity)}`
      );
      return normalizePrices(data);
    },
    enabled: Boolean(code && rarity),
    ...options,
  });
}
