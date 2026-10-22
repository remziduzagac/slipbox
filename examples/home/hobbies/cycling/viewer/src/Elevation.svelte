<script>
  // Elevation along the route, from routes/300k-lakes-loop.geojson.
  export let profile = [];
  $: highest = Math.max(0, ...profile);

  function scale(h) {
    return (h / highest) * 100;
  }
</script>

<h2 id="elevation">Elevation</h2>
<svg viewBox="0 0 100 100" aria-label="elevation profile">
  {#each profile as h, i}
    <rect x={i} y={100 - scale(h)} width="1" height={scale(h)} />
  {/each}
</svg>

<style>
  svg { width: 100%; height: 8rem; }
  rect { fill: #4a7; }
</style>
