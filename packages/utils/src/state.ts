export interface StateOptions<S extends string = string> {
  // Add options as needed
  start?: S;
  end?: S;
  error?: S;
}

export interface StateStatus {
  state: string;
  lastTransition?: number;
  transitions: Array<{ step: string; duration: number; exception?: any; startTime: number; endTime: number }>;
  updateState(newState: string, exception?: any): void;
}

const States = new WeakMap<any, StateStatus>();

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

State.getCurrentState = function (target: any): string {
  const stateMap = States.get(target);
  return stateMap?.state ?? "initial";
};

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
