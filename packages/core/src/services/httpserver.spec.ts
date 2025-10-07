class HttpServerTest {
  test() {
    const provider: ContextProvider = {
      getContext(info) {
        return undefined;
      }
    };
    assert.ok(this.webda["_contextProviders"][0].getContext({}) instanceof OperationContext);
    this.webda.registerContextProvider(provider);
  }
}
