import { useState, useEffect } from "https://esm.sh/preact@10.25.4/hooks";

/**
 * Return `value` once it has stopped changing for `delay` ms.
 * Used by the search boxes so typing fires one query instead of one per keystroke.
 */
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
