import {
  useCallback,
  useRef,
  useEffect,
  createContext,
  useContext,
  ReactNode,
  useSyncExternalStore,
  createElement,
} from "react";

type PipeContext = {
  currentState?: any;
  setState?: (value: any) => void;
  isMounted?: () => boolean;
};

type Operator<Input, Output> = (
  err: Error | null,
  value: Input,
  next: (err: Error | null, value?: Output) => void,
  complete?: (err: Error | null, value?: Output) => void
) => void;

type PipeBuilder<Input, State, Current> = {
  /** Synchronously transforms the current value to a new value */
  map<U>(
    operation: (value: Current, state: State) => U
  ): PipeBuilder<Input, State, U>;

  /** Asynchronously transforms the current value to a new value */
  async<U>(
    operation: (value: Current, state: State) => Promise<U>
  ): PipeBuilder<Input, State, U>;

  /** Asynchronously transforms the current value with retry logic. Retries on failure with optional exponential backoff */
  asyncRetry<U>(
    operation: (value: Current, state: State) => Promise<U>,
    retries: number,
    backoff?: number | ((attemptNumber: number) => number)
  ): PipeBuilder<Input, State, U>;

  /** Queues async operations to ensure they execute sequentially in order */
  asyncQueue<U>(
    operation: (value: Current, state: State) => Promise<U>
  ): PipeBuilder<Input, State, U>;

  /** Only processes the most recent value, discarding earlier pending operations */
  asyncLast<U>(
    operation: (value: Current, state: State) => Promise<U>
  ): PipeBuilder<Input, State, U>;

  /** Ignores new values while an async operation is already in progress */
  asyncFirst<U>(
    operation: (value: Current, state: State) => Promise<U>
  ): PipeBuilder<Input, State, U>;

  /** Catches errors in the pipe and transforms them to a value, allowing the pipe to continue */
  catch<U>(
    operation: (err: Error, state: State) => U
  ): PipeBuilder<Input, State, Current | U>;

  /** Filters values, only passing through those that match the predicate */
  filter(
    operation: (value: Current, state: State) => boolean
  ): PipeBuilder<Input, State, Current>;

  /** Debounces the value, waiting for the specified milliseconds of inactivity before proceeding */
  debounce(ms: number): PipeBuilder<Input, State, Current>;

  /** Throttles the value, ensuring at least the specified milliseconds pass between operations */
  throttle(ms: number): PipeBuilder<Input, State, Current>;

  /** Delays the value by the specified milliseconds before proceeding */
  delay(ms: number): PipeBuilder<Input, State, Current>;

  /** Sets the state to a new value, either directly or using a function of the current value */
  setState(
    value?: State | ((value: Current) => State)
  ): PipeBuilder<Input, State, Current>;

  /** Updates the state using a function of the current state and value */
  updateState<NewState = State>(
    operation: (state: State, value: Current) => NewState
  ): PipeBuilder<Input, NewState, Current>;

  /** React hook that returns the current state and a function to trigger the pipe */
  use(
    initialValue: State,
    cacheKey?: string,
    effect?: () => void | (() => void),
    deps?: any[]
  ): readonly [State, (value: Input) => void];
};

function createPipeFunction<T>(
  operators: Operator<any, any>[],
  context: PipeContext
) {
  const run = (value: T) => {
    const executeOperators = (
      ops: Operator<any, any>[],
      err: Error | null,
      currentValue: any,
      index: number = 0
    ): void => {
      // Check if component is still mounted before executing next operator
      if (context.isMounted && !context.isMounted()) {
        return;
      }

      if (index >= ops.length) {
        if (err) throw err;
        return;
      }

      const operator = ops[index];

      // Store context in a way that operators can access it
      const operatorWithContext = operator as any;
      operatorWithContext.context = context;

      try {
        operator(
          err,
          currentValue,
          (nextErr, nextValue) => {
            executeOperators(ops, nextErr, nextValue, index + 1);
          },
          (completeErr, completeValue) => {
            // complete callback - stop execution
          }
        );
      } catch (error) {
        executeOperators(ops, error as Error, currentValue, index + 1);
      }
    };

    executeOperators(operators, null, value, 0);
  };

  return run;
}

