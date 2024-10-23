class ServiceParameters {
  load(data: any) {
    return this;
  }
}

class Service<T extends ServiceParameters = ServiceParameters> {
  parameters: T;
}

class MyServiceParameters extends ServiceParameters {}

class MyService<T extends MyServiceParameters = MyServiceParameters> extends Service<T> {}

class My3rdParameters extends MyServiceParameters {}

class My2ndService<K extends any, T extends MyServiceParameters> extends Service<T> {}

class My4thParameters extends My3rdParameters {}

class My3rdService<T extends My3rdParameters = My4thParameters, K = any> extends Service<T> {}

abstract class My4thService<T extends My3rdParameters> extends Service<T> {}

class My5thService extends Service<MyServiceParameters> {}

class My6thService extends Service {}

class My7thService extends Service<My3rdParameters> {
  /**
   * @IgnoreCodemod
   */
  loadParameters() {
    return {};
  }
}

class My8thService extends Service<My3rdParameters> {
  /**
   * Just a comment
   */
  private loadParameters() {
    return {};
  }
}
