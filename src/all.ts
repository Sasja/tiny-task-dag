/**
 * Combine multiple tasks into a single task that runs them in parallel.
 * 
 * If any task fails, the combined task fails immediately with early failure behavior.
 * Results are returned as a tuple in the same order as input tasks.
 * 
 * This is the task system equivalent of Promise.all() - it composes tasks
 * that run in parallel as dependencies, with automatic error propagation.
 */

import { task } from './core.js';
import type { Task, UnwrapTasks, TaskError } from './core.js';

/**
 * Combine tasks to run in parallel with early failure
 * 
 * All tasks must share the same error type, which is inferred automatically.
 * 
 * @param id - Unique identifier for the combined task
 * @param tasks - Array of tasks to run in parallel
 * @returns Task that resolves to tuple of results
 * 
 * @example
 * import { all, run } from '$lib/task';
 * import { handleSvelteKitError } from '$lib/errors/handler-sveltekit';
 * 
 * const [profile, settings, prefs] = handleSvelteKitError(
 *   await run(all('user-data', [profileTask, settingsTask, prefsTask]))
 * );
 */
export function all<const TDeps extends readonly Task<any, any, any>[]>(
  id: string,
  tasks: TDeps
): Task<UnwrapTasks<TDeps>, TDeps, TaskError<TDeps[number]>> {
  return task(
    id,
    tasks,
    async ({ ok }, ...results: UnwrapTasks<TDeps>) => {
      // All tasks succeeded (dependencies run in parallel)
      // Return results as tuple preserving order
      return ok(results);
    }
  );
}
