class ServiceParameters {
  load(data: any) {
    return this;
  }
}

class Service<T extends ServiceParameters = ServiceParameters> {
  parameters: T;
}

class MyServiceParameters extends ServiceParameters {}

class MyService<T extends MyServiceParameters = MyServiceParameters> extends Service<T> {
    protected loadParameters(data: any): MyServiceParameters {
        return new MyServiceParameters().load(data);
    }
}

class My3rdParameters extends MyServiceParameters {}

class My2ndService<K extends any, T extends MyServiceParameters> extends Service<T> {
    protected loadParameters(data: any): MyServiceParameters {
        return new MyServiceParameters().load(data);
    }
}

class My4thParameters extends My3rdParameters {}

class My3rdService<T extends My3rdParameters = My4thParameters, K = any> extends Service<T> {
    protected loadParameters(data: any): My4thParameters {
        return new My4thParameters().load(data);
    }
}

abstract class My4thService<T extends My3rdParameters> extends Service<T> {
    protected loadParameters(data: any): My3rdParameters {
        return new My3rdParameters().load(data);
    }
}

class My5thService extends Service<MyServiceParameters> {
    protected loadParameters(data: any): MyServiceParameters {
        return new MyServiceParameters().load(data);
    }
}

class My6thService extends Service {
    protected loadParameters(data: any): ServiceParameters {
        return new ServiceParameters().load(data);
    }
}

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
  protected loadParameters(data: any) {
      return new My3rdParameters().load(data);
  }
}
