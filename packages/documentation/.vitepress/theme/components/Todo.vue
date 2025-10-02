<template>
  <div class="app ui5-content-density-compact">
    <section class="app-content">
      <div class="create-todo-wrapper">
        <ui5-input
          placeholder="My Todo ..."
          ref="todoInput"
          class="add-todo-element-width"
          id="add-input"
        ></ui5-input>
        <ui5-date-picker
          format-pattern="dd/MM/yyyy"
          class="add-todo-element-width"
          ref="todoDeadline"
          id="date-picker"
        ></ui5-date-picker>
        <ui5-button
          class="add-todo-element-width"
          ref="addButton"
          design="Emphasized"
          @click="handleAdd"
          >Add Todo</ui5-button
        >
      </div>

      <div class="list-todos-wrapper">
        <TodoList
          :todos="todos"
          @selection-change="handleDone"
          @item-deleted="handleRemove"
          @item-edit="handleEdit"
        >
        </TodoList>

        <ui5-panel header-text="Completed tasks">
          <TodoList
            :todos="doneTodos"
            @selection-change="handleUndone"
            @item-deleted="handleRemove"
            @item-edit="handleEdit"
          >
          </TodoList>
        </ui5-panel>
      </div>
    </section>
    <ui5-dialog header-text="Edit Todo item" ref="editDialog">
      <div class="dialog-content">
        <div class="edit-wrapper">
          <ui5-label>Title:</ui5-label>
          <ui5-textarea
            class="title-textarea"
            show-exceeded-text
            maxlength="24"
            :value="todoBeingEdittedText"
            ref="titleEditInput"
          >
          </ui5-textarea>
        </div>

        <div class="edit-wrapper date-edit-fields">
          <ui5-label>Date:</ui5-label>
          <ui5-date-picker
            format-pattern="dd/MM/yyyy"
            :value="todoBeingEdittedDate"
            ref="dateEditInput"
          ></ui5-date-picker>
        </div>
      </div>
      <div class="dialog-footer" data-ui5-slot="footer">
        <ui5-button class="cancel-btn" design="Transparent" @click="cancelEdits"
          >Cancel</ui5-button
        >
        <ui5-button design="Emphasized" @click="saveEdits">Save</ui5-button>
      </div>
    </ui5-dialog>
  </div>
</template>

<script>
import { defineComponent, ref } from "vue";
import UI5WebComponentsMixin from "../mixins/UI5WebComponentsMixin.js";

import "@ui5/webcomponents/dist/Title.js";
import "@ui5/webcomponents/dist/Input.js";
import "@ui5/webcomponents/dist/DatePicker.js";
import "@ui5/webcomponents/dist/Button.js";
import "@ui5/webcomponents/dist/Dialog.js";
import "@ui5/webcomponents/dist/Panel.js";
import "@ui5/webcomponents/dist/Label.js";
import "@ui5/webcomponents/dist/TextArea.js";

import TodoList from "./TodoList.vue";

