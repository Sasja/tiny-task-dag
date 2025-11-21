/**
 * Task execution runtime
 *
 * Executes task DAGs with automatic dependency resolution,
 * parallel execution, and memoization.
 */

import type { Ok, Result, Task, UnwrapTasks } from './core';

/**
 * Execute a task and all its dependencies
 *
 * - Dependencies execute in parallel when possible
 * - Each task executes at most once (memoized)
 * - Short-circuits on first error
 *
 * @example
 * const result = await run(myTask);
 * if (result.ok) {
 *   console.log(result.value);
 * } else {
 *   console.error(result.error);
 * }
 */
export async function run<T, E>(task: Task<T, any, E>): Promise<Result<T, E>> {
  // Fast path: synchronous cache hit
  if (task._result) {
    return task._result;
  }

  // Return in-flight promise if already executing
  if (task._promise) {
    return task._promise;
  }

  // Start execution and cache promise
  task._promise = executeTask(task);
  const result = await task._promise;

  // Cache result synchronously for future calls
  task._result = result;
  return result;
}

/**
 * Internal: Execute task after resolving dependencies
 */
async function executeTask<T, TDeps extends readonly Task<any, any, E>[], E>(
  task: Task<T, TDeps, E>
): Promise<Result<T, E>> {
  // No deps case: if there are zero dependencies, compute directly
  if (task.deps.length === 0) {
    return await task.compute([] as UnwrapTasks<TDeps>);
  }

  // Fast path: check if any dependency already failed (synchronous check)
  for (const dep of task.deps) {
    if (dep._result && !dep._result.ok) {
      return dep._result; // Cached error - abort immediately
    }
  }

  // Execute all dependencies in parallel with fail-fast
  const depPromises = task.deps.map((dep: Task<any, any, E>) => run(dep));

  // Race: each contestant waits for one dep, then either returns error or waits for all
  const winner = await Promise.race(
    depPromises.map(async (depPromise: Promise<Result<any, E>>) => {
      // Wait for this horse to finish
      const depResult = await depPromise;

      // If our horse failed, return error immediately
      if (!depResult.ok) {
        return { type: 'error' as const, error: depResult };
      }

      // If our horse succeeded, wait for all the horses to finish
      const allResults = await Promise.all(depPromises);
      return { type: 'success' as const, allResults };
    })
  );

  // If winner is an error, return it
  if (winner.type === 'error') {
    return winner.error;
  } else {
    const depValues = (winner.allResults as Ok<any>[]).map((r) => r.value);
    const result = await task.compute(depValues as any);
    return result;
  }
}
