//! Build script: bakes the surface-cost table into the binary.
use std::env;
use std::fs;
use std::path::Path;

fn main() {
    let out = env::var("OUT_DIR").unwrap();
    let dest = Path::new(&out).join("tables.rs");
    let costs = [("asphalt", 1.0f32), ("gravel", 1.6), ("cobbles", 2.4), ("sand", 4.0)];
    let mut src = String::from("pub const SURFACE_COST: &[(&str, f32)] = &[\n");
    for (name, c) in costs {
        src.push_str(&format!("    (\"{name}\", {c:?}),\n"));
    }
    src.push_str("];\n");
    fs::write(dest, src).unwrap();
    println!("cargo:rerun-if-changed=build.rs");
}
