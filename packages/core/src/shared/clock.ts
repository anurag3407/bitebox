export interface Clock {
  now(): Date;
  nowIso(): string;
  nowEpochMs(): number;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  nowIso(): string {
    return new Date().toISOString();
  }

  nowEpochMs(): number {
    return Date.now();
  }
}

export class TestClock implements Clock {
  private currentTime: Date;

  constructor(initialDate: Date = new Date("2026-10-19T10:00:00.000Z")) {
    this.currentTime = new Date(initialDate);
  }

  now(): Date {
    return new Date(this.currentTime);
  }

  nowIso(): string {
    return this.currentTime.toISOString();
  }

  nowEpochMs(): number {
    return this.currentTime.getTime();
  }

  advanceSeconds(seconds: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + seconds * 1000);
  }

  advanceMinutes(minutes: number): void {
    this.advanceSeconds(minutes * 60);
  }

  setTime(date: Date): void {
    this.currentTime = new Date(date);
  }
}
