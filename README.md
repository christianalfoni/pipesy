# 🔄 Pipesy

**Elegant state management meets composable async operations**

Pipesy is a powerful library for building reactive data flows in React. Chain operators together to handle everything from simple state updates to complex async workflows with retries, queues, and error handling.

## ✨ Features

- 🎯 **Composable Operators** - Build complex logic from simple, reusable pieces
- ⚡ **Async Built-in** - First-class support for promises with multiple concurrency strategies
- 🔄 **State Management** - Integrated state handling with React hooks
- 🎣 **React Native** - Built specifically for React with automatic cleanup
- 💾 **Global Cache** - Share state across components effortlessly
- 📦 **TypeScript** - Full type inference throughout the pipeline
- 🪶 **Lightweight** - Small footprint, zero dependencies (except React)

## 📦 Installation

```bash
npm install pipesy
```

## 🚀 Quick Start

```tsx
import { pipe } from "pipesy";

function Counter() {
  const [count, increment] = pipe()
    .updateState((state, value) => state + value)
    .useState(0);

  return <button onClick={() => increment(1)}>Count: {count}</button>;
}
```

## 📚 Examples by Complexity

### Level 1: Basic Transformations

Transform incoming values before setting state:

```tsx
function NameInput() {
  const [name, onNameChange] = pipe()
    .map((event) => event.target.value)
    .map((value) => value.trim())
    .map((value) => value.toUpperCase())
    .setState()
    .useState("");

  return (
    <div>
      <input onChange={onNameChange} />
      <p>Hello, {name}!</p>
    </div>
  );
}
```

### Level 2: Filtering & Validation

Only update state when conditions are met:

```tsx
function AgeInput() {
  const [age, onAgeChange] = pipe()
    .map((event) => event.target.value)
    .map((value) => parseInt(value))
    .filter((value) => !isNaN(value) && value >= 0 && value <= 120)
    .setState()
    .useState(0);

  return (
    <div>
      <input type="number" onChange={onAgeChange} />
      <p>Valid age: {age}</p>
    </div>
  );
}
```

### Level 3: Debouncing User Input

Delay execution until user stops typing:

```tsx
function SearchBox() {
  const [query, onQueryChange] = pipe()
    .map((event) => event.target.value)
    .updateState((state, value) => ({ ...state, input: value }))
    .debounce(500)
    .map((value) => value.trim())
    .filter((value) => value.length >= 3)
    .updateState((state, value) => ({ ...state, query: value }))
    .useState({ input: "", query: "" });

  return (
    <div>
      <input
        onChange={onQueryChange}
        value={query.input}
        placeholder="Search..."
      />
      <p>Searching for: {query}</p>
    </div>
  );
}
```

### Level 4: Async Data Fetching

Handle async operations seamlessly:

```tsx
function UserProfile() {
  const [user, fetchUser] = pipe()
    .setState({ status: "loading", data: null })
    .async(async (userId) => {
      const response = await fetch(`/api/users/${userId}`);
      const data = await response.json();

      return { status: "success", data };
    })
    .setState()
    .useState({ status: "idle", data: null });

  return (
    <div>
      <button onClick={() => fetchUser("123")}>Load User</button>
      {user.status === "loading" && <p>Loading...</p>}
      {user.data && <p>Name: {user.data.name}</p>}
    </div>
  );
}
```

### Level 5: Error Handling

Gracefully handle errors in your pipeline:

```tsx
function ResilientFetcher() {
  const [result, fetch] = pipe()
    .setState({ loading: true, data: null, error: null })
    .async(async (state, url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      return { loading: false, data, error: null };
    })
    .catch((error) => ({
      loading: false,
      data: null,
      error: error.message,
    }))
    .setState()
    .useState({ loading: false, data: null, error: null });

  return (
    <div>
      <button onClick={() => fetch("/api/data")}>Fetch</button>
      {result.loading && <p>Loading...</p>}
      {result.error && <p style={{ color: "red" }}>Error: {result.error}</p>}
      {result.data && <pre>{JSON.stringify(result.data, null, 2)}</pre>}
    </div>
  );
}
```

### Level 6: Retry with Exponential Backoff

Automatically retry failed requests:

```tsx
function ReliableDataFetcher() {
  const [data, fetchData] = pipe()
    .setState({ loading: true, data: null, error: null })
    .asyncRetry(
      async (state, url) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Network error");
        const data = await res.json();

        return { loading: false, data, error: null };
      },
      3, // Retry up to 3 times
      (attempt) => Math.pow(2, attempt) * 1000 // Exponential backoff: 2s, 4s, 8s
    )
    .catch((error) => ({
      loading: false,
      data: null,
      error: "Failed after 3 retries",
    }))
    .setState()
    .useState({ loading: false, data: null, error: null });

  return (
    <div>
      <button onClick={() => fetchData("/api/flaky-endpoint")}>
        Fetch with Retry
      </button>
      {data.loading && <p>Loading (will retry on failure)...</p>}
      {data.error && <p>{data.error}</p>}
      {data.data && <p>Success! {JSON.stringify(data.data)}</p>}
    </div>
  );
}
```

