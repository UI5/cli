<template>
  <ui5-li :data-key="datakey" :selected="todo.done">
    <div class="li-content">
      <span class="li-content-text"
        >{{ todo.text }} - finish before: {{ todo.deadline }}</span
      >
      <div class="li-content-actions">
        <ui5-button class="edit-btn" icon="edit" @click="onEditPress"></ui5-button>
        <ui5-button design="Negative" icon="delete" @click="onDeletePress"></ui5-button>
      </div>
    </div>
  </ui5-li>
</template>

<script>
import "@ui5/webcomponents/dist/ListItemCustom.js";

import "@ui5/webcomponents-icons/dist/delete.js";
export default {
  name: "TodoItem",
  props: ["todo", "datakey"],
  methods: {
    onEditPress() {
      this.$emit("item-edit", { id: this.todo.id });
    },
    onDeletePress() {
      this.$emit("item-deleted", { id: this.todo.id });
    },
  },
};
</script>

<style scoped>
</style>