function createPipeBuilder<Input, State, Current = Input>(
  operators: Operator<any, any>[]
): PipeBuilder<Input, State, Current> {
  const basePipe = {
    map<U>(
      operation: (value: Current, state: State) => U
    ): PipeBuilder<Input, State, U> {
      const mapOperator: Operator<any, any> = (err, value, next) => {
        if (err) next(err);
        else {
          const ctx = (mapOperator as any).context as PipeContext;
          next(null, operation(value, ctx.currentState));
        }
      };
      return createPipeBuilder<Input, State, U>([...operators, mapOperator]);
    },

    async<U>(
      operation: (value: Current, state: State) => Promise<U>
    ): PipeBuilder<Input, State, U> {
      const asyncOperator: Operator<any, any> = (err, value, next) => {
        if (err) {
          next(err);
        } else {
          const ctx = (asyncOperator as any).context as PipeContext;
          operation(value, ctx.currentState)
            .then((result) => {
              next(null, result);
            })
            .catch((error) => {
              next(error);
            });
        }
      };
      return createPipeBuilder<Input, State, U>([...operators, asyncOperator]);
    },

    asyncRetry<U>(
      operation: (value: Current, state: State) => Promise<U>,
      retries: number,
      backoff?: number | ((attemptNumber: number) => number)
    ): PipeBuilder<Input, State, U> {
      const retryOperator: Operator<any, any> = (err, value, next) => {
        if (err) {
          next(err);
        } else {
          const ctx = (retryOperator as any).context as PipeContext;
          const attemptOperation = async (
            attemptNumber: number
          ): Promise<U> => {
            try {
              return await operation(value, ctx.currentState);
            } catch (error) {
              if (attemptNumber >= retries) {
                throw error;
              }

              if (backoff !== undefined) {
                const delayMs =
                  typeof backoff === "function"
                    ? backoff(attemptNumber + 1)
                    : backoff;
                await new Promise((resolve) => setTimeout(resolve, delayMs));
              }

              return attemptOperation(attemptNumber + 1);
            }
          };

          attemptOperation(0)
            .then((result) => {
              next(null, result);
            })
            .catch((error) => {
              next(error);
            });
        }
      };
      return createPipeBuilder<Input, State, U>([...operators, retryOperator]);
    },

    asyncQueue<U>(
      operation: (value: Current, state: State) => Promise<U>
    ): PipeBuilder<Input, State, U> {
      let queue: Array<{ value: any; next: Function; err: Error | null }> = [];
      let processing = false;

      const processQueue = async () => {
        if (processing || queue.length === 0) return;
        processing = true;

        while (queue.length > 0) {
          const item = queue.shift()!;
          if (item.err) {
            item.next(item.err);
          } else {
            const ctx = (queueOperator as any).context as PipeContext;
            try {
              const result = await operation(item.value, ctx.currentState);
              item.next(null, result);
            } catch (error) {
              item.next(error);
            }
          }
        }

        processing = false;
      };

      const queueOperator: Operator<any, any> = (err, value, next) => {
        queue.push({ value, next, err });
        processQueue();
      };

      return createPipeBuilder<Input, State, U>([...operators, queueOperator]);
    },

    asyncLast<U>(
      operation: (value: Current, state: State) => Promise<U>
    ): PipeBuilder<Input, State, U> {
      let pending: { value: any; next: Function; err: Error | null } | null =
        null;
      let processing = false;

      const processLast = async () => {
        if (processing || !pending) return;

        const current = pending;
        pending = null;
        processing = true;

        if (current.err) {
          current.next(current.err);
          processing = false;
          processLast();
        } else {
          const ctx = (asyncLastOperator as any).context as PipeContext;
          try {
            const result = await operation(current.value, ctx.currentState);
            current.next(null, result);
          } catch (error) {
            current.next(error);
          }
          processing = false;
          processLast();
        }
      };

      const asyncLastOperator: Operator<any, any> = (err, value, next) => {
        pending = { value, next, err };
        processLast();
      };

      return createPipeBuilder<Input, State, U>([
        ...operators,
        asyncLastOperator,
      ]);
    },

    asyncFirst<U>(
      operation: (value: Current, state: State) => Promise<U>
    ): PipeBuilder<Input, State, U> {
      let processing = false;

      const firstOperator: Operator<any, any> = (err, value, next) => {
        if (processing) return;

        if (err) {
          next(err);
        } else {
          processing = true;
          const ctx = (firstOperator as any).context as PipeContext;
          operation(value, ctx.currentState)
            .then((result) => {
              next(null, result);
              processing = false;
            })
            .catch((error) => {
              next(error);
              processing = false;
            });
        }
      };

      return createPipeBuilder<Input, State, U>([...operators, firstOperator]);
    },

    catch<U>(
      operation: (err: Error, state: State) => U
    ): PipeBuilder<Input, State, Current | U> {
      const catchOperator: Operator<any, any> = (err, value, next) => {
        const ctx = (catchOperator as any).context as PipeContext;
        if (err) next(null, operation(err, ctx.currentState));
        else next(null, value);
      };
      return createPipeBuilder<Input, State, Current | U>([
        ...operators,
        catchOperator,
      ]);
    },

    filter(
      operation: (value: Current, state: State) => boolean
    ): PipeBuilder<Input, State, Current> {
      const filterOperator: Operator<any, any> = (
        err,
        value,
        next,
        complete = next
      ) => {
        if (err) next(err);
        else {
          const ctx = (filterOperator as any).context as PipeContext;
          if (operation(value, ctx.currentState)) next(null, value);
          else complete(null, value);
        }
      };
      return createPipeBuilder<Input, State, Current>([
        ...operators,
        filterOperator,
      ]);
    },

    debounce(ms: number): PipeBuilder<Input, State, Current> {
      let timeout: NodeJS.Timeout | null = null;

      const debounceOperator: Operator<any, any> = (
        err,
        value,
        next,
        complete = next
      ) => {
        if (err) return next(err);

        if (timeout) {
          clearTimeout(timeout);
        }

        timeout = setTimeout(() => {
          timeout = null;
          next(null, value);
        }, ms);
      };
      return createPipeBuilder<Input, State, Current>([
        ...operators,
        debounceOperator,
      ]);
    },

    throttle(ms: number): PipeBuilder<Input, State, Current> {
      let lastCall = 0;

      const throttleOperator: Operator<any, any> = (
        err,
        value,
        next,
        complete = next
      ) => {
        if (err) return next(err);

        const now = Date.now();
        if (now - lastCall >= ms) {
          lastCall = now;
          next(null, value);
        } else {
          complete(null, value);
        }
      };
      return createPipeBuilder<Input, State, Current>([
        ...operators,
        throttleOperator,
      ]);
    },

    delay(ms: number): PipeBuilder<Input, State, Current> {
      const delayOperator: Operator<any, any> = (err, value, next) => {
        if (err) next(err);
        else
          setTimeout(() => {
            next(null, value);
          }, ms);
      };
      return createPipeBuilder<Input, State, Current>([
        ...operators,
        delayOperator,
      ]);
    },

    setState(
      value?: State | ((value: Current) => State)
    ): PipeBuilder<Input, State, Current> {
      const setOperator: Operator<any, any> = function (err, val, next) {
        if (err) {
          next(err);
        } else {
          const ctx = (setOperator as any).context as PipeContext;
          const newValue =
            value === undefined
              ? val
              : typeof value === "function"
              ? (value as (value: Current) => State)(val)
              : value;

          ctx.currentState = newValue;
          if (ctx.setState) {
            ctx.setState(newValue);
          }

          next(null, val);
        }
      };
      return createPipeBuilder<Input, State, Current>([
        ...operators,
        setOperator,
      ]);
    },

    updateState<NewState = State>(
      operation: (state: State, value: Current) => NewState
    ): PipeBuilder<Input, NewState, Current> {
      const updateOperator: Operator<any, any> = function (err, value, next) {
        if (err) {
          next(err);
        } else {
          const ctx = (updateOperator as any).context as PipeContext;
          const newValue = operation(ctx.currentState, value);

          ctx.currentState = newValue;
          if (ctx.setState) {
            ctx.setState(newValue);
          }

          next(null, value);
        }
      };
      return createPipeBuilder<Input, NewState, Current>([
        ...operators,
        updateOperator,
      ]);
    },

    use(
      initialValue: State,
      cacheKey?: string,
      effect?: () => void | (() => void),
      deps: any[] = []
    ): readonly [State, (value: Input) => void] {
      return usePipe<Input, State, Current>(
        operators,
        initialValue,
        cacheKey,
        effect,
        deps
      );
    },
  };

  return basePipe as PipeBuilder<Input, State, Current>;
}

