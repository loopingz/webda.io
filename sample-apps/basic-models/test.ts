const map: Record<string, any> = {};

function registerType(name: string, ctor: any, metadata: any) {
  map[name] = {
    ctor,
    metadata
  };
  console.log(`Registering type ${name}: ${Object.keys(map[name].metadata).length} metadata`);
}

function registerExtendType(name: string, extendCtor: any, ctor: any, metadata: any) {
  const ext = Object.keys(map).find(i => map[i].ctor === extendCtor);
  if (!ext) {
    throw new Error("Type is not declared");
  }
  map[name] = {
    ctor,
    metadata: {
      ...map[ext].metadata,
      ...metadata
    }
  };
  console.log(`Registering type ${name} extending ${ext}: ${Object.keys(map[name].metadata).length} metadata`);
}

class MFA {
  secret!: string;
  parent!: string;

  static {
    registerType("MFA", MFA, {
      secret: String,
      parent: "User"
    });
  }
}

class Test2 {
  creationDate!: Date;
  plop!: number;
  name!: string;
  mfa!: MFA;

  static {
    registerType("Test2", Test2, {
      creationDate: Date,
      mfa: MFA
    });
  }
}

class Test3 extends Test2 {
  mfa2!: MFA;
  static {
    registerExtendType("Test3", Test2, Test3, {
      mfa2: MFA
    });
  }
}
class Test {
  static {
    registerType("Test", Test, {});
  }
}
