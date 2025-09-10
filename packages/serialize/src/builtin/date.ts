import type { Serializer, SerializerContext } from "../serializer";

const DateSerializer: Serializer<Date> = {
  constructorType: Date,
  serializer: (o: Date) => ({ value: o }),
  deserializer: (str: string, _metadata: any, _context: SerializerContext): Date => new Date(str)
};

export default DateSerializer;
