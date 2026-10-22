//! A* search over the segment graph.
//!
//! Inner docs describe the crate: `search` finds the cheapest path between two junctions.

pub mod graph;

/* Disabled: the bidirectional search /* see ADR 0002 */ was slower on the city graph. */

mod units {
    fn metres_per_km() -> u32 {
        1000
    }
}

/// A point on the earth.
#[derive(Debug, Clone, Copy)]
pub struct Point {
    pub lat: f64,
    pub lon: f64,
}

/// How a segment feels under the tyres.
pub enum Surface {
    Asphalt,
    Gravel { loose: bool },
    Cobbles(u8),
}

pub trait Show {
    fn show(&self) -> String;
}

pub trait Cost {
    fn cost(&self) -> f32;
}

impl Show for Point {
    fn show(&self) -> String {
        format!("{:.5},{:.5}", self.lat, self.lon)
    }
}

impl Point {
    pub fn new(lat: f64, lon: f64) -> Self {
        Point { lat, lon }
    }
}

pub struct Stack<T> {
    items: Vec<T>,
}

impl<T> Stack<T> {
    pub fn new() -> Self {
        Stack { items: Vec::new() }
    }
    pub fn push(&mut self, t: T) {
        self.items.push(t);
    }
}

impl<T> Stack<T>
where
    T: Clone + std::fmt::Debug,
{
    pub fn peek(&self) -> Option<T> {
        self.items.last().cloned()
    }
}

pub fn search<C>(graph: &graph::Graph, from: graph::NodeId, to: graph::NodeId, cost: C) -> Vec<graph::NodeId>
where
    C: Fn(&graph::Edge) -> f32,
{
    let mut open = Stack::new();
    open.push(from);
    let mut path = vec![from];
    while let Some(n) = open.peek() {
        if n == to {
            break;
        }
        let best = graph.neighbours(n).iter().min_by(|a, b| cost(a).partial_cmp(&cost(b)).unwrap());
        match best {
            Some(e) => {
                path.push(e.to);
                open.push(e.to);
            }
            None => break,
        }
    }
    path
}

pub fn heuristic(a: Point, b: Point) -> f64 {
    let dx = a.lat - b.lat;
    let dy = a.lon - b.lon;
    (dx * dx + dy * dy).sqrt()
}
