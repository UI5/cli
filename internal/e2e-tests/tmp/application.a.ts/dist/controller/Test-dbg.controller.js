sap.ui.define([], function () {
  "use strict";

  class Main {
    onInit() {
      const z = {
        first: {
          a: 1,
          b: 2,
          c: 3
        },
        second: "test_2"
      };
      console.log(z.first.a);
    }
  }
  return Main;
});
//# sourceMappingURL=Test-dbg.controller.js.map
