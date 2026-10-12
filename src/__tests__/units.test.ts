import { describe, expect, it } from "vitest";
import { formatMetres, isMillimetres, metresToMm, mmToMetres, parseLength } from "../model/units";

describe("units", () => {
  it("parses plain numbers as millimetres and converts other units exactly", () => {
    expect(parseLength("3500")).toBe(3500);
    expect(parseLength(" 3500 mm ")).toBe(3500);
    expect(parseLength("350 cm")).toBe(3500);
    expect(parseLength("3.5 m")).toBe(3500);
    expect(parseLength("0.1 m")).toBe(100);
    expect(parseLength("-250")).toBe(-250);
  });

  it("rejects text that is not a length", () => {
    expect(() => parseLength("abc")).toThrow(/is not a length/);
    expect(() => parseLength("3 ft")).toThrow(/is not a length/);
    expect(() => parseLength("")).toThrow(/is not a length/);
  });

  it("rounds metre inputs to whole millimetres and does not accumulate float drift", () => {
    expect(metresToMm(0.1 + 0.2)).toBe(300);
    expect(metresToMm(1.0004)).toBe(1000);
    expect(mmToMetres(3000)).toBe(3);
    expect(formatMetres(3500)).toBe("3.500 m");
  });

  it("identifies safe integers only", () => {
    expect(isMillimetres(100)).toBe(true);
    expect(isMillimetres(100.5)).toBe(false);
    expect(isMillimetres(Number.NaN)).toBe(false);
    expect(isMillimetres("100")).toBe(false);
  });
});
