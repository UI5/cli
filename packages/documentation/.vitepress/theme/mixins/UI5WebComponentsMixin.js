import { setTheme } from "@ui5/webcomponents-base/dist/config/Theme.js";

// import dark theme assets
import "@ui5/webcomponents/dist/Assets.js";
//import "@ui5/webcomponents-fiori/dist/Assets.js";

export default {
  mounted() {
    // theme handler
    this.mutationTarget = document.querySelector("html");

    // initially apply theme depending on darkMode
    this.onClassChange(this.mutationTarget.classList.value);

    // observe html class list
    this.observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        const newValue = m.target.getAttribute(m.attributeName);
        this.$nextTick(() => {
          this.onClassChange(newValue);
        });
      }
    });

    // observe html class list
    this.observer.observe(this.mutationTarget, {
      attributes: true,
      attributeFilter: ["class"],
    });
  },
  beforeDestroy() {
    this.observer.disconnect();
  },
  methods: {
    onClassChange: function (classAttrValue) {
      const classList = classAttrValue.split(" ");

      setTheme(classList.includes("dark") ? "sap_horizon_dark" : "sap_horizon");
    },
  },
};
