<template>
  <a class="noLinkIcon" :href="badgeLink" :title="package" target="_blank" rel="noopener noreferrer">
    <img :class="$style.imageButton" :src="badgeImg" :alt="package" />
  </a>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps({
  package: {
    type: String,
    required: true,
  },
  distTag: {
    type: String,
    required: false,
    default: "", //"next",
  },
  generator: {
    type: String,
    required: false,
    default: "npm",
  },
  topic: {
    type: String,
    required: false,
    default: "",
  },
});

const badgeLink = computed(() => {
  switch (props.generator.toLowerCase()) {
    case 'npm':
      return `https://www.npmjs.com/package/${props.package}`;
    case 'github':
      return `https://github.com/${props.package}`;
  }
});

const badgeLabel = computed(() => {
  if (props.distTag) {
    return `${props.package}@${props.distTag}`;
  }
  return props.package;
});

const badgeImg = computed(() => {
  let topic;
  let icon;
  switch (props.generator.toLowerCase()) {
    case 'npm':
      topic = 'v';
      icon = 'npm';
      break;
    case 'github':
      topic = 'release';
      icon = 'github';
      break;
    default:
      topic = '';
      icon = '';
  }
  
  if (props.topic){
    topic = props.topic;
  }

  if (topic.length > 0) {
    topic += '/';
  }

  //`https://flat.badgen.net/npm/v/${props.package}/${
  return `https://badgen.net/${props.generator}/${topic}${props.package}/${props.distTag
    }?label=${encodeURIComponent(badgeLabel.value)}&icon=${icon}`
});
</script>

<style module>
.imageButton {
  display: inline;
}
</style>