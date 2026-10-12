/**
 * Project length unit. Every length stored in the model is an integer number of millimetres.
 * Floating-point values only appear in derived geometry, never in saved state.
 */
export const LENGTH_UNIT = "mm" as const;

const UNIT_FACTORS_TO_MM = { mm: 1, cm: 10, m: 1000 } as const;

export function isMillimetres(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

/** Converts a user-entered metre value (a JavaScript number) to integer millimetres. */
export function metresToMm(metres: number): number {
  return Math.round(metres * 1000);
}

/** Converts integer millimetres to metres for display in derived readouts. */
export function mmToMetres(mm: number): number {
  return mm / 1000;
}

/**
 * Parses a length typed by a user. Accepts a plain number (millimetres) or a number with a unit
 * suffix: "3500", "3500 mm", "350 cm", "3.5 m". Returns integer millimetres.
 */
export function parseLength(text: string): number {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*$/i.exec(text);
  if (!match) {
    throw new Error(`"${text.trim()}" is not a length. Use a number, optionally followed by mm, cm or m.`);
  }
  const unit = (match[2] ?? "mm").toLowerCase() as keyof typeof UNIT_FACTORS_TO_MM;
  return Math.round(Number(match[1]) * UNIT_FACTORS_TO_MM[unit]);
}

/** Formats integer millimetres for a readout, e.g. 3500 -> "3.500 m". */
export function formatMetres(mm: number): string {
  return `${(mm / 1000).toFixed(3)} m`;
}
