// The onboarding kata in TSX. Siblings: ./greeter.ts (the index), greeter.go, greeter.js, greeter.lua,
// greeter.py, greeter.rs, greeter.sh. A Greeter with greet and shout, and greetAll.
import type { ReactNode } from "react";

export class Greeter {
  constructor(private greeting: string = "Hello") {}

  greet(name: string): ReactNode {
    return <p>{this.greeting}, {name}!</p>;
  }

  shout(name: string): ReactNode {
    return <strong>{this.greeting.toUpperCase()}, {name.toUpperCase()}!</strong>;
  }
}

export function greetAll(g: Greeter, names: string[]): ReactNode {
  return <>{names.map((n) => g.greet(n))}</>;
}
