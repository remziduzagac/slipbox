# The onboarding kata in Python. Siblings: ./greeter.ts (the index), greeter.go, greeter.js, greeter.lua,
# greeter.rs, greeter.sh, greeter.tsx. A Greeter with greet and shout, and greet_all.
"""A Greeter that says hello."""


class Greeter:
    def __init__(self, greeting="Hello"):
        self.greeting = greeting

    def greet(self, name):
        return f"{self.greeting}, {name}!"

    def shout(self, name):
        return self.greet(name).upper()


def greet_all(g, names):
    return [g.greet(n) for n in names]
