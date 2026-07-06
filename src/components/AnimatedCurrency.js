import { useCountUp } from '../hooks/useCountUp';

function fmtCurrency(value, currency = 'USD') {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function AnimatedCurrency({ value, currency = 'USD', className = '' }) {
  const animated = useCountUp(value ?? 0, 700);
  return <span className={className}>{fmtCurrency(animated, currency)}</span>;
}
