type FilterOutAttributes<T, U> = {
  [K in keyof T]: T[K] extends U ? never : K;
}[keyof T];

type SelfSerialized<T> = T extends bigint
  ? string
  : T extends Array<infer U>
    ? Array<Serialized<U>>
    : T extends Map<string, infer MV>
      ? Record<string, Serialized<MV>>
      : T extends Set<infer US>
        ? Array<Serialized<US>>
        : T extends RegExp
          ? string
          : T extends object
            ? {
                [K in Extract<FilterOutAttributes<T, Function>, string>]: T[K] extends bigint
                  ? string
                  : T[K] extends Array<infer U>
                    ? Array<Serialized<U>>
                    : T[K] extends Map<string, infer MV>
                      ? Record<string, Serialized<MV>>
                      : T[K] extends Set<infer US>
                        ? Array<Serialized<US>>
                        : T[K] extends RegExp
                          ? string
                          : T[K] extends object
                            ? Serialized<T[K]>
                            : T[K];
              }
            : T;

type Serialized<T> = T extends { toJSON: () => infer R } ? R : SelfSerialized<T>;

type SelfDtoIn<T> = T extends Date
  ? string | number | Date
  : T extends bigint
    ? string | number | bigint
    : T extends Array<infer U>
      ? Array<DtoIn<U>>
      : T extends Map<string, infer MV>
        ? Record<string, DtoIn<MV>>
        : T extends Set<infer US>
          ? Array<DtoIn<US>>
          : T extends RegExp
            ? string | RegExp
            : T extends object
              ? {
                  [K in Extract<FilterOutAttributes<T, Function>, string>]: T[K] extends Date
                    ? string | number | Date
                    : T[K] extends bigint
                      ? string | number | bigint
                      : T[K] extends Array<infer U>
                        ? Array<DtoIn<U>>
                        : T[K] extends Map<string, infer MV>
                          ? Record<string, DtoIn<MV>>
                          : T[K] extends Set<infer US>
                            ? Array<DtoIn<US>>
                            : T[K] extends RegExp
                              ? string | RegExp
                              : T[K] extends object
                                ? DtoIn<T[K]>
                                : T[K];
                }
              : T;
type DtoIn<T> = T extends { fromDto(value: infer D): void } ? D : SelfDtoIn<T>;

type SelfDtoOut<T> =
  T extends Array<infer U>
    ? Array<DtoOut<U>>
    : T extends Map<string, infer MV>
      ? Record<string, DtoOut<MV>>
      : T extends Set<infer US>
        ? Array<DtoOut<US>>
        : T extends object
          ? {
              [K in Extract<FilterOutAttributes<T, Function>, string>]: T[K] extends Date
                ? string
                : T[K] extends bigint
                  ? string
                  : T[K] extends Array<infer U>
                    ? Array<DtoOut<U>>
                    : T[K] extends Map<string, infer MV>
                      ? Record<string, DtoOut<MV>>
                      : T[K] extends Set<infer US>
                        ? Array<DtoOut<US>>
                        : T[K] extends RegExp
                          ? string
                          : T[K] extends object
                            ? DtoOut<T[K]>
                            : T[K];
            }
          : T;
type DtoOut<T> = T extends { toDto(): infer D } ? D : T extends { toJSON(): infer D } ? D : SelfDtoOut<T>;

class Acl {
  resource!: string;
  action!: string;
  allow!: boolean;
  user!: string;

  fromDto(data: { action: string; allow: boolean; email: string }) {}

  toDto() {
    return {
      action: this.action,
      allow: this.allow,
      email: this.user
    };
  }

  toJSON() {
    return {
      resource: this.resource,
      action: this.action,
      allow: this.allow,
      user: this.user
    };
  }
}

export class ModelA {
  private _mfa: string = "";
  date!: Date;
  data!: string;
  plop!: number;
  acls!: Acl[];
  acl: Acl | null = null;

  get accessorDate(): Date {
    return this.date;
  }

  set accessorDate(value: Date | string | number) {
    if (typeof value === "string" || typeof value === "number") {
      this.date = new Date(value);
    } else {
      this.date = value;
    }
  }

  get mfa(): boolean {
    return this._mfa !== "";
  }

  set mfa(value: string) {
    this._mfa = value;
  }

  toDto(): SelfDtoOut<this> {
    return {} as SelfDtoOut<this>;
  }

  fromDto(data: Omit<SelfDtoIn<this>, "mfa"> & { mfa: string }) {}

  async action(email: string, data: { info: string; test: string }): Promise<{ success: boolean; results: ModelA[] }> {
    return { success: true, results: [] };
  }

  toJSON(): SelfSerialized<this> {
    return {
      date: this.date.toISOString(),
      data: this.data,
      plop: this.plop
    } as SelfSerialized<this>;
  }
}

export class SubModelA extends ModelA {
  extra!: string;
  createdAt!: Date;
}

export class UndefinedModel {
  date!: Date;
  data!: string;
  plop!: number;
}

export class ModelB {
  plop!: string;
  count!: number;

  fromDto(data: { plopDTOIn: string; countDTOIn: string | number }): void {}

  toDto(): {
    plopDTO: string;
    countDTO: string;
  } {
    return {
      plopDTO: this.plop,
      countDTO: this.count.toString()
    };
  }

  toJSON(): {
    plopJSON: string;
    countJSON: Date;
  } {
    return {
      plopJSON: this.plop,
      countJSON: new Date(this.count)
    };
  }
}
