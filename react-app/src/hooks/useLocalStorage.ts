import { useCallback, useEffect, useState } from 'react';

type Setter<T> = (value: T | ((prev: T) => T)) => void;

/**
 * Mirrors the pattern used across the legacy HTML portal: hold state in memory,
 * persist to localStorage on every change, reload on mount. Survives the strict
 * mode double-invoke because reads happen inside the initializer.
 */
export function useLocalStorage<T>(key: string, initial: T): [T, Setter<T>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // quota / disabled storage — fine to swallow, state stays in memory
    }
  }, [key, value]);

  const update = useCallback<Setter<T>>((next) => {
    setValue((prev) => (typeof next === 'function' ? (next as (p: T) => T)(prev) : next));
  }, []);

  return [value, update];
}