// Effect management for cached pipes
type EffectEntry = {
  consumerCount: number;
  cleanup?: (() => void) | void;
  currentDeps: any[];
};

const effectCache = new Map<string, EffectEntry>();

function usePipe<Input, State, Current>(
  operators: Operator<any, any>[],
  initialValue: State,
  cacheKey?: string,
  effect?: () => void | (() => void),
  deps: any[] = []
): readonly [State, (value: Input) => void] {
  const cache = cacheKey ? useContext(CacheContext) : null;

  if (cacheKey && !cache) {
    throw new Error("Cache key provided but not within a CacheProvider");
  }

  const isMountedRef = useRef(true);
  const stateRef = useRef<State>(initialValue);
  const listenersRef = useRef<Set<() => void>>(new Set());
  const runRef = useRef<(value: Input) => void | undefined>(undefined);
  const effectKeyRef = useRef<string | undefined>(
    cacheKey && effect ? cacheKey : undefined
  );

  // Initialize pipe function
  if (!runRef.current) {
    const context: PipeContext = cache
      ? {
          get currentState() {
            return cache.get<State>(cacheKey!) ?? initialValue;
          },
          set currentState(value: any) {
            cache.set(cacheKey!, value);
          },
          setState: (value: any) => {
            cache.set(cacheKey!, value);
          },
          isMounted: () => isMountedRef.current,
        }
      : {
          get currentState() {
            return stateRef.current;
          },
          set currentState(value: any) {
            stateRef.current = value;
          },
          setState: (value: any) => {
            stateRef.current = value;
            listenersRef.current.forEach((listener) => listener());
          },
          isMounted: () => isMountedRef.current,
        };

    const pipeFn = createPipeFunction<Input>(operators, context);

    const run = (value: Input) => {
      if (!isMountedRef.current) return;
      pipeFn(value);
    };
    runRef.current = run;
  }

  // Set up store subscription
  const subscribeToStore = useCallback(
    (listener: () => void) => {
      if (cache && cacheKey) {
        return cache.subscribe<State>(cacheKey, listener);
      } else {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
      }
    },
    [cacheKey, cache]
  );

  const getSnapshot = useCallback(() => {
    if (cache && cacheKey) {
      return cache.get<State>(cacheKey) ?? initialValue;
    }
    return stateRef.current;
  }, [cacheKey, cache, initialValue]);

  const state = useSyncExternalStore(
    subscribeToStore,
    getSnapshot,
    getSnapshot
  );

  // Handle effect lifecycle
  useEffect(() => {
    isMountedRef.current = true;

    const effectKey = effectKeyRef.current;

    if (effectKey && effect) {
      let entry = effectCache.get(effectKey);

      if (!entry) {
        // First consumer - initialize and run effect
        entry = {
          consumerCount: 1,
          currentDeps: deps,
        };
        effectCache.set(effectKey, entry);

        const cleanup = effect();
        entry.cleanup = cleanup;
      } else {
        // Additional consumer
        entry.consumerCount++;

        // Check if deps changed
        const depsChanged =
          entry.currentDeps.length !== deps.length ||
          entry.currentDeps.some((dep, i) => dep !== deps[i]);

        if (depsChanged) {
          // Dispose current effect and restart
          if (entry.cleanup) {
            entry.cleanup();
          }
          entry.currentDeps = deps;
          const cleanup = effect();
          entry.cleanup = cleanup;
        }
      }
    }

    return () => {
      isMountedRef.current = false;

      if (effectKey && effect) {
        const entry = effectCache.get(effectKey);
        if (entry) {
          entry.consumerCount--;

          if (entry.consumerCount === 0) {
            // Last consumer unmounted - cleanup
            if (entry.cleanup) {
              entry.cleanup();
            }
            effectCache.delete(effectKey);
          }
        }
      }
    };
  }, [effectKeyRef.current, ...deps]);

  return [state, runRef.current!];
}

