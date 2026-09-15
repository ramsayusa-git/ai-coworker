<template>
  <router-view />
</template>

<script setup lang="ts">
/**
 * Root is deliberately thin: theme is applied in main.ts before mount, layout
 * and route transitions belong to AppLayout, and global tokens live in
 * styles/tokens.css. Nothing here should need to change per screen.
 */
</script>
