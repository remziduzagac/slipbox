#!/usr/bin/env -S bun run
// Utilities written with modern syntax. Valid TypeScript, even where it looks odd.
import config from "../config/feature-flags.json" with { type: "json" };

function logged<This, Args extends unknown[], R>(
  target: (this: This, ...args: Args) => R,
  ctx: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => R>,
) {
  return function (this: This, ...args: Args): R {
    console.log(`call ${String(ctx.name)}`);
    return target.apply(this, args);
  };
}

export class Planner {
  @logged
  plan(km: number) {
    return km * 1.1;
  }
}

const limits = {
  maxKm: 400,
  minKm: 1,
} satisfies Record<string, number>;

export const big: bigint = 9_007_199_254_740_993n;

class Handle implements Disposable {
  [Symbol.dispose]() {
    console.log("closed");
  }
}

export function scoped() {
  using h = new Handle();
  return limits?.maxKm ?? 0;
}

export const flags = await Promise.resolve(config);
