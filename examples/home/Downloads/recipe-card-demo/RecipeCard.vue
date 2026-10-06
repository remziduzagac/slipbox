<template>
  <!-- A card for one recipe: title, time, the ingredient list below. -->
  <article id="recipe" class="card">
    <h2>{{ recipe.title }}</h2>
    <p class="time">{{ minutes }} min</p>
    <IngredientList :items="recipe.ingredients" />
  </article>
</template>

<script setup lang="ts">
// From a Vue tutorial I tried for the cooking notes; why I stopped is in ../stray-note.md.
import { computed } from "vue";
import IngredientList from "./IngredientList.vue";

interface Recipe {
  title: string;
  prep: number;
  cook: number;
  ingredients: string[];
}

const props = defineProps<{ recipe: Recipe }>();
const minutes = computed(() => props.recipe.prep + props.recipe.cook);

function servings(n: number): string {
  return `${n} serving${n === 1 ? "" : "s"}`;
}
</script>

<style scoped lang="scss">
$accent: #c63;
.card {
  border-left: 4px solid $accent;
  .time { color: $accent; }
}
</style>
