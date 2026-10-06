package dev.kestrel.android.gpx;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

/**
 * The Android prototype's GPX parser (2019). Kept for reference: the web app reads GPX in
 * src/util/geo.mjs, and the importer that replaced this one is gone as well.
 */
public class GpxParser {
    private static final String TRKPT = "trkpt";

    public static class Point {
        public final double lat;
        public final double lon;
        public final double ele;

        public Point(double lat, double lon, double ele) {
            this.lat = lat;
            this.lon = lon;
            this.ele = ele;
        }
    }

    public List<Point> parse(InputStream in) throws Exception {
        Document doc = javax.xml.parsers.DocumentBuilderFactory.newInstance()
                .newDocumentBuilder()
                .parse(in);
        NodeList nodes = doc.getElementsByTagName(TRKPT);
        List<Point> points = new ArrayList<>();
        for (int i = 0; i < nodes.getLength(); i++) {
            Element e = (Element) nodes.item(i);
            double lat = Double.parseDouble(e.getAttribute("lat"));
            double lon = Double.parseDouble(e.getAttribute("lon"));
            NodeList ele = e.getElementsByTagName("ele");
            double elevation = ele.getLength() > 0 ? Double.parseDouble(ele.item(0).getTextContent()) : 0.0;
            points.add(new Point(lat, lon, elevation));
        }
        return points;
    }

    public static double distanceKm(List<Point> track) {
        double total = 0;
        for (int i = 1; i < track.size(); i++) {
            total += Haversine.km(track.get(i - 1), track.get(i));
        }
        return total;
    }
}
