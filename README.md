# Tiny Async Computation DAG

A minimal (~200 LOC, no deps) Generic TypeScript library for building and executing asynchronous dependency graphs with parallelization and typed error handling.

## Why?

When building web applications, you often need to:
- Fetch/parse/transform and merge data from multiple sources (databases, APIs)
- Reuse the same flows across different environments (client, SSR, API handlers, workers)
- Propagate and handle errors differently in each environment (HTTP status codes, retries, user notifications and suitable logs)

This is such a common problem, so I must be reinventing the wheel here. But still, I couldn't find the library that scratched my particular itch so I spent a few days building this. If you know of lightweight alternatives that do this better, I'd love to hear about it!

## Features

### ✅ Includes

- **Result types** - `Result<T, E>` instead of thrown exceptions
- **Lazy execution** - build computation graphs, execute when ready
- **Automatic parallelization** - independent tasks run concurrently
- **Fail-fast** - returns first error without waiting for slow dependencies
- **Memoization** - shared dependencies execute once
- **Computation traces** - track execution path with informative error messages
- **Full type inference** - types flow through the entire pipeline automatically
- **Async task chaining** - compose complex workflows

### ❌ Doesn't include (out of the box)

- Parallel task cancellation
- Retry strategies
- Synchronous flows (async-only)

## Core Types

```typescript
// Results wrap success or failure
type Ok<T> = { ok: true; value: T };
type Err<E> = { ok: false; error: E; errorTask: Task };
type Result<T, E> = Ok<T> | Err<E>;

// Tasks are lazy computation nodes with dependencies
type Task<T, E> = {
  label: string;  // for tracing in error messages
  deps: Task[];   // dependencies which we need for 'compute'
  compute: (values: any[]) => Promise<Result<T, E>>;  // the work
};
```
NOTE: This is a somewhat simplified version of the actual `Task` type for the purpose of this introduction

## Basic Example

Let's build a complete data pipeline step by step.

**Scenario**: Fetch a user profile from a database, fetch an article from a website, validate both with Zod, then query an LLM to summarize the article for the user.

### Step 1: Fetch user profile from database

```typescript
import { task, run, type Result } from '$lib/task';
import { z } from 'zod';

// Define error type for our domain
type AppError = 
  | { type: 'NOT_FOUND'; message: string }
  | { type: 'VALIDATION_ERROR'; message: string }
  | { type: 'API_ERROR'; message: string };

// Fetch user profile
const userProfileTask = task(
  'fetch-profile',  // label for debugging
  [],               // no dependencies
  async ({ ok, err }) => {
    const response = await fetch(`/api/users/123`);
    if (!response.ok) return err({ type: 'NOT_FOUND', message: 'User not found' });
    return ok(await response.json());
  }
);
```

### Step 2: Validate with Zod

```typescript
const userSchema = z.object({
  id: z.number(),
  name: z.string(),
  interests: z.array(z.string())
});

const validatedUserTask = task(
  'validate-user',      // label for debugging
  [userProfileTask],    // depends on user profile fetch
  async ({ ok, err }, rawUser) => {
    const parsed = userSchema.safeParse(rawUser);
    if (!parsed.success) {
      return err({ type: 'VALIDATION_ERROR', message: 'Invalid user data' });
    }
    return ok(parsed.data);
  }
);
```

### Step 3: Fetch article from website, and validate it as well

```typescript
const articleSchema = z.object({
  title: z.string(),
  content: z.string()
});

const articleTask = task(
  'fetch-article',  // label for debugging
  [],               // no dependencies
  async ({ ok, err }) => {
    const response = await fetch('https://example.com/article');
    if (!response.ok) return err({ type: 'NOT_FOUND', message: 'Article not found' });
    return ok(await response.json());
  }
);

const validatedArticleTask = task(
  'validate-article',  // label for debugging
  [articleTask],       // depends on article fetch
  async ({ ok, err }, rawArticle) => {
    const parsed = articleSchema.safeParse(rawArticle);
    if (!parsed.success) {
      return err({ type: 'VALIDATION_ERROR', message: 'Invalid article data' });
    }
    return ok(parsed.data);
  }
);
```

### Step 4: Query LLM with both results

```typescript
const summaryTask = task(
  'llm-summary',
  [validatedUserTask, validatedArticleTask],
  async ({ ok, err }, user, article) => {
    // validatedUserTask and validatedArticleTask run in parallel
    // user and article are fully typed here!
    
    const prompt = `Summarize this article for ${user.name} who is interested in ${user.interests.join(', ')}:\n\n${article.content}`;
    
    const response = await fetch('/api/llm', {
      method: 'POST',
      body: JSON.stringify({ prompt })
    });
    
    if (!response.ok) {
      return err({ type: 'API_ERROR', message: 'LLM API failed' });
    }
    
    const result = await response.json();
    return ok({ user, article, summary: result.summary });
  }
);
```

