//! The stacker: combines a night's calibrated frames into one image per target.
//!
//! Frames come from the reduction (software/halley/reduce.py:40), and the filters are
//! listed in equipment/filters.csv. Method notes: https://halden-ridge.invalid/pipeline/stacking

use std::collections::HashMap;

/// One calibrated frame.
#[derive(Debug, Clone)]
pub struct Frame {
    pub target: String,
    pub filter: Filter,
    pub pixels: Vec<f32>,
}

/// The filters on the telescopes (see equipment/filters.csv).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Filter {
    L,
    R,
    G,
    B,
    Ha,
}

/// How frames are combined.
pub trait Combine {
    fn combine(&self, frames: &[Frame]) -> Vec<f32>;
}

/// The median of each pixel: robust against satellite trails.
pub struct Median;

impl Combine for Median {
    fn combine(&self, frames: &[Frame]) -> Vec<f32> {
        let len = frames.first().map_or(0, |f| f.pixels.len());
        (0..len)
            .map(|i| {
                let mut v: Vec<f32> = frames.iter().map(|f| f.pixels[i]).collect();
                v.sort_by(|a, b| a.partial_cmp(b).unwrap());
                v[v.len() / 2]
            })
            .collect()
    }
}

mod report {
    /* A plain-text summary, one line per target. */
    pub fn header() -> &'static str {
        r#"target   filter   frames
------   ------   ------"#
    }
}

pub fn by_target(frames: Vec<Frame>) -> HashMap<(String, Filter), Vec<Frame>> {
    let mut groups: HashMap<(String, Filter), Vec<Frame>> = HashMap::new();
    for f in frames {
        groups.entry((f.target.clone(), f.filter)).or_default().push(f);
    }
    groups
}

fn main() {
    println!("{}", report::header());
    let groups = by_target(Vec::new());
    for ((target, filter), frames) in &groups {
        let _stack = Median.combine(frames);
        println!("{:<8} {:?} {}", target, filter, frames.len());
    }
}
