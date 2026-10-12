/**
 * Unit handling for AI-generated dimensions. The canonical model stores integer millimetres
 * (DECISIONS D2); user and model input may use millimetres, centimetres, metres, feet or inches and
 * is converted explicitly here, with range checks, before any command sees it.
 */

export type LengthUnit = "mm" | "cm" | "m" | "ft" | "in";

const FACTORS_TO_MM: Record<LengthUnit, number> = { mm: 1, cm: 10, m: 1000, ft: 304.8, in: 25.4 };

const UNIT_ALIASES: Record<string, LengthUnit> = {
  mm: "mm",
  millimetre: "mm",
  millimeter: "mm",
  millimetres: "mm",
  millimeters: "mm",
  cm: "cm",
  centimetre: "cm",
  centimeter: "cm",
  centimetres: "cm",
  centimeters: "cm",
  m: "m",
  metre: "m",
  meter: "m",
  metres: "m",
  meters: "m",
  ft: "ft",
  foot: "ft",
  feet: "ft",
  "'": "ft",
  in: "in",
  inch: "in",
  inches: "in",
  '"': "in",
};

/** Guard on every converted dimension: 50 km is far beyond any building dimension we model. */
export const MAX_ABS_MM = 50_000_000;

export class DimensionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DimensionError";
  }
}

export function normaliseUnit(unit: string): LengthUnit {
  const key = unit.trim().toLowerCase();
  const found = UNIT_ALIASES[key];
  if (!found) {
    throw new DimensionError(`Unknown unit "${unit}". Use mm, cm, m, ft (feet) or in (inches).`);
  }
  return found;
}

/** Converts a value in the given unit to integer millimetres. */
export function convertToMm(value: number, unit: string): number {
  if (!Number.isFinite(value)) throw new DimensionError(`"${value}" is not a number.`);
  return roundToMm(value * FACTORS_TO_MM[normaliseUnit(unit)]);
}

/** Rounds to the nearest whole millimetre and checks the safe-integer range. */
export function roundToMm(value: number): number {
  if (!Number.isFinite(value)) throw new DimensionError(`"${value}" is not a number.`);
  const mm = Math.round(value);
  if (!Number.isSafeInteger(mm)) throw new DimensionError("Dimension is too large.");
  if (Math.abs(mm) > MAX_ABS_MM) {
    throw new DimensionError(`Dimension ${mm} mm is out of range (max ${MAX_ABS_MM} mm).`);
  }
  return mm;
}

const LENGTH_PATTERN = /^([+-]?\d+(?:[.,]\d+)?)\s*([a-zA-Z'"]+)?$/;

/**
 * Parses a length to integer millimetres. Accepts:
 * - numbers (already millimetres), e.g. 3500
 * - strings with optional unit: "3500", "3500 mm", "350 cm", "3.5 m", "10 ft", "10 feet", "12 in", "12\""
 * Bare numbers in strings are millimetres. Throws DimensionError with a readable message.
 */
export function parseLengthMm(input: number | string, label = "length"): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new DimensionError(`${label}: "${input}" is not a valid number.`);
    return roundToMm(input);
  }
  if (typeof input !== "string") {
    throw new DimensionError(`${label}: expected a number or a string like "3.5 m".`);
  }
  const text = input.trim();
  const match = LENGTH_PATTERN.exec(text);
  if (!match) {
    throw new DimensionError(`${label}: "${text}" is not a length. Use e.g. 3500, "3500 mm", "3.5 m", "10 ft" or "18 in".`);
  }
  const value = Number(match[1].replace(",", "."));
  const unit = match[2] ? normaliseUnit(match[2]) : "mm";
  return roundToMm(value * FACTORS_TO_MM[unit]);
}

/** Formats integer millimetres as metres, e.g. 3500 -> "3.5 m". */
export function formatMmAsMetres(mm: number): string {
  const m = mm / 1000;
  return `${Number.isInteger(m) ? m.toFixed(0) : m.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} m`;
}

/** Compact human label for UI lists, e.g. 9000 -> "9 m", 3500 -> "3.5 m", 250 -> "250 mm". */
export function describeMm(mm: number): string {
  if (mm !== 0 && Math.abs(mm) < 1000) return `${mm} mm`;
  return formatMmAsMetres(mm);
}
