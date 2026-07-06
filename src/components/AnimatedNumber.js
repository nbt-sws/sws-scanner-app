import { useCountUp } from '../hooks/useCountUp';

export function AnimatedNumber({ value, decimals = 1, className = '' }) {
  const animated = useCountUp(value ?? 0, 700);
  return (
    <span className={className}>
      {Number.isFinite(animated) ? animated.toFixed(decimals) : value}
    </span>
  );
}
