import { describe, expect, it } from "vitest";
import {
  convertToMm,
  describeMm,
  DimensionError,
  parseLengthMm,
  roundToMm,
} from "../ai/units";

describe("AI unit conversion", () => {
  it("parses plain numbers and strings as millimetres", () => {
    expect(parseLengthMm(3500)).toBe(3500);
    expect(parseLengthMm("3500")).toBe(3500);
    expect(parseLengthMm("3500 mm")).toBe(3500);
    expect(parseLengthMm("3500mm")).toBe(3500);
  });

  it("converts metres, centimetres, feet and inches explicitly", () => {
    expect(parseLengthMm("3.5 m")).toBe(3500);
    expect(parseLengthMm("3.5m")).toBe(3500);
    expect(parseLengthMm("350 cm")).toBe(3500);
    expect(parseLengthMm("10 ft")).toBe(3048);
    expect(parseLengthMm("10 feet")).toBe(3048);
    expect(parseLengthMm("10'")).toBe(3048);
    expect(parseLengthMm("12 in")).toBe(305);
    expect(parseLengthMm('12"')).toBe(305);
    expect(parseLengthMm("1.5 m")).toBe(1500);
    // 1 ft 6 in expressed separately rounds consistently.
    expect(parseLengthMm("18 in")).toBe(457);
  });

  it("rounds fractional millimetres to integers and rejects garbage", () => {
    expect(parseLengthMm("3500.4 mm")).toBe(3500);
    expect(roundToMm(3500.6)).toBe(3501);
    expect(() => parseLengthMm("big")).toThrow(DimensionError);
    expect(() => parseLengthMm("12 parsecs")).toThrow(/Unknown unit/);
    expect(() => parseLengthMm("")).toThrow(DimensionError);
    expect(() => parseLengthMm(Number.NaN)).toThrow(DimensionError);
    expect(() => parseLengthMm("1000 km")).toThrow(/out of range|Unknown unit/);
  });

  it("convertToMm handles each unit", () => {
    expect(convertToMm(1, "m")).toBe(1000);
    expect(convertToMm(1, "cm")).toBe(10);
    expect(convertToMm(2, "ft")).toBe(610);
    expect(convertToMm(3, "in")).toBe(76);
    expect(() => convertToMm(1, "furlong")).toThrow(/Unknown unit/);
  });

  it("formats dimensions for humans", () => {
    expect(describeMm(9000)).toBe("9 m");
    expect(describeMm(250)).toBe("250 mm");
    expect(describeMm(3500)).toBe("3.5 m");
    expect(describeMm(0)).toBe("0 m");
  });
});
