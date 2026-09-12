import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

export function useEffects() {
  const desktop = '__TAURI_INTERNALS__' in window;
  const cache = useQueryClient();
  const [session, setSession] = useState(false);
  const query = useQuery({
    queryKey: ['effects'],
    queryFn: () => invoke<boolean>('get_effects'),
    enabled: desktop,
  });
  const mutation = useMutation({
    mutationFn: (reduced: boolean) => invoke<void>('set_effects', { reduced }),
    onSuccess: (_result, reduced) => cache.setQueryData(['effects'], reduced),
  });
  return {
    reduced: desktop ? (query.data ?? true) : session,
    pending: desktop && (query.isPending || mutation.isPending),
    error: desktop && (query.isError || mutation.isError),
    setReduced: (value: boolean) =>
      desktop ? mutation.mutate(value) : setSession(value),
    desktop,
  };
}
