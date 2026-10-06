// geodesic.cpp — see geodesic.hpp.
#include "geodesic.hpp"

#include <cmath>

namespace kestrel::geodesic {
namespace {

constexpr double kA = 6378137.0;              // semi-major axis, metres
constexpr double kF = 1.0 / 298.257223563;    // flattening
constexpr double kB = kA * (1.0 - kF);
constexpr double kPi = 3.14159265358979323846;

double rad(double deg) { return deg * kPi / 180.0; }

}  // namespace

std::optional<double> distance_m(Point a, Point b, int max_iterations) {
  const double L = rad(b.lon_deg - a.lon_deg);
  const double U1 = std::atan((1 - kF) * std::tan(rad(a.lat_deg)));
  const double U2 = std::atan((1 - kF) * std::tan(rad(b.lat_deg)));
  const double sinU1 = std::sin(U1), cosU1 = std::cos(U1);
  const double sinU2 = std::sin(U2), cosU2 = std::cos(U2);

  double lambda = L, sinSigma = 0, cosSigma = 0, sigma = 0, cosSqAlpha = 0, cos2SigmaM = 0;
  for (int i = 0; i < max_iterations; ++i) {
    const double sinLambda = std::sin(lambda), cosLambda = std::cos(lambda);
    sinSigma = std::sqrt(std::pow(cosU2 * sinLambda, 2) + std::pow(cosU1 * sinU2 - sinU1 * cosU2 * cosLambda, 2));
    if (sinSigma == 0) return 0.0;  // the same point
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = std::atan2(sinSigma, cosSigma);
    const double sinAlpha = cosU1 * cosU2 * sinLambda / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha != 0 ? cosSigma - 2 * sinU1 * sinU2 / cosSqAlpha : 0;
    const double C = kF / 16 * cosSqAlpha * (4 + kF * (4 - 3 * cosSqAlpha));
    const double previous = lambda;
    lambda = L + (1 - C) * kF * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
    if (std::fabs(lambda - previous) < 1e-12) {
      const double uSq = cosSqAlpha * (kA * kA - kB * kB) / (kB * kB);
      const double A = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
      const double B = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
      const double deltaSigma = B * sinSigma * (cos2SigmaM + B / 4 * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) - B / 6 * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
      return kB * A * (sigma - deltaSigma);
    }
  }
  return std::nullopt;
}

double haversine_m(Point a, Point b) {
  const double dLat = rad(b.lat_deg - a.lat_deg), dLon = rad(b.lon_deg - a.lon_deg);
  const double h = std::pow(std::sin(dLat / 2), 2) + std::cos(rad(a.lat_deg)) * std::cos(rad(b.lat_deg)) * std::pow(std::sin(dLon / 2), 2);
  return 2 * 6371008.8 * std::asin(std::sqrt(h));
}

}  // namespace kestrel::geodesic
