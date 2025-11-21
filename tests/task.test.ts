/**
 * Tests for Task DAG execution
 */

import { describe, it, expect, vi } from 'vitest';
import { task, run, type Result } from '../src/index';

// Helper to add delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Task - Basic Construction', () => {
  it('should create a task with no dependencies', async () => {
    const t = task('simple', [], async ({ok}) => ok(42));
    
    const result = await run(t);
    
    expect(result).toEqual({ ok: true, value: 42 });
  });

  it('should create a task with one dependency', async () => {
    const a = task('a', [], async ({ok}) => ok(10));
    const b = task('b', [a], async ({ok}, aVal) => ok(aVal * 2));
    
    const result = await run(b);
    
    expect(result).toEqual({ ok: true, value: 20 });
  });

  it('should create a task with multiple dependencies', async () => {
    const a = task('a', [], async ({ok}) => ok(5));
    const b = task('b', [], async ({ok}) => ok(3));
    const c = task('c', [a, b], async ({ok}, aVal, bVal) => ok(aVal + bVal));
    
    const result = await run(c);
    
    expect(result).toEqual({ ok: true, value: 8 });
  });
});

describe('Task - Error Handling', () => {
  it('should propagate error from dependency', async () => {
    const a = task('a', [], async ({err}): Promise<Result<number, string>> => err('failed'));
    const b = task('b', [a], async ({ok}, aVal) => ok(aVal * 2));
    
    const result = await run(b);
    
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('failed');
      expect(result.errorTask.label).toBe('a'); // Error originates from task 'a'
    }
  });

  it('should return error from task itself', async () => {
    const a = task('a', [], async ({ok}) => ok(10));
    const b = task('b', [a], async ({err}) => err('computation failed'));
    
    const result = await run(b);
    
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('computation failed');
      expect(result.errorTask.label).toBe('b');
    }
  });

  it('should propagate first error in diamond dependency', async () => {
    const a = task('a', [], async ({err}): Promise<Result<number, string>> => err('root error'));
    const b = task('b', [a], async ({ok}, aVal) => ok(aVal * 2));
    const c = task('c', [a], async ({ok}, aVal) => ok(aVal * 3));
    const d = task('d', [b, c], async ({ok}, bVal, cVal) => ok(bVal + cVal));
    
    const result = await run(d);
    
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('root error');
      expect(result.errorTask.label).toBe('a'); // Error originates from task 'a'
    }
  });
});

describe('Task - Memoization', () => {
  it('should execute task only once when called multiple times', async () => {
    const compute = vi.fn(async ({ok}) => ok(42));
    const t = task('memo', [], compute);
    
    await run(t);
    await run(t);
    await run(t);
    
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('should share result in diamond dependency', async () => {
    const computeA = vi.fn(async ({ok}) => ok(10) as Result<number, string>);
    const a = task('a', [], computeA);
    const b = task('b', [a], async ({ok}, aVal) => ok(aVal * 2));
    const c = task('c', [a], async ({ok}, aVal) => ok(aVal * 3));
    const d = task('d', [b, c], async ({ok}, bVal, cVal) => ok(bVal + cVal));
    
    const result = await run(d);
    
    expect(result).toEqual({ ok: true, value: 50 }); // (10*2) + (10*3)
    expect(computeA).toHaveBeenCalledTimes(1); // 'a' executed only once
  });

  it('should cache errors as well', async () => {
    const compute = vi.fn(async ({err}) => err('failed'));
    const t = task('error-memo', [], compute);
    
    await run(t);
    await run(t);
    
    expect(compute).toHaveBeenCalledTimes(1);
  });
});

describe('Task - Parallel Execution', () => {
  it('should execute independent tasks in parallel', async () => {
    const startTime = Date.now();
    
    const a = task('a', [], async ({ok}) => {
      await delay(50);
      return ok(1);
    });
    const b = task('b', [], async ({ok}) => {
      await delay(50);
      return ok(2);
    });
    const c = task('c', [a, b], async ({ok}, aVal, bVal) => ok(aVal + bVal));
    
    const result = await run(c);
    const elapsed = Date.now() - startTime;
    
    expect(result).toEqual({ ok: true, value: 3 });
    expect(elapsed).toBeLessThan(100); // Should be ~50ms, not ~100ms
  });
});

describe('Task - Fail-Fast', () => {
  it('should return first error without waiting for slow dependencies', async () => {
    const startTime = Date.now();
    
    const fast = task('fast', [], async ({err}) => {
      await delay(10);
      return err('fast error');
    });
    
    const slow = task('slow', [], async ({ok}) => {
      await delay(200);
      return ok('slow success');
    });
    
    const combined = task('combined', [fast, slow], async ({ok}, f, s) => ok({ f, s }));
    
    const result = await run(combined);
    const elapsed = Date.now() - startTime;
    
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('fast error');
      expect(result.errorTask.label).toBe('fast'); // Error originates from task 'fast'
    }
    expect(elapsed).toBeLessThan(50); // Should return at ~10ms, not wait for 200ms
  });

  it('should not start dependencies if cached error exists', async () => {
    const errorTask = task('error', [], async ({err}): Promise<Result<number, string>> => err('cached error'));
    
    // Execute once to cache error
    await run(errorTask);
    
    const expensiveCompute = vi.fn(async ({ok}, val) => ok(val * 2));
    const dependent = task('dependent', [errorTask], expensiveCompute);
    
    const result = await run(dependent);
    
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('cached error');
      expect(result.errorTask.label).toBe('error'); // Error comes from errorTask
    }
    expect(expensiveCompute).not.toHaveBeenCalled();
  });
});

describe('Task - Complex DAG', () => {
  it('should handle complex dependency graph', async () => {
    //        a(1)
    //       /    \
    //     b(2)   c(3)
    //       \    /
    //        d(5)
    //         |
    //        e(10)
    
    const a = task('a', [], async ({ok}) => ok(1));
    const b = task('b', [a], async ({ok}, aVal) => ok(aVal + 1));
    const c = task('c', [a], async ({ok}, aVal) => ok(aVal + 2));
    const d = task('d', [b, c], async ({ok}, bVal, cVal) => ok(bVal + cVal));
    const e = task('e', [d], async ({ok}, dVal) => ok(dVal * 2));
    
    const result = await run(e);
    
    expect(result).toEqual({ ok: true, value: 10 }); // ((1+1) + (1+2)) * 2
  });

  it('should handle wide parallel dependencies', async () => {
    const tasks = Array.from({ length: 10 }, (_, i) => 
      task(`task-${i}`, [], async ({ok}) => {
        await delay(10);
        return ok(i);
      })
    );
    
    const sum = task('sum', tasks, async ({ok}, ...values) => {
      const total = values.reduce((acc, val) => acc + val, 0);
      return ok(total);
    });
    
    const startTime = Date.now();
    const result = await run(sum);
    const elapsed = Date.now() - startTime;
    
    expect(result).toEqual({ ok: true, value: 45 }); // 0+1+2+...+9 = 45
    expect(elapsed).toBeLessThan(50); // Should run in parallel, not sequential
  });
});