### Step 5: Execute the task graph

```typescript
// Launch the task and await the result
const result = await run(summaryTask);
// Nothing executes until run() is called (lazy execution)
```

### Step 6: Define an error handler for your environment

Since we're running in the client, let's define a simple handler:

```typescript
import { getTrace } from '$lib/task';

function handleClientError<T>(result: Result<T, AppError>): T | null {
  if (result.ok) return result.value;
  
  // Show user-friendly error
  alert(result.error.message);
  
  // Log for debugging with execution trace (super useful!)
  const trace = getTrace(result.errorTask);
  console.error('Task failed:', result.error);
  console.error('Execution trace:', trace.join(' → '));
  
  return null;
}
```

### Step 7: Unwrap and use the value

```typescript
const data = handleClientError(result);

if (data) {
  console.log(`Summary for ${data.user.name}:`, data.summary);
  // Full type inference: data is { user, article, summary }
}
```

### Alternative to Step 5-7: Bind directly to the DOM

In frameworks like Svelte, you can bind the task result directly:

```html
{#await run(summaryTask)}
  <p>Loading summary...</p>
{:then result}
  {#if result.ok}
    <h2>{result.value.article.title}</h2>
    <p>Summary for {result.value.user.name}:</p>
    <p>{result.value.summary}</p>
  {:else}
    <p>Error: {result.error.message}</p>
  {/if}
{/await}
```

That's it! This example demonstrates:
- ✅ Result types (no exceptions thrown)
- ✅ Lazy execution (built the graph, ran when ready)
- ✅ Automatic parallelization (user and article fetched concurrently)
- ✅ Full type inference (types flow through the pipeline)
- ✅ Environment-specific error handling (client alert/log)

### Bonus: Using `all()` for parallel tasks
Turn an tuple of `Task`'s into a single `Task` over a tuple with the wrapped types.

```typescript
import { all } from '$lib/task';

// Run multiple independent tasks in parallel
const dataTask = all('user-data', [profileTask, settingsTask, prefsTask]);
const result = await run(dataTask);

if (result.ok) {
  const [profile, settings, prefs] = result.value; // Tuple preserves order
}
```

### Bonus: Debugging with traces

```typescript
import { getTrace } from '$lib/task';

const result = await run(summaryTask);
if (!result.ok) {
  const trace = getTrace(result.errorTask);
  console.error(`Failed: ${result.error.message}`);
  console.error(`Trace: ${trace.join(' → ')}`);
  // "Trace: fetch-article → validate-article → llm-summary"
}
```

## Multi-Environment Pattern

The real power: define your data flow **once**, handle errors **per environment**.

### Define reusable tasks

```typescript
// lib/tasks/user.ts
export function userTask(userId: string) {
  return task('fetch-user', [], async ({ ok, err }) => {
    const response = await fetch(`/api/users/${userId}`);
    if (!response.ok) return err({ type: 'NOT_FOUND', message: 'User not found' });
    return ok(await response.json());
  });
}
```

### Different error handlers for different environments

**Client (browser alerts)**
```typescript
function handleClientError<T>(result: Result<T, AppError>): T | null {
  if (result.ok) return result.value;
  alert(result.error.message);
  return null;
}
```

**SvelteKit (HTTP status codes)**
```typescript
import { error } from '@sveltejs/kit';

function handleSvelteKitError<T>(result: Result<T, AppError>): T {
  if (result.ok) return result.value;
  const status = result.error.type === 'NOT_FOUND' ? 404 : 500;
  throw error(status, result.error.message);
}
```

**Trigger.dev (retry strategy)**
```typescript
import { AbortTaskRunError } from '@trigger.dev/sdk';

function handleTriggerError<T>(result: Result<T, AppError>): T {
  if (result.ok) return result.value;
  const retryable = result.error.type === 'NETWORK_ERROR';
  throw retryable ? new Error(result.error.message) : new AbortTaskRunError(result.error.message);
}
```

**API endpoint (JSON)**
```typescript
import { json } from '@sveltejs/kit';

export async function GET() {
  const result = await run(userTask('123'));
  return result.ok 
    ? json(result.value) 
    : json({ error: result.error.message }, { status: 500 });
}
```

Same tasks, different error handling strategies!

## API Reference

- **`task(label, deps, compute)`** - Create a task node
- **`run(task)`** - Execute task graph, returns `Promise<Result<T, E>>`
- **`all(label, tasks)`** - Combine tasks for parallel execution
- **`getTrace(task)`** - Get execution path for debugging

## Performance

- **Memoization**: O(1) cache lookup, shared dependencies run once
- **Parallelization**: Independent tasks run concurrently
- **Fail-fast**: Returns on first error without waiting

## License & Disclaimer

MIT License - use at your own risk.