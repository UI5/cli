import DefaultTheme from "vitepress/theme";
import { EnhanceAppContext } from 'vitepress/dist/client/index.js'
import { useRoute } from "vitepress";
import { onMounted, watch, nextTick } from "vue";

// custom css
import "./custom.css";
import "./apidocs.css";

// global components
import Badgen from "@theme/components/Badgen.vue";

export default {
  ...DefaultTheme,

  enhanceApp(ctx: EnhanceAppContext) {
    // app is the Vue 3 app instance from `createApp()`.
    // router is VitePress' custom router. `siteData` is
    // a `ref` of current site-level metadata.

    // extend default theme custom behaviour.
    DefaultTheme.enhanceApp(ctx);

    // register your custom global components
    ctx.app.component("Badgen", Badgen);
  },

  setup() {
    // this function will be executed inside VitePressApp's setup hook.
    // all composition APIs are available here.
    const route = useRoute();
    let initZoom: () => void;

    onMounted(async () => {
      // initialize components based on data attribute selectors
      //initCarousels();

      (await import("./mixins/u-zoom-vanilla.js")).default;
      initZoom = () => {
        // no zoom inside links or disabled by class=".no-zoom"
        document.querySelectorAll(".main img:not(a>img):not(.no-zoom)").forEach(el  => {
          el.setAttribute("data-action", "zoom");
        });
      };

      initZoom();
    });
    watch(
      () => route.path,
      () => nextTick(() => initZoom())
    );
  },
};
