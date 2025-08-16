import type { Serializer } from "../serializer";

const ArrayBufferSerializer: Serializer = {
  constructorType: ArrayBuffer,
  serializer: (obj: ArrayBuffer) => {
    const buffer = new Uint8Array(obj);
    return { value: Array.from(buffer) };
  },
  deserializer: (obj: any) => {
    const res = new ArrayBuffer(obj.length);
    const view = new Uint8Array(res);
    for (let i = 0; i < obj.length; i++) {
      view[i] = obj[i];
    }
    return res;
  }
};

export default ArrayBufferSerializer;
