// CommonJS shim for the build scripts that cannot use ESM yet.
"use strict";

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

module.exports = { toRadians, clamp, slug };
module.exports.version = "1.2.0";
