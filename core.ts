/**
 * Task - Lazy computation DAG with dependency tracking
 *
 * Core type representing a node in a computation graph.
 * Tasks don't execute until run() is called.
 */

/**
 * Result of a computation that can succeed or fail
 */
export type Ok<T> = { ok: true; value: T };
export type Err<E> = { ok: false; error: E; errorTask: Task<any, any, E> };
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Task node in computation DAG
 *
 * @template T - Success value type
 * @template TDeps - Tuple of dependency tasks (must share error type E)
 * @template E - Error type
 */
export type Task<T, TDeps extends readonly Task<any, any, E>[], E> = {
  readonly label: string;
  readonly deps: TDeps;
  readonly compute: (values: UnwrapTasks<TDeps>) => Promise<Result<T, E>>;

  // Internal - managed by runtime
  _promise?: Promise<Result<T, E>>;
  _result?: Result<T, E>;
  _id: symbol;
};

export type TaskValue<TTask> = TTask extends Task<infer U, any, any> ? U : never;

export type TaskError<TTask> = TTask extends Task<any, any, infer E> ? E : never;

export type UnwrapTasks<T extends readonly Task<any, any, any>[]> = {
  [K in keyof T]: TaskValue<T[K]>;
};

/**
 * Create a new task node
 *
 * @example
 * const userTask = task('fetch-user', [], async () => {
 *   const user = await dbUser(supabase, id);
 *   return ok(user, ['fetched']);
 * });
 *
 * const streamsTask = task('fetch-streams', [userTask], async (user) => {
 *   const streams = await dbStreams(supabase, user.id);
 *   return ok(streams, ['fetched']);
 * });
 */
export function task<T, const TDeps extends readonly Task<any, any, E>[], E>(
  label: string,
  deps: TDeps,
  compute: (
    helpers: { ok: typeof ok; err: (error: E) => Err<E> },
    ...values: UnwrapTasks<TDeps>
  ) => Promise<Result<T, E>>
): Task<T, TDeps, E> {
  const taskNode: Task<T, TDeps, E> = {
    label,
    deps,
    compute: (values: UnwrapTasks<TDeps>) => {
      return compute(
        {
          ok,
          err: (error: E) => err(taskNode, error)
        },
        ...values
      );
    },
    _id: Symbol(label)
  };
  return taskNode;
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(task: Task<any, any, E>, error: E): Err<E> {
  return { ok: false, error, errorTask: task };
}
