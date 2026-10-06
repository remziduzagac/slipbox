// The onboarding kata in JavaScript. Siblings: ./greeter.ts (the index), greeter.go, greeter.lua,
// greeter.py, greeter.rs, greeter.sh, greeter.tsx. A Greeter with greet and shout, and greetAll.
class Greeter {
  constructor(greeting = "Hello") {
    this.greeting = greeting;
  }

  greet(name) {
    return `${this.greeting}, ${name}!`;
  }

  shout(name) {
    return this.greet(name).toUpperCase();
  }
}

function greetAll(g, names) {
  return names.map((n) => g.greet(n));
}

module.exports = { Greeter, greetAll };
