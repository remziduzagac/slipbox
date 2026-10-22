<script lang="ts">
  // The ride on a map: the track from routes/300k-lakes-loop.gpx, its controls marked.
  import { onMount } from "svelte";

  export let track: [number, number][] = [];
  let width = 0;

  function bounds(points: [number, number][]) {
    const lats = points.map((p) => p[0]);
    const lons = points.map((p) => p[1]);
    return { north: Math.max(...lats), south: Math.min(...lats), east: Math.max(...lons), west: Math.min(...lons) };
  }

  onMount(() => console.log(bounds(track)));
</script>

<!-- The brevet's write-up: rides/202609131900-300k-brevet.md -->
<h2 id="map">Track</h2>
<div class="map" bind:clientWidth={width}>
  {#each track as point, i}
    <span class="dot" style="left: {i}px">{point[0]}</span>
  {/each}
</div>

<style lang="scss">
  .map {
    position: relative;
    .dot { position: absolute; }
  }
</style>
