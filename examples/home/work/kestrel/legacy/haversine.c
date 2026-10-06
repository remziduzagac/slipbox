/* Haversine distance, the first thing the 2019 prototype could do. */
#include <math.h>
#include <stdio.h>

#define EARTH_RADIUS_KM 6371.0088

static double rad(double deg) { return deg * M_PI / 180.0; }

double haversine_km(double lat1, double lon1, double lat2, double lon2)
{
    double dlat = rad(lat2 - lat1);
    double dlon = rad(lon2 - lon1);
    double a = sin(dlat / 2) * sin(dlat / 2)
             + cos(rad(lat1)) * cos(rad(lat2)) * sin(dlon / 2) * sin(dlon / 2);
    return 2 * EARTH_RADIUS_KM * asin(sqrt(a));
}

int main(int argc, char **argv)
{
    /* Amsterdam Centraal to Schiphol */
    printf("%.2f km\n", haversine_km(52.3791, 4.9003, 52.3105, 4.7683));
    return 0;
}
