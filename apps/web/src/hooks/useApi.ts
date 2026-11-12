import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/components/ui/feedback';

export function useGet<T>(key: QueryKey, path: string | null, opts: { enabled?: boolean; refetchInterval?: number; keepPrevious?: boolean } = {}) {
  return useQuery<T, ApiError>({
    queryKey: key,
    queryFn: () => api<T>(path!),
    enabled: !!path && (opts.enabled ?? true),
    refetchInterval: opts.refetchInterval,
    placeholderData: opts.keepPrevious ? (prev) => prev : undefined,
  });
}

/** Mutation with toast feedback and cache invalidation. */
export function useAction<TVars, TRes = unknown>(
  fn: (v: TVars) => Promise<TRes>,
  opts: { success?: string; invalidate?: QueryKey[]; onSuccess?: (r: TRes, v: TVars) => void; silentError?: boolean } = {},
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation<TRes, ApiError, TVars>({
    mutationFn: fn,
    onSuccess: (r, v) => {
      if (opts.success) toast.success(opts.success);
      for (const k of opts.invalidate ?? []) void qc.invalidateQueries({ queryKey: k });
      opts.onSuccess?.(r, v);
    },
    onError: (e) => {
      if (!opts.silentError) toast.error(e.message);
    },
  });
}
export { api };
