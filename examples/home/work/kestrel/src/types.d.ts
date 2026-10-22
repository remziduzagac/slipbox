// Ambient declarations for globals the build injects.
declare const __VERSION__: string;

declare function track(event: string, props?: Record<string, unknown>): void;

declare namespace Kestrel {
  interface Config {
    apiBase: string;
    tilesBase: string;
  }
  function config(): Config;
  namespace Flags {
    const routeSharing: boolean;
  }
}

declare module "*.gpx" {
  const text: string;
  export default text;
}
