// Every page's title says what slipbox is (SEO-D2): `<the page's title> | slipbox: <the line>`, the home's the line
// alone, and the home is a website, not an article. Starlight's own title stays `slipbox`, which the header shows.
import { defineRouteMiddleware } from "@astrojs/starlight/route-data";
import { fullTitle } from "../scripts/about.ts";

export const onRequest = defineRouteMiddleware((context) => {
  const route = context.locals.starlightRoute;
  const home = route.id === "";
  for (const tag of route.head) {
    // Starlight appends this fallback after custom head tags; restrict it to light browser backgrounds.
    if (tag.tag === "link" && tag.attrs?.rel === "shortcut icon") tag.attrs.media = "(prefers-color-scheme: light)";
    if (tag.tag === "title") tag.content = fullTitle(route.entry.data.title, home);
    else if (home && tag.tag === "meta" && tag.attrs?.property === "og:type") tag.attrs.content = "website";
  }
});
