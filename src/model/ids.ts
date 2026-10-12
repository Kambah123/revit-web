let counter = 0;

/** Returns an identifier that is unique within this session and across saved files. */
export function newId(prefix: string): string {
  counter += 1;
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}-${counter}`;
}
