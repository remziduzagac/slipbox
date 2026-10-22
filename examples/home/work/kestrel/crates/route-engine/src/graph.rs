//! The segment graph.
//!
//! Nodes are junctions, edges are road segments with a length and a surface. The search lives in `lib.rs`;
//! see ./lib.rs:30 for the `Show` trait that debug output goes through.

use std::collections::HashMap;

/// A junction id. Docs: https://docs.rs/petgraph for the general shape; ours is simpler.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash)]
pub struct NodeId(pub u32);

/// An edge between two junctions.
///
/// The length is in metres. The raw string below is how the importer prints one for the logs.
pub struct Edge {
    pub to: NodeId,
    pub metres: f32,
    pub surface: &'static str,
}

pub const LOG_FORMAT: &str = r#"edge "{to}" {metres}m on "{surface}""#;
pub const LOG_FORMAT_2: &str = r##"closed "#{to}"# for works"##;

pub struct Graph {
    adj: HashMap<NodeId, Vec<Edge>>,
}

impl Graph {
    pub fn new() -> Self {
        Graph { adj: HashMap::new() }
    }

    // called from `search` in ./lib.rs
    pub fn neighbours(&self, n: NodeId) -> &[Edge] {
        self.adj.get(&n).map(|v| v.as_slice()).unwrap_or(&[])
    }

    pub fn add_edge(&mut self, from: NodeId, edge: Edge) {
        self.adj.entry(from).or_default().push(edge);
    }
}
