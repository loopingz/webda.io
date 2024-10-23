class CoreModel {
  customProp: string;
  constructor() {}

  unserialize(data: any): any {}
}

class Plop {
  test: boolean;
  constructor(data: any) {}
}

type Bouzouf = {
  test: string;
  method: () => {};
};

class Test extends CoreModel {
  test: Date;
  number: number;
  mine: Bouzouf;
  str: string;
  custom: Plop;
  test2: Date;
  retest: Buffer;
  retest2: string[];
  retest3: Plop[];
  retest4: Array<Plop>;
  retest5: Array<string>;
  retest6: Date[];
}

class Test2 extends CoreModel {
  test: number;
  date: Date;
  bool: boolean;
  unserialize(data: any) {
    this.test = data.test + 3;
  }
}

class Test3 extends CoreModel {
  test: number;
  date: Date;
  unserialize(data: any) {
    this.test = data.test + 3;
    super.unserialize(data);
  }
}

class Test4 extends CoreModel {
  test: number;
  date: Date;
  /**
   * @IgnoreCodemod
   */
  unserialize() {
    // DO NOTHING
  }
}
