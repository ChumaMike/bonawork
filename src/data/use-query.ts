"use client";

import { useCallback, useEffect, useState } from "react";

export interface QueryState<T> {
  /** `undefined` while the first load is in flight. */
  data: T | undefined;
  loading: boolean;
  error: boolean;
  /** Replace the data without refetching, e.g. with the result of a mutation. */
  setData: (value: T) => void;
  reload: () => void;
}

/**
 * Load data from the data-access layer in a client component.
 * `key` identifies the request: when it changes, the query runs again.
 */
export function useQuery<T>(key: string, load: () => Promise<T>): QueryState<T> {
  const [state, setState] = useState<{ key: string; data?: T; error: boolean }>({
    key,
    error: false,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    load().then(
      (data) => {
        if (!cancelled) setState({ key, data, error: false });
      },
      () => {
        if (!cancelled) setState({ key, error: true });
      },
    );
    return () => {
      cancelled = true;
    };
    // `load` is intentionally not a dependency: `key` describes the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const setData = useCallback(
    (value: T) => setState({ key, data: value, error: false }),
    [key],
  );
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const current = state.key === key;
  return {
    data: current ? state.data : undefined,
    loading: !current || (state.data === undefined && !state.error),
    error: current && state.error,
    setData,
    reload,
  };
}
