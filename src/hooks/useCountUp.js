import { useEffect, useState } from 'react';

export function useCountUp(target, duration = 700) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let start = null;
    let raf;
    const from = 0;
    const to = Number.isFinite(target) ? target : 0;

    const animate = (t) => {
      if (start === null) start = t;
      const progress = Math.min((t - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setValue(from + (to - from) * ease);
      if (progress < 1) {
        raf = requestAnimationFrame(animate);
      }
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}