### Level 7: Queue Processing

Process multiple requests in order:

```tsx
function BatchEmailSender() {
  const [status, sendEmail] = pipe()
    .updateState((state, email) => ({
      ...state,
      queue [...state.queue, email],
    }))
    .asyncQueue(async (email, state) => {
      // Sends emails one at a time, in order
      await fetch("/api/send-email", {
        method: "POST",
        body: JSON.stringify({ to: email }),
      });
      return {
        sent: [...state.sent, email],
        queue: state.queue.slice(1),
      };
    })
    .setState()
    .useState({ sent: [], queue: [], total: 0 });

  return (
    <div>
      <button onClick={() => sendEmail("user1@example.com")}>
        Send to User 1
      </button>
      <button onClick={() => sendEmail("user2@example.com")}>
        Send to User 2
      </button>
      <button onClick={() => sendEmail("user3@example.com")}>
        Send to User 3
      </button>
      <p>Currently sending: {status.current || "none"}</p>
      <p>
        Sent: {status.sent.length} / {status.total}
      </p>
    </div>
  );
}
```

### Level 8: Take Latest (Cancel Previous)

Only process the most recent request:

```tsx
function AutocompleteSearch() {
  const [results, onQueryChange] = pipe()
    .debounce(300)
    .map((event) => event.target.value)
    .filter((query) => query.length >= 2)
    .asyncLast(async (query) => {
      // If a new search comes in, this one is abandoned
      const res = await fetch(`/api/autocomplete?q=${query}`);
      return await res.json();
    })
    .setState()
    .useState([]);

  return (
    <div>
      <input onChange={onQueryChange} placeholder="Type to search..." />
      <ul>
        {results.map((result, i) => (
          <li key={i}>{result}</li>
        ))}
      </ul>
    </div>
  );
}
```

### Level 9: Throttling High-Frequency Events

Limit how often updates occur:

```tsx
function MouseTracker() {
  const [position, onMouseMove] = pipe()
    .throttle(100) // Update at most every 100ms
    .map((event) => ({ x: event.clientX, y: event.clientY }));
    .setState()
    .useState({ x: 0, y: 0 });

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, []);

  return (
    <div>
      Mouse: {position.x}, {position.y}
    </div>
  );
}
```

### Level 10: External Data Subscriptions

Subscribe to external data sources like WebSockets:

```tsx
function LiveNotifications() {
  const [notifications, addNotification] = pipe()
    .updateState((state, notification) => [...state, notification])
    .use([]);

  useEffect(() => {
    const ws = new WebSocket("wss://api.example.com/notifications");

    ws.onmessage = (event) => {
      const notification = JSON.parse(event.data);
      addNotification(notification);
    };

    return () => {
      ws.close();
    };
  }, []);

  return (
    <div>
      <h3>Live Notifications ({notifications.length})</h3>
      <ul>
        {notifications.map((notif, i) => (
          <li key={i}>{notif.message}</li>
        ))}
      </ul>
    </div>
  );
}
```

### Level 11: Global State with Cache

Share state across multiple components:

```tsx
import { pipe, CacheProvider } from "pipesy";

function App() {
  return (
    <CacheProvider>
      <UserProfile />
      <UserSettings />
    </CacheProvider>
  );
}

function useCurrentUser() {
  const [user, loadUser] = pipe()
    .setState()
    .useCache("current-user", null);

  useEffect(() => {
    fetch(`/api/users/me`)
      .then((res) => res.json())
      .then(loadUser);
  }, []);

  return user;
}

function UserProfile() {
  const user = useCurrentUser();
  return <div>{user ? `Welcome, ${user.name}!` : "Loading..."}</div>;
}

function UserSettings() {
  const user = useCurrentUser();

  return (
    <div>
      {user && (
        <div>
          <p>Email: {user.email}</p>
          <p>Joined: {user.joinedDate}</p>
        </div>
      )}
    </div>
  );
}
```

### Level 12: Complex State Machine

Build sophisticated state machines with clear transitions:

