import { useEffect, useState } from 'react';

export function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    function onResize() {
      setWidth(window.innerWidth);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return width;
}

export type NavMode = 'full' | 'rail' | 'bottom';

export function navModeFor(width: number): NavMode {
  if (width >= 1024) return 'full';
  if (width >= 760) return 'rail';
  return 'bottom';
}
