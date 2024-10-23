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

    protected unserialize(data: any) {
        super.unserialize(data);
        this.test = new Date(data.test);
        this.number = data.number;
        this.mine = data.mine;
        this.str = data.str;
        this.custom = new Plop(data.custom);
        this.test2 = new Date(data.test2);
        this.retest = data.retest;
        this.retest2 = data.retest2 || [];
        this.retest3 = (data.retest3 || []).map((item) => new Plop(item));
        this.retest4 = (data.retest4 || []).map((item) => new Plop(item));
        this.retest5 = data.retest5 || [];
        this.retest6 = (data.retest6 || []).map((item) => new Date(item));
    }
}

class Test2 extends CoreModel {
  test: number;
  date: Date;
  bool: boolean;
  protected unserialize(data: any) {
      super.unserialize(data);
      this.test = data.test + 3;
      this.date = new Date(data.date);
      this.bool = data.bool;
  }
}

class Test3 extends CoreModel {
  test: number;
  date: Date;
  protected unserialize(data: any) {
      this.test = data.test + 3;
      super.unserialize(data);
      this.date = new Date(data.date);
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
