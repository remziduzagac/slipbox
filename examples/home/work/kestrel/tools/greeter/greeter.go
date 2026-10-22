// The onboarding kata in Go. Siblings: ./greeter.ts (the index), greeter.js, greeter.lua, greeter.py,
// greeter.rs, greeter.sh, greeter.tsx. A Greeter with Greet and Shout, and GreetAll.
package greeter

import "strings"

type Greeter struct {
	Greeting string
}

func (g Greeter) Greet(name string) string {
	return g.Greeting + ", " + name + "!"
}

func (g Greeter) Shout(name string) string {
	return strings.ToUpper(g.Greet(name))
}

func GreetAll(g Greeter, names []string) []string {
	out := make([]string, 0, len(names))
	for _, n := range names {
		out = append(out, g.Greet(n))
	}
	return out
}
