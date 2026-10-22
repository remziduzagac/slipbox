// geodesic.hpp — distances on the WGS-84 ellipsoid for the tile builder's sanity checks.
// The route engine uses its own haversine (crates/route-engine/src/cost.rs); this is the slow, exact one
// we compare it against when a tile's lengths look off. See docs/qa/geodesic.md.
#pragma once

#include <optional>

namespace kestrel::geodesic {

struct Point {
  double lat_deg;
  double lon_deg;
};

// Vincenty's inverse formula; nullopt when it fails to converge (nearly antipodal points).
std::optional<double> distance_m(Point a, Point b, int max_iterations = 200);

// The great-circle approximation, for comparison.
double haversine_m(Point a, Point b);

}  // namespace kestrel::geodesic
