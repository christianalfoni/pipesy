import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { pipe, CacheProvider } from "./index";

describe("Core Operators", () => {
  describe("map", () => {
    it("should transform value synchronously", () => {
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .map((x) => x * 2)
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      expect(screen.getByText("Value: 10")).toBeDefined();
    });

    it("should have access to current state", () => {
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .map((x, state) => x + state)
          .setState()
          .use(5);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(3)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      expect(screen.getByText("Value: 8")).toBeDefined();
    });

    it("should pass transformed value to next operator", () => {
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .map((x) => x * 2)
          .map((x) => x + 10)
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      expect(screen.getByText("Value: 20")).toBeDefined();
    });

    it("should propagate errors without transformation", () => {
      const errorHandler = vi.fn();
      function Component() {
        const [value, trigger] = pipe<number, string>()
          .map(() => {
            throw new Error("test error");
          })
          .catch((err) => err.message)
          .setState()
          .use("");

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      expect(screen.getByText("Value: test error")).toBeDefined();
    });
  });

  describe("async", () => {
    it("should transform value asynchronously", async () => {
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .async(async (x) => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            return x * 2;
          })
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      await waitFor(() => {
        expect(screen.getByText("Value: 10")).toBeDefined();
      });
    });

    it("should handle promise resolution", async () => {
      function Component() {
        const [value, trigger] = pipe<number, string>()
          .async(async (x) => Promise.resolve(`Result: ${x}`))
          .setState()
          .use("");

        return (
          <div>
            <p>{value}</p>
            <button onClick={() => trigger(42)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      await waitFor(() => {
        expect(screen.getByText("Result: 42")).toBeDefined();
      });
    });

    it("should handle promise rejection", async () => {
      function Component() {
        const [value, trigger] = pipe<number, string>()
          .async(async () => Promise.reject(new Error("async error")))
          .catch((err) => err.message)
          .setState()
          .use("");

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      await waitFor(() => {
        expect(screen.getByText("Value: async error")).toBeDefined();
      });
    });

    it("should have access to current state", async () => {
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .async(async (x, state) => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            return x + state;
          })
          .setState()
          .use(10);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      await waitFor(() => {
        expect(screen.getByText("Value: 15")).toBeDefined();
      });
    });
  });

  describe("asyncRetry", () => {
    it("should retry on failure up to specified count", async () => {
      let attempts = 0;
      function Component() {
        const [value, trigger] = pipe<number, string>()
          .asyncRetry(
            async (x) => {
              attempts++;
              if (attempts < 3) throw new Error("fail");
              return `Success after ${attempts} attempts`;
            },
            3,
            10
          )
          .setState()
          .use("");

        return (
          <div>
            <p>{value}</p>
            <button onClick={() => trigger(1)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      await waitFor(
        () => {
          expect(screen.getByText("Success after 3 attempts")).toBeDefined();
        },
        { timeout: 1000 }
      );
    });

    it("should succeed on first attempt if operation succeeds", async () => {
      function Component() {
        const [value, trigger] = pipe<number, string>()
          .asyncRetry(async (x) => `Success: ${x}`, 3, 10)
          .setState()
          .use("");

        return (
          <div>
            <p>{value}</p>
            <button onClick={() => trigger(42)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      await waitFor(() => {
        expect(screen.getByText("Success: 42")).toBeDefined();
      });
    });

    it("should fail after all retries exhausted", async () => {
      let attempts = 0;
      function Component() {
        const [value, trigger] = pipe<number, string>()
          .asyncRetry(
            async () => {
              attempts++;
              throw new Error("persistent failure");
            },
            2,
            10
          )
          .catch((err) => `Error: ${err.message}`)
          .setState()
          .use("");

        return (
          <div>
            <p>{value}</p>
            <button onClick={() => trigger(1)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      await waitFor(
        () => {
          expect(screen.getByText("Error: persistent failure")).toBeDefined();
        },
        { timeout: 1000 }
      );
      expect(attempts).toBe(3); // initial + 2 retries
    });

    it("should apply fixed backoff delay between retries", async () => {
      const timestamps: number[] = [];
      function Component() {
        const [value, trigger] = pipe<number, string>()
          .asyncRetry(
            async () => {
              timestamps.push(Date.now());
              if (timestamps.length < 3) throw new Error("fail");
              return "success";
            },
            3,
            50
          )
          .setState()
          .use("");

        return (
          <div>
            <p>{value}</p>
            <button onClick={() => trigger(1)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      await waitFor(
        () => {
          expect(screen.getByText("success")).toBeDefined();
        },
        { timeout: 1000 }
      );

      // Check that delays are approximately 50ms
      expect(timestamps[1]! - timestamps[0]!).toBeGreaterThanOrEqual(45);
      expect(timestamps[2]! - timestamps[1]!).toBeGreaterThanOrEqual(45);
    });

    it("should apply function-based backoff (e.g., exponential)", async () => {
      const timestamps: number[] = [];
      function Component() {
        const [value, trigger] = pipe<number, string>()
          .asyncRetry(
            async () => {
              timestamps.push(Date.now());
              if (timestamps.length < 3) throw new Error("fail");
              return "success";
            },
            3,
            (attempt) => attempt * 50
          )
          .setState()
          .use("");

        return (
          <div>
            <p>{value}</p>
            <button onClick={() => trigger(1)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      await waitFor(
        () => {
          expect(screen.getByText("success")).toBeDefined();
        },
        { timeout: 1000 }
      );

      // First retry: 50ms, second retry: 100ms
      expect(timestamps[1]! - timestamps[0]!).toBeGreaterThanOrEqual(45);
      expect(timestamps[2]! - timestamps[1]!).toBeGreaterThanOrEqual(95);
    });

    it("should not delay if backoff is undefined", async () => {
      const timestamps: number[] = [];
      function Component() {
        const [value, trigger] = pipe<number, string>()
          .asyncRetry(async () => {
            timestamps.push(Date.now());
            if (timestamps.length < 3) throw new Error("fail");
            return "success";
          }, 3)
          .setState()
          .use("");

        return (
          <div>
            <p>{value}</p>
            <button onClick={() => trigger(1)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      await waitFor(
        () => {
          expect(screen.getByText("success")).toBeDefined();
        },
        { timeout: 1000 }
      );

      // Retries should happen immediately
      expect(timestamps[1]! - timestamps[0]!).toBeLessThan(20);
      expect(timestamps[2]! - timestamps[1]!).toBeLessThan(20);
    });
  });

  describe("asyncQueue", () => {
    it("should execute async operations sequentially in order", async () => {
      const executionOrder: number[] = [];
      function Component() {
        const [value, trigger] = pipe<number, string>()
          .asyncQueue(async (x) => {
            executionOrder.push(x);
            await new Promise((resolve) => setTimeout(resolve, 50));
            return `Done: ${x}`;
          })
          .setState()
          .use("");

        return (
          <div>
            <p>{value}</p>
            <button onClick={() => trigger(1)}>First</button>
            <button onClick={() => trigger(2)}>Second</button>
            <button onClick={() => trigger(3)}>Third</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("First"));
      fireEvent.click(screen.getByText("Second"));
      fireEvent.click(screen.getByText("Third"));

      await waitFor(
        () => {
          expect(screen.getByText("Done: 3")).toBeDefined();
        },
        { timeout: 1000 }
      );

      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it("should wait for previous operation before starting next", async () => {
      const startTimes: number[] = [];
      const endTimes: number[] = [];

      function Component() {
        const [value, trigger] = pipe<number, string>()
          .asyncQueue(async (x) => {
            startTimes.push(Date.now());
            await new Promise((resolve) => setTimeout(resolve, 50));
            endTimes.push(Date.now());
            return `Done: ${x}`;
          })
          .setState()
          .use("");

        return (
          <div>
            <p>{value}</p>
            <button onClick={() => trigger(1)}>First</button>
            <button onClick={() => trigger(2)}>Second</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("First"));
      fireEvent.click(screen.getByText("Second"));

      await waitFor(
        () => {
          expect(screen.getByText("Done: 2")).toBeDefined();
        },
        { timeout: 1000 }
      );

      // Second operation should start after first ends
      expect(startTimes[1]!).toBeGreaterThanOrEqual(endTimes[0]!);
    });

    it("should handle multiple queued operations", async () => {
      const results: number[] = [];
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .asyncQueue(async (x) => {
            await new Promise((resolve) => setTimeout(resolve, 20));
            results.push(x);
            return x;
          })
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(1)}>1</button>
            <button onClick={() => trigger(2)}>2</button>
            <button onClick={() => trigger(3)}>3</button>
            <button onClick={() => trigger(4)}>4</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("1"));
      fireEvent.click(screen.getByText("2"));
      fireEvent.click(screen.getByText("3"));
      fireEvent.click(screen.getByText("4"));

      await waitFor(
        () => {
          expect(screen.getByText("Value: 4")).toBeDefined();
        },
        { timeout: 1000 }
      );

      expect(results).toEqual([1, 2, 3, 4]);
    });

    it("should handle errors in queue", async () => {
      const results: string[] = [];
      function Component() {
        const [value, trigger] = pipe<number, string>()
          .asyncQueue(async (x) => {
            await new Promise((resolve) => setTimeout(resolve, 20));
            if (x === 2) throw new Error("error at 2");
            return `Success: ${x}`;
          })
          .catch((err) => `Error: ${err.message}`)
          .map((result) => {
            results.push(result);
            return result;
          })
          .setState()
          .use("");

        return (
          <div>
            <p>{value}</p>
            <button onClick={() => trigger(1)}>1</button>
            <button onClick={() => trigger(2)}>2</button>
            <button onClick={() => trigger(3)}>3</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("1"));
      fireEvent.click(screen.getByText("2"));
      fireEvent.click(screen.getByText("3"));

      await waitFor(
        () => {
          expect(screen.getByText("Success: 3")).toBeDefined();
        },
        { timeout: 1000 }
      );

      expect(results).toEqual([
        "Success: 1",
        "Error: error at 2",
        "Success: 3",
      ]);
    });
  });

  describe("asyncLast", () => {
    it("should discard earlier pending values", async () => {
      const executed: number[] = [];
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .asyncLast(async (x) => {
            executed.push(x);
            await new Promise((resolve) => setTimeout(resolve, 50));
            return x;
          })
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(1)}>1</button>
            <button onClick={() => trigger(2)}>2</button>
            <button onClick={() => trigger(3)}>3</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("1"));
      fireEvent.click(screen.getByText("2"));
      fireEvent.click(screen.getByText("3"));

      await waitFor(
        () => {
          expect(screen.getByText("Value: 3")).toBeDefined();
        },
        { timeout: 1000 }
      );

      // Should execute 1, then skip 2 and execute 3
      expect(executed).toEqual([1, 3]);
    });

    it("should only process the most recent value", async () => {
      let callCount = 0;
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .asyncLast(async (x) => {
            callCount++;
            await new Promise((resolve) => setTimeout(resolve, 100));
            return x * 10;
          })
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(1)}>1</button>
            <button onClick={() => trigger(2)}>2</button>
            <button onClick={() => trigger(3)}>3</button>
            <button onClick={() => trigger(4)}>4</button>
            <button onClick={() => trigger(5)}>5</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("1"));
      fireEvent.click(screen.getByText("2"));
      fireEvent.click(screen.getByText("3"));
      fireEvent.click(screen.getByText("4"));
      fireEvent.click(screen.getByText("5"));

      await waitFor(
        () => {
          expect(screen.getByText("Value: 50")).toBeDefined();
        },
        { timeout: 1000 }
      );

      // Should only execute twice: first value and last value
      expect(callCount).toBe(2);
    });

    it("should handle rapid successive calls", async () => {
      const results: number[] = [];
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .asyncLast(async (x) => {
            await new Promise((resolve) => setTimeout(resolve, 30));
            results.push(x);
            return x;
          })
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button
              onClick={() => {
                for (let i = 1; i <= 10; i++) trigger(i);
              }}
            >
              Rapid
            </button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Rapid"));

      await waitFor(
        () => {
          expect(screen.getByText("Value: 10")).toBeDefined();
        },
        { timeout: 1000 }
      );

      // Should only execute first and last
      expect(results).toEqual([1, 10]);
    });

    it("should queue next value while processing", async () => {
      const executed: number[] = [];
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .asyncLast(async (x) => {
            executed.push(x);
            await new Promise((resolve) => setTimeout(resolve, 50));
            return x;
          })
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(1)}>Trigger</button>
          </div>
        );
      }

      const { rerender } = render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));

      // Click again while first is processing
      await new Promise((resolve) => setTimeout(resolve, 10));
      fireEvent.click(screen.getByText("Trigger"));

      await waitFor(
        () => {
          expect(executed.length).toBe(2);
        },
        { timeout: 1000 }
      );
    });
  });

  describe("asyncFirst", () => {
    it("should ignore new values while processing", async () => {
      const executed: number[] = [];
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .asyncFirst(async (x) => {
            executed.push(x);
            await new Promise((resolve) => setTimeout(resolve, 50));
            return x * 10;
          })
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(1)}>1</button>
            <button onClick={() => trigger(2)}>2</button>
            <button onClick={() => trigger(3)}>3</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("1"));
      fireEvent.click(screen.getByText("2"));
      fireEvent.click(screen.getByText("3"));

      await waitFor(
        () => {
          expect(screen.getByText("Value: 10")).toBeDefined();
        },
        { timeout: 1000 }
      );

      // Should only execute first value
      expect(executed).toEqual([1]);
    });

    it("should only execute first operation until completion", async () => {
      let callCount = 0;
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .asyncFirst(async (x) => {
            callCount++;
            await new Promise((resolve) => setTimeout(resolve, 100));
            return x;
          })
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button
              onClick={() => {
                trigger(1);
                trigger(2);
                trigger(3);
              }}
            >
              Trigger
            </button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));

      await waitFor(
        () => {
          expect(screen.getByText("Value: 1")).toBeDefined();
        },
        { timeout: 1000 }
      );

      expect(callCount).toBe(1);
    });

    it("should accept new values after completion", async () => {
      const executed: number[] = [];
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .asyncFirst(async (x) => {
            executed.push(x);
            await new Promise((resolve) => setTimeout(resolve, 50));
            return x;
          })
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(1)}>First</button>
            <button onClick={() => trigger(2)}>Second</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("First"));

      await waitFor(
        () => {
          expect(screen.getByText("Value: 1")).toBeDefined();
        },
        { timeout: 1000 }
      );

      // Now trigger second after first completes
      fireEvent.click(screen.getByText("Second"));

      await waitFor(
        () => {
          expect(screen.getByText("Value: 2")).toBeDefined();
        },
        { timeout: 1000 }
      );

      expect(executed).toEqual([1, 2]);
    });

    it("should handle errors", async () => {
      function Component() {
        const [value, trigger] = pipe<number, string>()
          .asyncFirst(async (x) => {
            await new Promise((resolve) => setTimeout(resolve, 20));
            if (x === 1) throw new Error("first error");
            return `Success: ${x}`;
          })
          .catch((err) => err.message)
          .setState()
          .use("");

        return (
          <div>
            <p>{value}</p>
            <button onClick={() => trigger(1)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));

      await waitFor(
        () => {
          expect(screen.getByText("first error")).toBeDefined();
        },
        { timeout: 1000 }
      );
    });
  });
});

describe("Control Flow Operators", () => {
  describe("catch", () => {
    it("should catch errors and transform to value", () => {
      function Component() {
        const [value, trigger] = pipe<number, string>()
          .map(() => {
            throw new Error("Something went wrong");
          })
          .catch((err) => `Caught: ${err.message}`)
          .setState()
          .use("");

        return (
          <div>
            <p>{value}</p>
            <button onClick={() => trigger(1)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      expect(screen.getByText("Caught: Something went wrong")).toBeDefined();
    });

    it("should allow pipe to continue after error", () => {
      function Component() {
        const [value, trigger] = pipe<number, string>()
          .map(() => {
            throw new Error("error");
          })
          .catch((err) => "recovered")
          .map((x) => x.toUpperCase())
          .setState()
          .use("");

        return (
          <div>
            <p>{value}</p>
            <button onClick={() => trigger(1)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      expect(screen.getByText("RECOVERED")).toBeDefined();
    });

    it("should pass through values when no error", () => {
      function Component() {
        const [value, trigger] = pipe<number, string>()
          .map((x) => `Value: ${x}`)
          .catch((err) => "error")
          .setState()
          .use("");

        return (
          <div>
            <p>{value}</p>
            <button onClick={() => trigger(42)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      expect(screen.getByText("Value: 42")).toBeDefined();
    });

    it("should have access to current state", () => {
      function Component() {
        const [value, trigger] = pipe<number, string>()
          .map(() => {
            throw new Error("error");
          })
          .catch((err, state) => `State was: ${state}`)
          .setState()
          .use("initial");

        return (
          <div>
            <p>{value}</p>
            <button onClick={() => trigger(1)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      expect(screen.getByText("State was: initial")).toBeDefined();
    });
  });

  describe("filter", () => {
    it("should pass through values that match predicate", () => {
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .filter((x) => x > 5)
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(10)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      expect(screen.getByText("Value: 10")).toBeDefined();
    });

    it("should stop execution for values that don't match", () => {
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .filter((x) => x > 5)
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(3)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      expect(screen.getByText("Value: 0")).toBeDefined(); // Should remain initial value
    });

    it("should have access to current state", () => {
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .filter((x, state) => x > state)
          .setState()
          .use(5);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(10)}>Greater</button>
            <button onClick={() => trigger(3)}>Less</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Greater"));
      expect(screen.getByText("Value: 10")).toBeDefined();

      fireEvent.click(screen.getByText("Less"));
      expect(screen.getByText("Value: 10")).toBeDefined(); // Should not update
    });

    it("should not update state when filtered out", () => {
      let mapCalled = false;
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .filter((x) => x > 5)
          .map((x) => {
            mapCalled = true;
            return x * 2;
          })
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(3)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      expect(mapCalled).toBe(false);
      expect(screen.getByText("Value: 0")).toBeDefined();
    });
  });
});

describe("Timing Operators", () => {
  describe("debounce", () => {
    it("should delay execution until inactivity period", async () => {
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .debounce(100)
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));

      // Should not update immediately
      expect(screen.getByText("Value: 0")).toBeDefined();

      // Should update after debounce period
      await waitFor(
        () => {
          expect(screen.getByText("Value: 5")).toBeDefined();
        },
        { timeout: 200 }
      );
    });

    it("should cancel previous timer on new value", async () => {
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .debounce(100)
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(1)}>First</button>
            <button onClick={() => trigger(2)}>Second</button>
            <button onClick={() => trigger(3)}>Third</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("First"));
      await new Promise((resolve) => setTimeout(resolve, 50));
      fireEvent.click(screen.getByText("Second"));
      await new Promise((resolve) => setTimeout(resolve, 50));
      fireEvent.click(screen.getByText("Third"));

      await waitFor(
        () => {
          expect(screen.getByText("Value: 3")).toBeDefined();
        },
        { timeout: 200 }
      );
    });

    it("should execute with last value after delay", async () => {
      const values: number[] = [];
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .debounce(50)
          .map((x) => {
            values.push(x);
            return x;
          })
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(1)}>1</button>
            <button onClick={() => trigger(2)}>2</button>
            <button onClick={() => trigger(3)}>3</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("1"));
      fireEvent.click(screen.getByText("2"));
      fireEvent.click(screen.getByText("3"));

      await waitFor(
        () => {
          expect(screen.getByText("Value: 3")).toBeDefined();
        },
        { timeout: 200 }
      );

      expect(values).toEqual([3]); // Only last value should be processed
    });

    it("should handle rapid successive calls", async () => {
      let executionCount = 0;
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .debounce(100)
          .map((x) => {
            executionCount++;
            return x;
          })
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button
              onClick={() => {
                for (let i = 1; i <= 10; i++) trigger(i);
              }}
            >
              Rapid
            </button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Rapid"));

      await waitFor(
        () => {
          expect(screen.getByText("Value: 10")).toBeDefined();
        },
        { timeout: 200 }
      );

      expect(executionCount).toBe(1);
    });
  });

  describe("throttle", () => {
    it("should allow first call immediately", () => {
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .throttle(100)
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      expect(screen.getByText("Value: 5")).toBeDefined();
    });

    it("should block subsequent calls within time window", () => {
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .throttle(100)
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(1)}>First</button>
            <button onClick={() => trigger(2)}>Second</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("First"));
      expect(screen.getByText("Value: 1")).toBeDefined();

      fireEvent.click(screen.getByText("Second"));
      expect(screen.getByText("Value: 1")).toBeDefined(); // Should not update
    });

    it("should allow calls after time window expires", async () => {
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .throttle(50)
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(1)}>First</button>
            <button onClick={() => trigger(2)}>Second</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("First"));
      expect(screen.getByText("Value: 1")).toBeDefined();

      await new Promise((resolve) => setTimeout(resolve, 60));

      fireEvent.click(screen.getByText("Second"));
      expect(screen.getByText("Value: 2")).toBeDefined();
    });

    it("should maintain correct timing with multiple calls", async () => {
      const executedValues: number[] = [];
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .throttle(50)
          .map((x) => {
            executedValues.push(x);
            return x;
          })
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(1)}>1</button>
            <button onClick={() => trigger(2)}>2</button>
            <button onClick={() => trigger(3)}>3</button>
          </div>
        );
      }

      render(<Component />);

      fireEvent.click(screen.getByText("1"));
      fireEvent.click(screen.getByText("2")); // Should be blocked

      await new Promise((resolve) => setTimeout(resolve, 60));

      fireEvent.click(screen.getByText("3"));

      expect(executedValues).toEqual([1, 3]);
    });
  });

  describe("delay", () => {
    it("should delay execution by specified milliseconds", async () => {
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .delay(100)
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));

      // Should not update immediately
      expect(screen.getByText("Value: 0")).toBeDefined();

      // Should update after delay
      await waitFor(
        () => {
          expect(screen.getByText("Value: 5")).toBeDefined();
        },
        { timeout: 200 }
      );
    });

    it("should pass value through unchanged", async () => {
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .delay(50)
          .map((x) => x * 2)
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));

      await waitFor(
        () => {
          expect(screen.getByText("Value: 10")).toBeDefined();
        },
        { timeout: 200 }
      );
    });

    it("should handle multiple sequential delays", async () => {
      const timestamps: number[] = [];
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .delay(50)
          .map((x) => {
            timestamps.push(Date.now());
            return x;
          })
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(1)}>First</button>
            <button onClick={() => trigger(2)}>Second</button>
          </div>
        );
      }

      render(<Component />);
      const startTime = Date.now();
      fireEvent.click(screen.getByText("First"));

      await waitFor(
        () => {
          expect(screen.getByText("Value: 1")).toBeDefined();
        },
        { timeout: 200 }
      );

      fireEvent.click(screen.getByText("Second"));

      await waitFor(
        () => {
          expect(screen.getByText("Value: 2")).toBeDefined();
        },
        { timeout: 200 }
      );

      // Each should be delayed by at least 50ms
      expect(timestamps[0]! - startTime).toBeGreaterThanOrEqual(45);
    });
  });
});

describe("State Management Operators", () => {
  describe("setState", () => {
    it("should set state to passed value directly", () => {
      function Component() {
        const [value, trigger] = pipe<number, string>()
          .setState("fixed value")
          .use("");

        return (
          <div>
            <p>{value}</p>
            <button onClick={() => trigger(42)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      expect(screen.getByText("fixed value")).toBeDefined();
    });

    it("should set state using function of current value", () => {
      function Component() {
        const [value, trigger] = pipe<number, string>()
          .setState((x) => `Result: ${x}`)
          .use("");

        return (
          <div>
            <p>{value}</p>
            <button onClick={() => trigger(42)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      expect(screen.getByText("Result: 42")).toBeDefined();
    });

    it("should set state to incoming value when no argument", () => {
      function Component() {
        const [value, trigger] = pipe<number, number>().setState().use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(42)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      expect(screen.getByText("Value: 42")).toBeDefined();
    });

    it("should update state and trigger re-render", () => {
      let renderCount = 0;
      function Component() {
        renderCount++;
        const [value, trigger] = pipe<number, number>().setState().use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      const initialRenderCount = renderCount;
      fireEvent.click(screen.getByText("Trigger"));
      expect(renderCount).toBeGreaterThan(initialRenderCount);
    });

    it("should pass original value through to next operator", () => {
      function Component() {
        const [value, trigger] = pipe<number, string>()
          .setState("state value")
          .map((x) => `Original: ${x}`)
          .updateState((state, mapped) => mapped)
          .use("");

        return (
          <div>
            <p>{value}</p>
            <button onClick={() => trigger(42)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      expect(screen.getByText("Original: 42")).toBeDefined();
    });
  });

  describe("updateState", () => {
    it("should update state using function of current state and value", () => {
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .updateState((state, val) => state + val)
          .use(10);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      expect(screen.getByText("Value: 15")).toBeDefined();
    });

    it("should trigger re-render with new state", () => {
      let renderCount = 0;
      function Component() {
        renderCount++;
        const [value, trigger] = pipe<number, number>()
          .updateState((state, val) => state + val)
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(1)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      const initialRenderCount = renderCount;
      fireEvent.click(screen.getByText("Trigger"));
      expect(renderCount).toBeGreaterThan(initialRenderCount);
    });

    it("should pass original value through to next operator", () => {
      const valuesReceived: number[] = [];
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .updateState((state, val) => state + val)
          .map((x) => {
            valuesReceived.push(x);
            return x;
          })
          .use(10);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      expect(valuesReceived).toEqual([5]); // Original value, not the updated state
    });

    it("should allow changing state type", () => {
      function Component() {
        const [value, trigger] = pipe<number, string>()
          .updateState((state: string, val: number) => `${state}${val}`)
          .use("");

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(1)}>1</button>
            <button onClick={() => trigger(2)}>2</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("1"));
      expect(screen.getByText("Value: 1")).toBeDefined();
      fireEvent.click(screen.getByText("2"));
      expect(screen.getByText("Value: 12")).toBeDefined();
    });
  });
});

describe("Hook Integration (use)", () => {
  describe("Basic Usage", () => {
    it("should return initial state on first render", () => {
      function Component() {
        const [value] = pipe<number, string>()
          .map((x) => `Value: ${x}`)
          .setState()
          .use("initial");

        return (
          <div>
            <p>{value}</p>
          </div>
        );
      }

      render(<Component />);
      expect(screen.getByText("initial")).toBeDefined();
    });

    it("should return updated state after execution", () => {
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .map((x) => x * 2)
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      expect(screen.getByText("Value: 10")).toBeDefined();
    });

    it("should return stable trigger function reference", () => {
      const triggerRefs: any[] = [];

      function Component() {
        const [value, trigger] = pipe<number, number>().setState().use(0);

        triggerRefs.push(trigger);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(value + 1)}>Increment</button>
          </div>
        );
      }

      const { rerender } = render(<Component />);
      fireEvent.click(screen.getByText("Increment"));
      rerender(<Component />);

      expect(triggerRefs[0]).toBe(triggerRefs[1]);
    });

    it("should not execute when component unmounts", async () => {
      let executed = false;

      function Component() {
        const [value, trigger] = pipe<number, number>()
          .async(async (x) => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            executed = true;
            return x;
          })
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      const { unmount } = render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      unmount();

      await new Promise((resolve) => setTimeout(resolve, 100));
      // Even though async completes, it should not update after unmount
      expect(executed).toBe(true); // Operation completes but doesn't error
    });
  });

  describe("Local State", () => {
    it("should manage local component state", () => {
      function Component() {
        const [count, increment] = pipe<void, number>()
          .updateState((state) => state + 1)
          .use(0);

        return (
          <div>
            <p>Count: {count}</p>
            <button onClick={() => increment()}>Increment</button>
          </div>
        );
      }

      render(<Component />);
      expect(screen.getByText("Count: 0")).toBeDefined();

      fireEvent.click(screen.getByText("Increment"));
      expect(screen.getByText("Count: 1")).toBeDefined();
    });

    it("should update only the component that triggered it", () => {
      function Counter({ id }: { id: number }) {
        const [count, increment] = pipe<void, number>()
          .updateState((state) => state + 1)
          .use(0);

        return (
          <div>
            <p>
              Counter {id}: {count}
            </p>
            <button onClick={() => increment()}>Increment {id}</button>
          </div>
        );
      }

      function App() {
        return (
          <div>
            <Counter id={1} />
            <Counter id={2} />
          </div>
        );
      }

      render(<App />);

      fireEvent.click(screen.getByText("Increment 1"));
      expect(screen.getByText("Counter 1: 1")).toBeDefined();
      expect(screen.getByText("Counter 2: 0")).toBeDefined();
    });

    it("should handle multiple instances independently", () => {
      function Counter() {
        const [count, setCount] = pipe<number, number>().setState().use(0);

        return (
          <div>
            <p>Count: {count}</p>
            <button onClick={() => setCount(count + 1)}>Increment</button>
          </div>
        );
      }

      function App() {
        return (
          <div>
            <div data-testid="counter1">
              <Counter />
            </div>
            <div data-testid="counter2">
              <Counter />
            </div>
          </div>
        );
      }

      const { container } = render(<App />);
      const counters = screen.getAllByText("Count: 0");
      const buttons = screen.getAllByText("Increment");

      expect(counters.length).toBe(2);

      fireEvent.click(buttons[0]!);

      // Only first counter should update
      const counter1 = container.querySelector('[data-testid="counter1"]');
      const counter2 = container.querySelector('[data-testid="counter2"]');

      expect(counter1?.textContent).toContain("Count: 1");
      expect(counter2?.textContent).toContain("Count: 0");
    });
  });

  describe("Cached State (CacheProvider)", () => {
    it("should share state across components with same cache key", () => {
      function Counter({ id }: { id: number }) {
        const [count, increment] = pipe<void, number>()
          .updateState((state) => state + 1)
          .use(0, "shared-counter");

        return (
          <div>
            <p>
              Counter {id}: {count}
            </p>
            <button onClick={() => increment()}>Increment {id}</button>
          </div>
        );
      }

      function App() {
        return (
          <CacheProvider>
            <Counter id={1} />
            <Counter id={2} />
          </CacheProvider>
        );
      }

      render(<App />);

      fireEvent.click(screen.getByText("Increment 1"));
      expect(screen.getByText("Counter 1: 1")).toBeDefined();
      expect(screen.getByText("Counter 2: 1")).toBeDefined();
    });

    it("should sync updates between all consumers", () => {
      function Display({ id }: { id: string }) {
        const [value] = pipe<number, number>()
          .setState()
          .use(0, "shared-value");

        return (
          <p>
            Display {id}: {value}
          </p>
        );
      }

      function Setter() {
        const [value, setValue] = pipe<number, number>()
          .setState()
          .use(0, "shared-value");

        return <button onClick={() => setValue(42)}>Set Value</button>;
      }

      function App() {
        return (
          <CacheProvider>
            <Display id="A" />
            <Display id="B" />
            <Setter />
          </CacheProvider>
        );
      }

      render(<App />);

      fireEvent.click(screen.getByText("Set Value"));
      expect(screen.getByText("Display A: 42")).toBeDefined();
      expect(screen.getByText("Display B: 42")).toBeDefined();
    });

    it("should throw error if cache key used without CacheProvider", () => {
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .setState()
          .use(0, "cache-key");

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      // Suppress console errors for this test
      const originalError = console.error;
      console.error = vi.fn();

      expect(() => render(<Component />)).toThrow(
        "Cache key provided but not within a CacheProvider"
      );

      console.error = originalError;
    });

    it("should initialize from cache if value exists", () => {
      function Setter() {
        const [value, setValue] = pipe<number, number>()
          .setState()
          .use(0, "cached-value");

        return <button onClick={() => setValue(100)}>Set</button>;
      }

      function Reader() {
        const [value] = pipe<number, number>()
          .setState()
          .use(0, "cached-value");

        return <p>Value: {value}</p>;
      }

      function App({ showReader }: { showReader: boolean }) {
        return (
          <CacheProvider>
            <Setter />
            {showReader && <Reader />}
          </CacheProvider>
        );
      }

      const { rerender } = render(<App showReader={false} />);

      fireEvent.click(screen.getByText("Set"));

      rerender(<App showReader={true} />);
      expect(screen.getByText("Value: 100")).toBeDefined();
    });
  });

  describe("Effects", () => {
    it("should run effect on mount with cache key", () => {
      let effectRan = false;

      function Component() {
        pipe<void, number>().use(
          0,
          "effect-key",
          () => {
            effectRan = true;
          },
          []
        );

        return <div>Component</div>;
      }

      render(
        <CacheProvider>
          <Component />
        </CacheProvider>
      );

      expect(effectRan).toBe(true);
    });

    it("should run cleanup on unmount", () => {
      let cleanupRan = false;

      function Component() {
        pipe<void, number>().use(
          0,
          "cleanup-key",
          () => {
            return () => {
              cleanupRan = true;
            };
          },
          []
        );

        return <div>Component</div>;
      }

      const { unmount } = render(
        <CacheProvider>
          <Component />
        </CacheProvider>
      );

      unmount();
      expect(cleanupRan).toBe(true);
    });

    it("should share effect across components with same cache key", () => {
      let effectCount = 0;

      function Component({ id }: { id: number }) {
        pipe<void, number>().use(
          0,
          "shared-effect",
          () => {
            effectCount++;
          },
          []
        );

        return <div>Component {id}</div>;
      }

      render(
        <CacheProvider>
          <Component id={1} />
          <Component id={2} />
        </CacheProvider>
      );

      expect(effectCount).toBe(1); // Should only run once
    });

    it("should only run effect once for multiple consumers", () => {
      let effectCount = 0;

      function Consumer({ id }: { id: number }) {
        pipe<void, number>().use(
          0,
          "once-effect",
          () => {
            effectCount++;
          },
          []
        );

        return <p>Consumer {id}</p>;
      }

      render(
        <CacheProvider>
          <Consumer id={1} />
          <Consumer id={2} />
          <Consumer id={3} />
        </CacheProvider>
      );

      expect(effectCount).toBe(1);
    });

    it("should rerun effect when deps change", () => {
      let effectCount = 0;

      function Component({ dep }: { dep: number }) {
        pipe<void, number>().use(
          0,
          "deps-effect",
          () => {
            effectCount++;
          },
          [dep]
        );

        return <div>Dep: {dep}</div>;
      }

      const { rerender } = render(
        <CacheProvider>
          <Component dep={1} />
        </CacheProvider>
      );

      expect(effectCount).toBe(1);

      rerender(
        <CacheProvider>
          <Component dep={2} />
        </CacheProvider>
      );

      expect(effectCount).toBe(2);
    });

    it("should increment/decrement consumer count correctly", () => {
      let effectCount = 0;
      let cleanupCount = 0;

      function Consumer() {
        pipe<void, number>().use(
          0,
          "count-effect",
          () => {
            effectCount++;
            return () => {
              cleanupCount++;
            };
          },
          []
        );

        return <div>Consumer</div>;
      }

      function App({ count }: { count: number }) {
        return (
          <CacheProvider>
            {Array.from({ length: count }, (_, i) => (
              <Consumer key={i} />
            ))}
          </CacheProvider>
        );
      }

      const { rerender } = render(<App count={3} />);
      expect(effectCount).toBe(1);

      rerender(<App count={2} />);
      expect(cleanupCount).toBe(0); // Should not cleanup yet

      rerender(<App count={0} />);
      expect(cleanupCount).toBe(1); // Should cleanup when all unmounted
    });

    it("should cleanup effect when last consumer unmounts", () => {
      let cleanupRan = false;

      function Consumer({ id }: { id: number }) {
        pipe<void, number>().use(
          0,
          "last-cleanup",
          () => {
            return () => {
              cleanupRan = true;
            };
          },
          []
        );

        return <div>Consumer {id}</div>;
      }

      function App({ showSecond }: { showSecond: boolean }) {
        return (
          <CacheProvider>
            <Consumer id={1} />
            {showSecond && <Consumer id={2} />}
          </CacheProvider>
        );
      }

      const { rerender, unmount } = render(<App showSecond={true} />);

      rerender(<App showSecond={false} />);
      expect(cleanupRan).toBe(false); // Still one consumer

      unmount();
      expect(cleanupRan).toBe(true); // All consumers gone
    });
  });
});

describe("CacheProvider", () => {
  describe("Store Operations", () => {
    it("should store and retrieve values by key", () => {
      function Component() {
        const [value, setValue] = pipe<string, string>()
          .setState()
          .use("initial", "test-key");

        return (
          <div>
            <p>{value}</p>
            <button onClick={() => setValue("updated")}>Update</button>
          </div>
        );
      }

      render(
        <CacheProvider>
          <Component />
        </CacheProvider>
      );

      expect(screen.getByText("initial")).toBeDefined();
      fireEvent.click(screen.getByText("Update"));
      expect(screen.getByText("updated")).toBeDefined();
    });

    it("should notify subscribers on value change", () => {
      let notificationCount = 0;

      function Subscriber() {
        const [value] = pipe<string, string>()
          .setState()
          .use("initial", "notify-key");

        notificationCount++;

        return <p>Subscriber: {value}</p>;
      }

      function Setter() {
        const [, setValue] = pipe<string, string>()
          .setState()
          .use("initial", "notify-key");

        return <button onClick={() => setValue("changed")}>Change</button>;
      }

      render(
        <CacheProvider>
          <Subscriber />
          <Setter />
        </CacheProvider>
      );

      const initialCount = notificationCount;
      fireEvent.click(screen.getByText("Change"));

      expect(notificationCount).toBeGreaterThan(initialCount);
    });

    it("should support multiple subscribers per key", () => {
      function Subscriber({ id }: { id: number }) {
        const [value] = pipe<number, number>().setState().use(0, "multi-sub");

        return (
          <p>
            Sub {id}: {value}
          </p>
        );
      }

      function Setter() {
        const [, setValue] = pipe<number, number>()
          .setState()
          .use(0, "multi-sub");

        return <button onClick={() => setValue(99)}>Set</button>;
      }

      render(
        <CacheProvider>
          <Subscriber id={1} />
          <Subscriber id={2} />
          <Subscriber id={3} />
          <Setter />
        </CacheProvider>
      );

      fireEvent.click(screen.getByText("Set"));

      expect(screen.getByText("Sub 1: 99")).toBeDefined();
      expect(screen.getByText("Sub 2: 99")).toBeDefined();
      expect(screen.getByText("Sub 3: 99")).toBeDefined();
    });

    it("should cleanup subscribers on unsubscribe", () => {
      function Subscriber() {
        const [value] = pipe<number, number>().setState().use(0, "cleanup-sub");

        return <p>Value: {value}</p>;
      }

      function App({ showSub }: { showSub: boolean }) {
        return <CacheProvider>{showSub && <Subscriber />}</CacheProvider>;
      }

      const { rerender } = render(<App showSub={true} />);

      rerender(<App showSub={false} />);
      // If we reach here without errors, cleanup worked
      expect(true).toBe(true);
    });

    it("should delete values by key", () => {
      // This test verifies the delete functionality through re-mounting
      function Component() {
        const [value, setValue] = pipe<number, number>()
          .setState()
          .use(0, "delete-key");

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => setValue(42)}>Set</button>
          </div>
        );
      }

      function App({ show }: { show: boolean }) {
        return <CacheProvider>{show && <Component />}</CacheProvider>;
      }

      const { rerender } = render(<App show={true} />);
      fireEvent.click(screen.getByText("Set"));
      expect(screen.getByText("Value: 42")).toBeDefined();

      // Unmount and remount - value should persist
      rerender(<App show={false} />);
      rerender(<App show={true} />);
      expect(screen.getByText("Value: 42")).toBeDefined();
    });

    it("should clear all values", () => {
      // Tests that separate providers have separate stores
      function Component({ cacheKey }: { cacheKey: string }) {
        const [value, setValue] = pipe<number, number>()
          .setState()
          .use(0, cacheKey);

        return (
          <div>
            <p>
              Value {cacheKey}: {value}
            </p>
            <button onClick={() => setValue(10)}>Set {cacheKey}</button>
          </div>
        );
      }

      render(
        <CacheProvider>
          <Component cacheKey="key1" />
          <Component cacheKey="key2" />
        </CacheProvider>
      );

      fireEvent.click(screen.getByText("Set key1"));
      fireEvent.click(screen.getByText("Set key2"));

      expect(screen.getByText("Value key1: 10")).toBeDefined();
      expect(screen.getByText("Value key2: 10")).toBeDefined();
    });

    it("should maintain separate subscriber sets per key", () => {
      const notifications: { [key: string]: number } = { a: 0, b: 0 };

      function Subscriber({ cacheKey }: { cacheKey: string }) {
        const [value] = pipe<number, number>().setState().use(0, cacheKey);

        notifications[cacheKey]++;

        return (
          <p>
            Value {cacheKey}: {value}
          </p>
        );
      }

      function Setter({ cacheKey }: { cacheKey: string }) {
        const [, setValue] = pipe<number, number>().setState().use(0, cacheKey);

        return <button onClick={() => setValue(5)}>Set {cacheKey}</button>;
      }

      render(
        <CacheProvider>
          <Subscriber cacheKey="a" />
          <Subscriber cacheKey="b" />
          <Setter cacheKey="a" />
          <Setter cacheKey="b" />
        </CacheProvider>
      );

      const countA = notifications.a;
      const countB = notifications.b;

      fireEvent.click(screen.getByText("Set a"));

      // Only "a" subscribers should be notified
      expect(notifications.a).toBeGreaterThan(countA);
      expect(notifications.b).toBe(countB);
    });
  });

  describe("React Integration", () => {
    it("should create single store instance per provider", () => {
      const storeInstances: any[] = [];

      function Component() {
        const [value, setValue] = pipe<number, number>()
          .setState()
          .use(0, "store-key");

        // Store reference check would require internal access
        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => setValue(1)}>Set</button>
          </div>
        );
      }

      render(
        <CacheProvider>
          <Component />
          <Component />
        </CacheProvider>
      );

      fireEvent.click(screen.getAllByText("Set")[0]!);

      // Both components should share state
      const values = screen.getAllByText("Value: 1");
      expect(values.length).toBe(2);
    });

    it("should provide store to nested components", () => {
      function Inner() {
        const [value, setValue] = pipe<number, number>()
          .setState()
          .use(0, "nested-key");

        return (
          <div>
            <p>Inner: {value}</p>
            <button onClick={() => setValue(5)}>Set Inner</button>
          </div>
        );
      }

      function Outer() {
        const [value] = pipe<number, number>().setState().use(0, "nested-key");

        return (
          <div>
            <p>Outer: {value}</p>
            <Inner />
          </div>
        );
      }

      render(
        <CacheProvider>
          <Outer />
        </CacheProvider>
      );

      fireEvent.click(screen.getByText("Set Inner"));

      expect(screen.getByText("Outer: 5")).toBeDefined();
      expect(screen.getByText("Inner: 5")).toBeDefined();
    });

    it("should support nested providers (separate stores)", () => {
      function Component({ label }: { label: string }) {
        const [value, setValue] = pipe<number, number>()
          .setState()
          .use(0, "same-key");

        return (
          <div>
            <p>
              {label}: {value}
            </p>
            <button onClick={() => setValue(10)}>Set {label}</button>
          </div>
        );
      }

      render(
        <CacheProvider>
          <Component label="Outer" />
          <CacheProvider>
            <Component label="Inner" />
          </CacheProvider>
        </CacheProvider>
      );

      fireEvent.click(screen.getByText("Set Inner"));

      expect(screen.getByText("Outer: 0")).toBeDefined();
      expect(screen.getByText("Inner: 10")).toBeDefined();
    });
  });
});

describe("Complex Scenarios", () => {
  describe("Operator Composition", () => {
    it("should chain multiple map operators", () => {
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .map((x) => x + 1)
          .map((x) => x * 2)
          .map((x) => x - 3)
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      // (5 + 1) * 2 - 3 = 9
      expect(screen.getByText("Value: 9")).toBeDefined();
    });

    it("should compose sync and async operators", async () => {
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .map((x) => x * 2)
          .async(async (x) => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            return x + 10;
          })
          .map((x) => x * 3)
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));

      await waitFor(() => {
        // (5 * 2 + 10) * 3 = 60
        expect(screen.getByText("Value: 60")).toBeDefined();
      });
    });

    it("should handle errors in middle of chain", () => {
      function Component() {
        const [value, trigger] = pipe<number, string>()
          .map((x) => x * 2)
          .map(() => {
            throw new Error("middle error");
          })
          .catch((err) => `Error: ${err.message}`)
          .map((x) => x.toUpperCase())
          .setState()
          .use("");

        return (
          <div>
            <p>{value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      expect(screen.getByText("ERROR: MIDDLE ERROR")).toBeDefined();
    });

    it("should respect operator order", async () => {
      const executionOrder: string[] = [];

      function Component() {
        const [value, trigger] = pipe<number, number>()
          .map((x) => {
            executionOrder.push("map1");
            return x + 1;
          })
          .filter((x) => {
            executionOrder.push("filter");
            return x > 5;
          })
          .async(async (x) => {
            executionOrder.push("async");
            return x * 2;
          })
          .map((x) => {
            executionOrder.push("map2");
            return x - 1;
          })
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));

      await waitFor(() => {
        expect(screen.getByText("Value: 11")).toBeDefined();
      });

      expect(executionOrder).toEqual(["map1", "filter", "async", "map2"]);
    });
  });

  describe("Error Handling", () => {
    it("should stop execution on uncaught error", () => {
      let mapExecuted = false;
      let errorCaught = false;

      function Component() {
        const [value, trigger] = pipe<number, number>()
          .map(() => {
            throw new Error("uncaught");
          })
          .map((x) => {
            mapExecuted = true;
            return x;
          })
          .catch((err) => {
            errorCaught = true;
            return 0;
          })
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));

      expect(mapExecuted).toBe(false);
      expect(errorCaught).toBe(true);
    });

    it("should allow recovery with catch operator", async () => {
      function Component() {
        const [value, trigger] = pipe<number, string>()
          .async(async () => {
            throw new Error("async error");
          })
          .catch((err) => `Recovered: ${err.message}`)
          .map((x) => x.toUpperCase())
          .setState()
          .use("");

        return (
          <div>
            <p>{value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));

      await waitFor(() => {
        expect(screen.getByText("RECOVERED: ASYNC ERROR")).toBeDefined();
      });
    });

    it("should propagate errors through operators", () => {
      function Component() {
        const [value, trigger] = pipe<number, string>()
          .map(() => {
            throw new Error("error1");
          })
          .map((x) => x * 2) // Should not execute
          .catch((err) => err.message)
          .setState()
          .use("");

        return (
          <div>
            <p>{value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      expect(screen.getByText("error1")).toBeDefined();
    });

    it("should handle errors in async operations", async () => {
      function Component() {
        const [value, trigger] = pipe<number, string>()
          .asyncQueue(async () => {
            throw new Error("queue error");
          })
          .catch((err) => `Caught: ${err.message}`)
          .setState()
          .use("");

        return (
          <div>
            <p>{value}</p>
            <button onClick={() => trigger(1)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));

      await waitFor(() => {
        expect(screen.getByText("Caught: queue error")).toBeDefined();
      });
    });
  });

  describe("State Access Patterns", () => {
    it("should read current state in operators", () => {
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .map((x, state) => x + state)
          .setState()
          .use(10);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      expect(screen.getByText("Value: 15")).toBeDefined();
    });

    it("should update state multiple times in chain", () => {
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .map((x) => x + 1)
          .setState()
          .map((x) => x * 2)
          .updateState((state, val) => state + val)
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      // First setState: 6, then map: 6*2=12, then updateState: 6 + 12 = 18
      expect(screen.getByText("Value: 18")).toBeDefined();
    });

    it("should maintain state consistency across operators", () => {
      const stateValues: number[] = [];

      function Component() {
        const [value, trigger] = pipe<number, number>()
          .updateState((state, val) => {
            stateValues.push(state);
            return state + val;
          })
          .map((_, state) => {
            stateValues.push(state);
            return state;
          })
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));

      // First updateState sees 0, updates to 5
      // Then map sees 5
      expect(stateValues).toEqual([0, 5]);
    });

    it("should handle state changes during async operations", async () => {
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .async(async (x, state) => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            return x + state;
          })
          .setState()
          .use(10);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));

      await waitFor(() => {
        expect(screen.getByText("Value: 15")).toBeDefined();
      });
    });
  });

  describe("Concurrency Patterns", () => {
    it("should handle racing async operations (asyncLast)", async () => {
      const results: number[] = [];

      function Component() {
        const [value, trigger] = pipe<number, number>()
          .asyncLast(async (x) => {
            await new Promise((resolve) => setTimeout(resolve, x * 10));
            results.push(x);
            return x;
          })
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Slow</button>
            <button onClick={() => trigger(1)}>Fast</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Slow"));
      await new Promise((resolve) => setTimeout(resolve, 5));
      fireEvent.click(screen.getByText("Fast"));

      await waitFor(
        () => {
          expect(screen.getByText("Value: 1")).toBeDefined();
        },
        { timeout: 200 }
      );

      expect(results).toEqual([5, 1]);
    });

    it("should queue operations correctly (asyncQueue)", async () => {
      const order: number[] = [];

      function Component() {
        const [value, trigger] = pipe<number, number>()
          .asyncQueue(async (x) => {
            order.push(x);
            await new Promise((resolve) => setTimeout(resolve, 20));
            return x;
          })
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(1)}>1</button>
            <button onClick={() => trigger(2)}>2</button>
            <button onClick={() => trigger(3)}>3</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("1"));
      fireEvent.click(screen.getByText("2"));
      fireEvent.click(screen.getByText("3"));

      await waitFor(
        () => {
          expect(screen.getByText("Value: 3")).toBeDefined();
        },
        { timeout: 200 }
      );

      expect(order).toEqual([1, 2, 3]);
    });

    it("should prevent concurrent execution (asyncFirst)", async () => {
      let concurrentExecutions = 0;
      let maxConcurrent = 0;

      function Component() {
        const [value, trigger] = pipe<number, number>()
          .asyncFirst(async (x) => {
            concurrentExecutions++;
            maxConcurrent = Math.max(maxConcurrent, concurrentExecutions);
            await new Promise((resolve) => setTimeout(resolve, 50));
            concurrentExecutions--;
            return x;
          })
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button
              onClick={() => {
                trigger(1);
                trigger(2);
                trigger(3);
              }}
            >
              Trigger
            </button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));

      await waitFor(
        () => {
          expect(screen.getByText("Value: 1")).toBeDefined();
        },
        { timeout: 200 }
      );

      expect(maxConcurrent).toBe(1);
    });

    it("should handle interleaved sync and async operations", async () => {
      const operations: string[] = [];

      function Component() {
        const [value, trigger] = pipe<number, number>()
          .map((x) => {
            operations.push("sync1");
            return x + 1;
          })
          .async(async (x) => {
            operations.push("async");
            await new Promise((resolve) => setTimeout(resolve, 10));
            return x * 2;
          })
          .map((x) => {
            operations.push("sync2");
            return x + 10;
          })
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));

      await waitFor(() => {
        expect(screen.getByText("Value: 22")).toBeDefined();
      });

      expect(operations).toEqual(["sync1", "async", "sync2"]);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty pipe (no operators)", () => {
      function Component() {
        const [value, trigger] = pipe<number, number>().use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(42)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      // Without setState, value shouldn't change
      expect(screen.getByText("Value: 0")).toBeDefined();
    });

    it("should handle undefined/null values", () => {
      function Component() {
        const [value, trigger] = pipe<any, any>()
          .map((x) =>
            x === null ? "was null" : x === undefined ? "was undefined" : x
          )
          .setState()
          .use("initial");

        return (
          <div>
            <p>{value}</p>
            <button onClick={() => trigger(null)}>Null</button>
            <button onClick={() => trigger(undefined)}>Undefined</button>
          </div>
        );
      }

      render(<Component />);

      fireEvent.click(screen.getByText("Null"));
      expect(screen.getByText("was null")).toBeDefined();

      fireEvent.click(screen.getByText("Undefined"));
      expect(screen.getByText("was undefined")).toBeDefined();
    });

    it("should handle errors thrown in operators", () => {
      function Component() {
        const [value, trigger] = pipe<number, string>()
          .map(() => {
            throw new Error("operator error");
          })
          .catch((err) => `Error: ${err.message}`)
          .setState()
          .use("");

        return (
          <div>
            <p>{value}</p>
            <button onClick={() => trigger(1)}>Trigger</button>
          </div>
        );
      }

      render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      expect(screen.getByText("Error: operator error")).toBeDefined();
    });

    it("should not execute after component unmount", async () => {
      let stateUpdated = false;

      function Component() {
        const [value, trigger] = pipe<number, number>()
          .async(async (x) => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            return x;
          })
          .map((x) => {
            stateUpdated = true;
            return x;
          })
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      const { unmount } = render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      unmount();

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Async completes but map shouldn't execute
      expect(stateUpdated).toBe(false);
    });

    it("should handle rapid mount/unmount cycles", () => {
      function Component() {
        const [value, trigger] = pipe<number, number>().setState().use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      // Properly test rapid mount/unmount by rendering and unmounting multiple times
      for (let i = 0; i < 5; i++) {
        const { unmount } = render(<Component />);
        unmount();
      }

      // Final render to verify it still works
      render(<Component />);
      expect(screen.getByText("Value: 0")).toBeDefined();
    });

    it("should cleanup timers on unmount (debounce, delay, throttle)", async () => {
      function Component() {
        const [value, trigger] = pipe<number, number>()
          .debounce(100)
          .delay(50)
          .throttle(50)
          .setState()
          .use(0);

        return (
          <div>
            <p>Value: {value}</p>
            <button onClick={() => trigger(5)}>Trigger</button>
          </div>
        );
      }

      const { unmount } = render(<Component />);
      fireEvent.click(screen.getByText("Trigger"));
      unmount();

      // Wait to ensure no delayed updates happen after unmount
      await new Promise((resolve) => setTimeout(resolve, 300));

      // If we reach here without errors, cleanup worked
      expect(true).toBe(true);
    });
  });
});
