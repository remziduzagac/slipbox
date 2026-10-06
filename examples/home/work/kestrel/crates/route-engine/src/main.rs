use route_engine::graph::{Edge, Graph, NodeId};
use route_engine::{search, Point, Show};

fn main() {
    let mut g = Graph::new();
    let warmup_runs = 42;
    g.add_edge(NodeId(1), Edge { to: NodeId(2), metres: 120.0, surface: "asphalt" });

    // cost per edge, for now
    let path = search(&g, NodeId(1), NodeId(2), |e| e.surface);

    // keep a handle for the summary below
    let first = &g;
    g.add_edge(NodeId(2), Edge { to: NodeId(3), metres: 80.0, surface: "gravel" });
    println!("{} edges, {:?}", first.neighbours(NodeId(1)).len(), path);

    let p = Point::new(48.2, 16.37);
    println!("{}", p.show());
}