```tsx
function FileUploader() {
  const [upload, triggerUpload] = pipe()
    .map((file, state) => {
      if (state.status === "uploading") return state; // Prevent double upload
      return { status: "uploading", progress: 0, url: null, error: null };
    })
    .setState()
    .async(async (file) => {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
      return await res.json();
    })
    .map((result) => ({
      status: "success",
      progress: 100,
      url: result.url,
      error: null,
    }))
    .setState()
    .catch((state, error) => ({
      status: "error",
      progress: 0,
      url: null,
      error: error.message,
    }))
    .setState()
    .use({
      status: "idle",
      progress: 0,
      url: null,
      error: null,
    });

  return (
    <div>
      <input
        type="file"
        onChange={(e) =>
          e.target.files?.[0] && triggerUpload(e.target.files[0])
        }
        disabled={upload.status === "uploading"}
      />

      {upload.status === "uploading" && <p>Uploading...</p>}
      {upload.status === "success" && <p>✅ Uploaded: {upload.url}</p>}
      {upload.status === "error" && <p>❌ Error: {upload.error}</p>}
    </div>
  );
}
```

## 🔧 API Reference

### `pipe(subscription?)`

Creates a new pipeline.

- Optional `subscription` - Function that subscribes to external data and returns cleanup function

### Transformation Operators

#### `.map(fn: (state, value) => newValue)`

Synchronously transform the value.

#### `.async(fn: (state, value) => Promise<newValue>)`

Asynchronously transform the value.

#### `.filter(fn: (state, value) => boolean)`

Only pass values that match the predicate.

### Async Strategies

#### `.asyncRetry(fn, retries, backoff?)`

Retry failed async operations with optional backoff.

- `backoff`: number (fixed delay) or function `(attempt) => delay`

#### `.asyncQueue(fn)`

Queue async operations, processing them sequentially.

#### `.asyncLast(fn)`

Only process the most recent operation, abandon previous ones.

#### `.asyncFirst(fn)`

Ignore new operations while one is in progress.

### Timing Operators

#### `.debounce(ms)`

Wait `ms` milliseconds after last call before executing.

#### `.throttle(ms)`

Execute at most once per `ms` milliseconds.

#### `.delay(ms)`

Delay execution by `ms` milliseconds.

### State Operators

#### `.setState(value?)`

Update state with the current value, a static value, or a function.

- No argument: Set state to the current pipeline value
- Value: Set state to this value
- Function: Transform current value before setting state

#### `.updateState(fn: (state, value) => newState)`

Update state based on both current state and the value.

### Error Handling

#### `.catch(fn: (state, error) => recoveryValue)`

Handle errors in the pipeline and provide a recovery value.

### Termination

#### `.use(initialValue)`

Returns `[state, dispatch]` tuple - works like `useState`.

- `initialValue` - The initial state value for the pipeline

#### `.useCache(cacheKey, initialValue)`

Like `.use()` but shares state globally via cache key.

- `cacheKey` - Unique cache key to share state across components
- `initialValue` - The initial state value for the pipeline

## 🎨 Patterns & Best Practices

### Pattern: Loading States

```tsx
const [data, fetch] = pipe()
  .map((state, url) => ({ ...state, loading: true, error: null }))
  .setState()
  .async(async (state, url) => {
    /* fetch */
  })
  .map((state, result) => ({ loading: false, data: result, error: null }))
  .setState()
  .catch((state, error) => ({ ...state, loading: false, error }))
  .setState()
  .use({ loading: false, data: null, error: null });
```

### Pattern: Optimistic Updates

```tsx
const [todos, updateTodo] = pipe()
  .updateState((state, todo) =>
    state.map((t) => (t.id === todo.id ? { ...t, ...todo } : t))
  )
  .asyncLast(async (state, todo) => {
    await fetch(`/api/todos/${todo.id}`, {
      method: "PATCH",
      body: JSON.stringify(todo),
    });
    return state; // Keep optimistic update
  })
  .catch((state, error) => {
    // Revert optimistic update on error
    // ... rollback logic
  })
  .use([]);
```

### Pattern: Request Deduplication

```tsx
const [data, request] = pipe()
  .asyncFirst(async (state, requestId) => {
    // Ignores subsequent requests until this completes
    const result = await fetch(`/api/data/${requestId}`);
    return { data: await result.json(), requestId };
  })
  .setState()
  .use({ data: null, requestId: null });
```

## 🧪 Cache API

Access the cache directly:

```tsx
import { useCache } from "pipesy";

function Component() {
  const cache = useCache();

  // Get value
  const user = cache.get("user");

  // Set value
  cache.set("user", { name: "Alice" });

  // Delete value
  cache.delete("user");

  // Clear all
  cache.clear();
}
```

## 💡 Why React Pipeline?

**vs useState**: Handles complex async flows, debouncing, retries, and queuing out of the box.

**vs useReducer**: More composable, better for async, easier to read and reason about.

**vs external state libraries**: Lighter weight, React-native, no boilerplate, local or global as needed.

**vs RxJS**: Simpler API, designed specifically for React, better TypeScript inference.

## 📄 License

MIT

---

Built with ❤️ for the React community
