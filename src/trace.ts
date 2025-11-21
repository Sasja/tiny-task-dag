/**
 * Task context utilities
 * 
 * Extract execution context from task DAG for debugging.
 */

import type { Task } from './core';

/**
 * Get execution path from task DAG
 * 
 * Returns topologically sorted list of task labels.
 * Shared dependencies appear only once (DAG, not tree).
 * 
 * @example
 * const path = getTrace(myTask);
 * // ['fetch-user', 'fetch-streams', 'combine-data']
 */
export function getTrace<T, E>(task: Task<T, any, E>): string[] {
  const visited = new Set<symbol>();
  const path: string[] = [];
  
  function traverse(t: Task<any, any, any>) {
    // Skip if already visited (shared dependency)
    if (visited.has(t._id)) return;
    visited.add(t._id);
    
    // Traverse dependencies first (depth-first)
    for (const dep of t.deps) {
      traverse(dep);
    }
    
    // Add this task after dependencies
    path.push(t.label);
  }
  
  traverse(task);
  return path;
}

/**
 * Get DAG structure for visualization
 * 
 * Returns array of edges [from, to] for graph visualization.
 * 
 * @example
 * const edges = getEdges(myTask);
 * // [['fetch-user', 'fetch-streams'], ['fetch-streams', 'combine-data']]
 */
export function getEdges<T, E>(task: Task<T, any, E>): Array<[string, string]> {
  const visited = new Set<symbol>();
  const edges: Array<[string, string]> = [];
  
  function traverse(t: Task<any, any, any>) {
    if (visited.has(t._id)) return;
    visited.add(t._id);
    
    // Add edges from dependencies to this task
    for (const dep of t.deps) {
      edges.push([dep.label, t.label]);
      traverse(dep);
    }
  }
  
  traverse(task);
  return edges;
}
