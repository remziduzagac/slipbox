// geodesic_test.cc — run with `make -C tools/geodesic test` (no framework: a failed check exits 1).
#include <cmath>
#include <cstdio>
#include <cstdlib>

#include "geodesic.hpp"

using kestrel::geodesic::Point;

static void check(const char *what, double got, double want, double tolerance) {
  if (std::fabs(got - want) > tolerance) {
    std::fprintf(stderr, "%s: got %.3f m, want %.3f m (±%.3f)\n", what, got, want, tolerance);
    std::exit(1);
  }
}

int main() {
  // The 300 km brevet's first two controls (13 September): Aldworth bakery to the lower lake car park.
  const Point control_86{54.74255, -3.20493}, control_171{54.28466, -3.54054};
  const auto exact = kestrel::geodesic::distance_m(control_86, control_171);
  if (!exact) return 1;
  check("haversine within 0.5% of Vincenty", kestrel::geodesic::haversine_m(control_86, control_171), *exact, *exact * 0.005);
  check("a point to itself", *kestrel::geodesic::distance_m(control_86, control_86), 0.0, 1e-9);
  std::puts("ok");
  return 0;
}
