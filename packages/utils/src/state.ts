export interface StateOptions<S extends string = string> {
  // Add options as needed
  start?: S;
  end?: S;
}

export interface StateStatus {
    state: string,
    lastTransition?: number
    transitions: Array<{ step: string, duration: number }>
    updateState(newState: string): void
}

const States = new WeakMap<any, StateStatus>();

function doAfter(result: any, callback: () => void) {
    if (result instanceof Promise) {
        return result.finally(() => {
            callback();
        });
    } else {
        callback();
        return result;
    }
}

export function State<E extends string = string>(
  options?: StateOptions<E>
) {
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
            return doAfter(value.call(this, ...args), () => {
                if (options?.end) {
                    let stateMap = State.getStateStatus(this);
                    stateMap.updateState(options.end);
                }
            });
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
            updateState: (newState: string) => {
                const now = Date.now();
                stateMap.transitions.push({ step: stateMap.state, duration: now - (stateMap.lastTransition ?? now) });
                stateMap.state = newState;
                stateMap.lastTransition = now;
            }
        };
        States.set(target, stateMap);
    }
    return stateMap;
};

