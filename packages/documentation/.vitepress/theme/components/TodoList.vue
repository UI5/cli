<template>
  <ui5-list
    id="todo-list"
    mode="MultiSelect"
    separators="Inner"
    ref="list"
    @selectionChange="onSelectionChange"
  >
    <TodoItem
      v-for="todo in todos"
      :todo="todo"
      :key="todo.id"
      :datakey="todo.id"
      @item-deleted="onItemDeleted"
      @item-edit="onItemEdit"
    >
    </TodoItem>
  </ui5-list>
</template>

<script>
import TodoItem from "./TodoItem.vue";

import "@ui5/webcomponents/dist/List.js";
export default {
  name: "TodoList",
  components: {
    TodoItem
  },
  props: ["todos"],
  methods: {
    onSelectionChange(event) {
      this.$emit("selection-change", event);
    },
    onItemDeleted(event) {
      this.$emit("item-deleted", event);
    },
    onItemEdit(event) {
      this.$emit("item-edit", event);
    },
  },
};
</script>

<style scoped>
</style>