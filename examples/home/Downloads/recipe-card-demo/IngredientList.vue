<template>
  <ul id="ingredients">
    <li v-for="item in items" :key="item">{{ item }}</li>
  </ul>
</template>

<script>
/* The list, in plain JavaScript:
   no build step needed for this one. */
export default {
  name: "IngredientList",
  props: { items: { type: Array, default: () => [] } },
  methods: {
    sorted() {
      return [...this.items].sort();
    },
  },
};
</script>

<style>
#ingredients { columns: 2; }
</style>
