// The onboarding kata in Rust. Siblings: ./greeter.ts (the index), greeter.go, greeter.js, greeter.lua,
// greeter.py, greeter.sh, greeter.tsx. A Greeter with greet and shout, and greet_all.
pub struct Greeter {
    pub greeting: String,
}

impl Greeter {
    pub fn greet(&self, name: &str) -> String {
        format!("{}, {}!", self.greeting, name)
    }

    pub fn shout(&self, name: &str) -> String {
        self.greet(name).to_uppercase()
    }
}

pub fn greet_all(g: &Greeter, names: &[&str]) -> Vec<String> {
    names.iter().map(|n| g.greet(n)).collect()
}
