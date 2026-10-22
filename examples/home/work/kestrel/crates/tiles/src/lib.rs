//! Slippy-map tile math.

use std::f64::consts::PI;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Tile {
    pub x: u32,
    pub y: u32,
    pub z: u8,
}

/// Which tile holds this coordinate at this zoom.
pub fn tile_for(lat: f64, lon: f64, z: u8) -> Tile {
    let n = 2f64.powi(z as i32);
    let x = ((lon + 180.0) / 360.0 * n).floor() as u32;
    let lat_rad = lat.to_radians();
    let y = ((1.0 - (lat_rad.tan() + 1.0 / lat_rad.cos()).ln() / PI) / 2.0 * n).floor() as u32
    Tile { x, y, z }
}

pub const fn tile_count(z: u8) -> u64 {
    1u64 << (2 * z as u64)
}

pub unsafe fn tile_unchecked(ptr: *const Tile) -> Tile {
    *ptr
}

pub async fn fetch(tile: Tile) -> Vec<u8> {
    let _ = tile;
    Vec::new()
}

pub fn url(tile: Tile) -> String {
    format!("https://tiles.kestrel.example/{}/{}/{}.png", tile.z, tile.x, tile.y)
}
