export type MockKvStore = Map<string, string>;

export function createMockEnv(initialKv: Record<string, string> = {}) {
  const kvStore: MockKvStore = new Map(Object.entries(initialKv));

  return {
    env: {
      SHARE_KV: {
        get: async (key: string) => kvStore.get(key) ?? null,
        put: async (key: string, value: string) => {
          kvStore.set(key, value);
        },
      },
      SHARE_R2: {},
    },
    kvStore,
  };
}

export function createPagesContext(args: {
  request: Request;
  env: {
    SHARE_KV: {
      get: (key: string) => Promise<string | null>;
      put: (key: string, value: string, options?: unknown) => Promise<void>;
    };
    SHARE_R2: unknown;
  };
  params?: Record<string, unknown>;
  next?: () => Promise<Response>;
}) {
  return {
    request: args.request,
    env: args.env,
    params: (args.params ?? {}) as never,
    next: args.next ?? (async () => new Response('ok')),
  };
}
