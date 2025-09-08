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

export function State<E extends string = string>(options?: StateOptions<E>) {
  return (value: any, context: ClassMemberDecoratorContext) => {
    context.addInitializer(function (this: any) {
      // Ensure state map exists
      State.getStateStatus(this);
      // Wrap the original method
      Object.defineProperty(this, context.name, {
        value: (...args: any[]) => {
          if (options?.start) {
            let stateMap = State.getStateStatus(this);
            stateMap.updateState(options.start);
          }
          return doAfter(
            () => value.call(this, ...args),
            err => {
              if (err && options?.error) {
                let stateMap = State.getStateStatus(this);
                stateMap.updateState(options.error, err);
              } else if (options?.end) {
                let stateMap = State.getStateStatus(this);
                stateMap.updateState(options.end, err);
              }
            }
          );
        }
      });
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
