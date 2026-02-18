/**
 * Options for the {@link State} decorator, specifying which state names to transition to
 * at the start, successful end, or error end of the decorated method.
 */
export interface StateOptions<S extends string = string> {
  // Add options as needed
  /** State name to transition to when the method is first invoked (outermost call only). */
  start?: S;
  /** State name to transition to when the method completes successfully (outermost call only). */
  end?: S;
  /** State name to transition to when the method throws or rejects (outermost call only). */
  error?: S;
}

/**
 * Runtime state information tracked for an object decorated with {@link State}.
 */
export interface StateStatus {
  /** The current state name. Starts as `"initial"`. */
  state: string;
  /** Timestamp (ms since epoch) of the last state transition. */
  lastTransition?: number;
  /** Ordered history of completed state transitions. */
  transitions: Array<{ step: string; duration: number; exception?: any; startTime: number; endTime: number }>;
  /**
   * Record a transition to `newState`, appending an entry to `transitions`.
   *
   * @param newState - The new state name.
   * @param exception - Optional error that caused the transition.
   */
  updateState(newState: string, exception?: any): void;
}

const States = new WeakMap<any, StateStatus>();

/**
 * Invoke `result()` and call `callback` after it completes — whether synchronously,
 * via Promise resolution, or due to a thrown error.
 *
 * @param result - Zero-argument function to invoke.
 * @param callback - Called with the error (if any) once `result` has settled.
 * @returns The return value of `result()` (sync value or Promise).
 */
function doAfter(result: Function, callback: (err?: any) => void) {
  try {
    result = result();
    if (result instanceof Promise) {
      let err = undefined;
      return result
        .catch(error => {
          err = error;
          throw error;
        })
        .finally(() => {
          callback(err);
        });
    } else {
      callback();
      return result;
    }
  } catch (error) {
    callback(error);
    throw error;
  }
}

const ACTIVE_COUNTER = Symbol("__stateActiveCounter");
const WRAPPED_FLAG = Symbol("__stateWrappedFlag");

/**
 * Method decorator that automatically tracks state transitions on the instance.
 *
 * On the outermost invocation of the decorated method, the state machine transitions:
 * - to `options.start` (if provided) when the method begins
 * - to `options.end` (if provided) when the method completes successfully
 * - to `options.error` (if provided) when the method throws or rejects
 *
 * Nested / recursive calls are counted and only the outermost call triggers transitions.
 *
 * @param options - Optional transition state names.
 */
export function State<E extends string = string>(options?: StateOptions<E>) {
  return (value: any, context: ClassMemberDecoratorContext) => {
    context.addInitializer(function (this: any) {
      // If already wrapped on this instance, do nothing
      const current = this[context.name];
      if (current && current[WRAPPED_FLAG]) {
        return;
      }
      // Capture the most-derived implementation at instantiation time (could be an override)
      const original = current ?? value;
      const wrapper = function (this: any, ...args: any[]) {
        // Root call detection (only outermost invocation performs start/end transitions)
        if (this[ACTIVE_COUNTER] === undefined) this[ACTIVE_COUNTER] = 0;
        const isRoot = this[ACTIVE_COUNTER] === 0;
        if (isRoot) {
          if (options?.start) {
            const stateMap = State.getStateStatus(this);
            stateMap.updateState(options.start);
          } else {
            State.getStateStatus(this); // ensure initialized
          }
        }
        this[ACTIVE_COUNTER]++;
        return doAfter(
          () => original.apply(this, args),
          err => {
            this[ACTIVE_COUNTER]--;
            if (isRoot) {
              if (err && options?.error) {
                const stateMap = State.getStateStatus(this);
                stateMap.updateState(options.error, err);
              } else if (options?.end) {
                const stateMap = State.getStateStatus(this);
                stateMap.updateState(options.end, err);
              }
            }
          }
        );
      };
      Object.defineProperty(wrapper, WRAPPED_FLAG, { value: true });
      // We should still allow monkey patching
      Object.defineProperty(this, context.name, { value: wrapper, configurable: true });
    });
  };
}

/**
 * Return the current state name for `target`, or `"initial"` if the state machine
 * has not yet been initialized.
 *
 * @param target - The object whose state to query.
 * @returns The current state name.
 */
State.getCurrentState = function (target: any): string {
  const stateMap = States.get(target);
  return stateMap?.state ?? "initial";
};

/**
 * Return (and lazily initialize) the {@link StateStatus} for `target`.
 *
 * @param target - The object whose state status to retrieve.
 * @returns The `StateStatus` object associated with `target`.
 */
State.getStateStatus = function (target: any): StateStatus {
  let stateMap = States.get(target);
  if (!stateMap) {
    stateMap = {
      state: "initial",
      lastTransition: Date.now(),
      transitions: [],
      updateState: (newState: string, exception?: any) => {
        const now = Date.now();
        stateMap.transitions.push({
          step: stateMap.state,
          duration: now - (stateMap.lastTransition ?? now),
          exception,
          endTime: now,
          startTime: stateMap.lastTransition ?? now
        });
        stateMap.state = newState;
        stateMap.lastTransition = now;
      }
    };
    States.set(target, stateMap);
  }
  return stateMap;
};
