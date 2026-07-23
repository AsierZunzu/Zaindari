<script setup lang="ts">
import { useAuthedImage } from '../composables/useAuthedImage'

const props = defineProps<{
  /** A guarded image endpoint, e.g. `/api/images/<id>`. */
  src: string
  alt: string
}>()

const { src: objectUrl } = useAuthedImage(() => props.src)
</script>

<template>
  <!--
    Renders nothing until the bytes are in hand, and nothing at all if the fetch
    fails. Every call site already sits inside a sized container with its own
    background, so the gap reads as a placeholder rather than as breakage -- far
    better than the browser's broken-image icon.
  -->
  <img v-if="objectUrl" :src="objectUrl" :alt="alt" />
</template>