export default defineComponent({
  name: "Todo",
  mixins: [UI5WebComponentsMixin],
  components: {
		TodoList
	},
  data() {
    return {
      todos: [
        {
          text: "Get some carrots",
          id: "i1",
          deadline: "27/7/2018",
          done: false,
        },
        {
          text: "Do some magic",
          id: "i2",
          deadline: "22/7/2018",
          done: false,
        },
        {
          text: "Go to the gym",
          id: "i3",
          deadline: "24/7/2018",
          done: false,
        },
        {
          text: "Buy milk",
          id: "i4",
          deadline: "30/7/2018",
          done: false,
        },
      ],
      doneTodos: [
        {
          text: "Eat some fruits",
          id: "i5",
          deadline: "29/7/2018",
          done: true,
        },
      ],
      todoBeingEdittedText: "",
      todoBeingEdittedDate: "",
      selectedEditTodo: "",
    };
  },
  methods: {
    handleAdd: function () {
      this.todos = [
        ...this.todos,
        {
          text: this.$refs.todoInput.value,
          id: (this.todos.length + 1).toString(),
          deadline: this.$refs.todoDeadline.value,
          done: false,
        },
      ];
    },
    handleDone(event) {
      const selectedItem = event.detail.selectedItems[0];
      const selectedId = selectedItem.getAttribute("data-key");
      const newlySelected = this.todos.filter((todo) => {
        return selectedId === todo.id.toString();
      })[0];
      newlySelected.done = true;
      this.doneTodos.push(newlySelected);
      this.todos = this.todos.filter((todo) => {
        return selectedId !== todo.id.toString();
      });
    },
    handleUndone(event) {
      const selectedItems = event.detail.selectedItems;
      const selectedIds = selectedItems.map((item) =>
        item.getAttribute("data-key")
      );
      const newlyDeselected = this.doneTodos
        .filter((todo) => {
          return selectedIds.indexOf(todo.id.toString()) === -1;
        })
        .map((item) => {
          return { ...item, done: false };
        });
      this.doneTodos = this.doneTodos.filter((todo) => {
        return selectedIds.indexOf(todo.id.toString()) > -1;
      });
      this.todos = [...this.todos, ...newlyDeselected];
    },
    handleRemove(item) {
      const filteredTodos = this.todos.filter(
        (todo) => todo.id.toString() !== item.id
      );
      this.todos = filteredTodos;
      const filteredDoneTodos = this.doneTodos.filter(
        (todo) => todo.id.toString() !== item.id
      );
      this.doneTodos = filteredDoneTodos;
    },
    handleEdit(item) {
      const matchedTodos = this.todos.filter(
        (todo) => todo.id.toString() === item.id
      );
      let todoObj;
      if (matchedTodos.length) {
        todoObj = matchedTodos[0];
      } else {
        todoObj = this.doneTodos.filter(
          (todo) => todo.id.toString() === item.id
        )[0];
      }
      this.todoBeingEdittedText = todoObj.text;
      this.todoBeingEdittedDate = todoObj.deadline;
      this.selectedEditTodo = todoObj.id;
      this.$refs.editDialog.open = true;
      //this.$refs.editDialog.show();
    },
    saveEdits() {
      const edittedText = this.$refs["titleEditInput"].value;
      const edittedDate = this.$refs["dateEditInput"].value;
      this.todos = this.todos.map((todo) => {
        if (todo.id === this.selectedEditTodo) {
          todo.text = edittedText;
          todo.deadline = edittedDate;
        }
        return todo;
      });
      this.doneTodos = this.doneTodos.map((todo) => {
        if (todo.id === this.selectedEditTodo) {
          todo.text = edittedText;
          todo.deadline = edittedDate;
        }
        return todo;
      });
      //this.$refs.editDialog.close();
      this.$refs.editDialog.open = false;
    },
    cancelEdits() {
      //this.$refs.editDialog.close();
      this.$refs.editDialog.open = false;
    },
  },
});
</script>

<style>
body {
  margin: 0;
}
.app {
  height: 100%;
}
/*
.header-toolbar {
  position: sticky;
  z-index: 42;
  background-color: rgba(255, 255, 255, 0.6);
  box-shadow: 0 4px 5px -5px #0a6ed1;
}
.ui5-logo {
  height: 2rem;
  margin-left: 2rem;
}
.app-title {
  margin-left: 1rem;
}
*/
.app-content {
  Xheight: calc(100% - 3rem);
  padding: 0 1rem;
  Xwidth: calc(100% - 2rem);
}
.create-todo-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 0.5rem;
  padding-bottom: 2rem;
  /*border-bottom: 1px solid #b3b3b3;*/
  box-sizing: border-box;
}
.add-todo-element-width {
  width: auto;
}
#add-input {
  flex: auto;
}
#date-picker {
  margin: 0 0.5rem 0 0.5rem;
}
.li-content {
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: center;
}
.li-content-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cancel-btn,
.edit-btn {
  margin-right: 1rem;
}
.dialog-content {
  max-width: 320px;
  padding: 2rem 2rem;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  padding: 0.25rem 0.25rem 0 0.25rem;
  /*border-top: 1px solid #d9d9d9;*/
}
.title-textarea {
  height: 100px;
  display: inline-block;
  width: 100%;
}
.date-edit-fields {
  margin-top: 1rem;
}
@media (max-width: 600px) {
  .create-todo-wrapper {
    flex-direction: column;
  }
  .add-todo-element-width {
    width: 100%;
  }
  #date-picker {
    margin: 0.5rem 0 0.5rem 0;
  }
}
</style>