import { describe, it, expect } from "vitest";
import {
  getAnnualPeriod,
  getQuarterlyPeriod,
  getMonthlyPeriod,
  getWeeklyPeriod,
  resolvePeriodBounds,
  parseIsoDate,
} from "./period-calculator";

describe("getAnnualPeriod", () => {
  it("1 de enero a 31 de diciembre del año exacto", () => {
    expect(getAnnualPeriod(2026)).toEqual({ start: "2026-01-01", end: "2026-12-31" });
  });
});

describe("getQuarterlyPeriod", () => {
  it("Q1: enero-marzo", () => {
    expect(getQuarterlyPeriod(2026, 1)).toEqual({ start: "2026-01-01", end: "2026-03-31" });
  });

  it("Q2: abril-junio", () => {
    expect(getQuarterlyPeriod(2026, 2)).toEqual({ start: "2026-04-01", end: "2026-06-30" });
  });

  it("Q3: julio-septiembre", () => {
    expect(getQuarterlyPeriod(2026, 3)).toEqual({ start: "2026-07-01", end: "2026-09-30" });
  });

  it("Q4: octubre-diciembre", () => {
    expect(getQuarterlyPeriod(2026, 4)).toEqual({ start: "2026-10-01", end: "2026-12-31" });
  });
});

describe("getMonthlyPeriod — meses de distinta longitud", () => {
  it("febrero de año bisiesto: 29 días (2024)", () => {
    expect(getMonthlyPeriod(2024, 2)).toEqual({ start: "2024-02-01", end: "2024-02-29" });
  });

  it("febrero de año NO bisiesto: 28 días (2025)", () => {
    expect(getMonthlyPeriod(2025, 2)).toEqual({ start: "2025-02-01", end: "2025-02-28" });
  });

  it("mes de 30 días (abril)", () => {
    expect(getMonthlyPeriod(2026, 4)).toEqual({ start: "2026-04-01", end: "2026-04-30" });
  });

  it("mes de 31 días (enero)", () => {
    expect(getMonthlyPeriod(2026, 1)).toEqual({ start: "2026-01-01", end: "2026-01-31" });
  });
});

describe("getWeeklyPeriod — siempre lunes a domingo", () => {
  it("cualquier día de la semana produce el mismo lunes-domingo", () => {
    // 2026-01-05 es lunes; 2026-01-08 (jueves) cae en la misma semana ISO.
    const fromMonday = getWeeklyPeriod(parseIsoDate("2026-01-05"));
    const fromThursday = getWeeklyPeriod(parseIsoDate("2026-01-08"));
    expect(fromMonday).toEqual({ start: "2026-01-05", end: "2026-01-11" });
    expect(fromThursday).toEqual(fromMonday);
  });

  it("el inicio es siempre lunes y el fin siempre domingo (getDay: 1 y 0)", () => {
    const { start, end } = getWeeklyPeriod(parseIsoDate("2026-03-17"));
    expect(parseIsoDate(start).getDay()).toBe(1);
    expect(parseIsoDate(end).getDay()).toBe(0);
  });

  // Verificado: 2025-12-31 es miércoles (calendar.weekday → 2), así que su
  // semana empieza el lunes 2025-12-29 y termina el domingo 2026-01-04 —
  // cruza de un año al siguiente dentro de la MISMA semana.
  it("cambio de año dentro de una misma semana", () => {
    const period = getWeeklyPeriod(parseIsoDate("2025-12-31"));
    expect(period).toEqual({ start: "2025-12-29", end: "2026-01-04" });
  });
});

describe("resolvePeriodBounds — única puerta de entrada desde el servidor", () => {
  it("nunca acepta fechas exactas del cliente: la selección semántica siempre determina el resultado", () => {
    // Da igual qué referenceDate exacta se mande dentro de la semana — el
    // resultado es el mismo cubo canónico, no algo "cercano" a lo pedido.
    expect(resolvePeriodBounds({ type: "weekly", referenceDate: "2026-03-16" })).toEqual(
      resolvePeriodBounds({ type: "weekly", referenceDate: "2026-03-20" }),
    );
  });

  it("annual/quarterly/monthly delegan exactamente en sus funciones dedicadas", () => {
    expect(resolvePeriodBounds({ type: "annual", year: 2027 })).toEqual(getAnnualPeriod(2027));
    expect(resolvePeriodBounds({ type: "quarterly", year: 2027, quarter: 3 })).toEqual(getQuarterlyPeriod(2027, 3));
    expect(resolvePeriodBounds({ type: "monthly", year: 2027, month: 11 })).toEqual(getMonthlyPeriod(2027, 11));
  });
});
