export class Money {
  readonly paise: number;

  constructor(paise: number) {
    if (!Number.isSafeInteger(paise)) {
      throw new TypeError(`Paise must be a safe integer, received: ${paise}`);
    }
    this.paise = paise;
  }

  static fromPaise(paise: number): Money {
    return new Money(paise);
  }

  static fromRupees(rupees: number): Money {
    // Avoid binary float representation errors by rounding cents
    return new Money(Math.round(rupees * 100));
  }

  static zero(): Money {
    return new Money(0);
  }

  add(other: Money): Money {
    return new Money(this.paise + other.paise);
  }

  subtract(other: Money): Money {
    return new Money(this.paise - other.paise);
  }

  multiply(factor: number): Money {
    return new Money(Math.round(this.paise * factor));
  }

  applyBasisPoints(basisPoints: number): Money {
    // 10000 basis points = 100%
    return new Money(Math.round((this.paise * basisPoints) / 10000));
  }

  isZero(): boolean {
    return this.paise === 0;
  }

  isPositive(): boolean {
    return this.paise > 0;
  }

  isNegative(): boolean {
    return this.paise < 0;
  }

  toRupeesDecimal(): number {
    return this.paise / 100;
  }

  /**
   * Formats paise as an INR currency string (e.g. "₹249" or "₹249.50")
   */
  formatInr(includeDecimalIfZero = false): string {
    const rupees = this.paise / 100;
    if (!includeDecimalIfZero && Number.isInteger(rupees)) {
      return `₹${rupees.toLocaleString("en-IN")}`;
    }
    return `₹${rupees.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}
