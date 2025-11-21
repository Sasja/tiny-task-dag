/**
 * Task - Lazy computation DAG
 * 
 * Build and execute dependency graphs with automatic parallelization.
 * 
 * @example
 * import { task, run, type Result } from '$lib/task';
 * 
 * const userTask = task('user', [], async () => {
 *   const user = await dbUser(supabase, id);
 *   return { ok: true, value: user };
 * });
 * 
 * const streamsTask = task('streams', [userTask], async (user) => {
 *   const streams = await dbStreams(supabase, user.id);
 *   return { ok: true, value: streams };
 * });
 * 
 * const result = await run(streamsTask);
 */

export type { Task, Result, Ok, Err } from './core.js';
export { task, ok, err } from './core.js';
export { run } from './run.js';
export { getTrace, getEdges } from './trace.js';
export { all } from './all.js';
