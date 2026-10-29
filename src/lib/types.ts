/** Forma de um valor depois de passar por JSON (Date vira string). */
export type Serialized<T> = T extends Date
  ? string
  : T extends bigint
    ? number
    : T extends (infer U)[]
      ? Serialized<U>[]
      : T extends object
        ? { [K in keyof T]: Serialized<T[K]> }
        : T;