// Cache Store implementation
type Subscriber<T = any> = (value: T) => void;

type CacheStore = {
  values: Map<string, any>;
  subscribers: Map<string, Set<Subscriber>>;
  get<T = any>(key: string): T | undefined;
  set<T = any>(key: string, value: T): void;
  subscribe<T = any>(key: string, callback: Subscriber<T>): () => void;
  delete(key: string): void;
  clear(): void;
};

function createCacheStore(): CacheStore {
  const values = new Map<string, any>();
  const subscribers = new Map<string, Set<Subscriber>>();

  return {
    values,
    subscribers,

    get<T = any>(key: string): T | undefined {
      return values.get(key);
    },

    set<T = any>(key: string, value: T): void {
      values.set(key, value);
      const subs = subscribers.get(key);
      if (subs) {
        subs.forEach((callback) => callback(value));
      }
    },

    subscribe<T = any>(key: string, callback: Subscriber<T>): () => void {
      if (!subscribers.has(key)) {
        subscribers.set(key, new Set());
      }
      subscribers.get(key)!.add(callback);

      return () => {
        const subs = subscribers.get(key);
        if (subs) {
          subs.delete(callback);
          if (subs.size === 0) {
            subscribers.delete(key);
          }
        }
      };
    },

    delete(key: string): void {
      values.delete(key);
      const subs = subscribers.get(key);
      if (subs) {
        subs.forEach((callback) => callback(undefined));
      }
    },

    clear(): void {
      values.clear();
      subscribers.forEach((subs) => {
        subs.forEach((callback) => callback(undefined));
      });
      subscribers.clear();
    },
  };
}

// Cache Context
const CacheContext = createContext<CacheStore | null>(null);

type CacheProviderProps = {
  children: ReactNode;
};

export function CacheProvider({ children }: CacheProviderProps) {
  const storeRef = useRef<CacheStore | undefined>(undefined);

  if (!storeRef.current) {
    storeRef.current = createCacheStore();
  }

  return createElement(
    CacheContext.Provider,
    { value: storeRef.current },
    children
  );
}


export function pipe<Input = unknown, State = unknown>(): PipeBuilder<
  Input,
  State,
  Input
> {
  return createPipeBuilder<Input, State, Input>([]);
}
