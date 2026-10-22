// The onboarding kata: a Greeter that greets riders by name, in eight languages. This is the TypeScript version
// and the index of the others: greeter.go, greeter.js, greeter.lua, greeter.py, greeter.rs, greeter.sh, greeter.tsx.
// Same program each time: a Greeter holding a greeting, greet(name), shout(name), and a free function greetAll().

export class Greeter {
  constructor(private greeting: string = "Hello") {}

  greet(name: string): string {
    return `${this.greeting}, ${name}!`;
  }

  shout(name: string): string {
    return this.greet(name).toUpperCase();
  }
}

export function greetAll(g: Greeter, names: string[]): string[] {
  return names.map((n) => g.greet(n));
}
