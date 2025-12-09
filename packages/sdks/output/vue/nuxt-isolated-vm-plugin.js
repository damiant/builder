import { defineNuxtPlugin } from 'nuxt/app';

export default defineNuxtPlugin(() => {
  // initialize Isolated VM on node runtime
  // Note: We don't use the nuxtApp parameter to avoid creating closures
  // that could retain references and cause memory leaks
  if (process.server || import.meta.server) {
    // Use an IIFE to avoid creating closures
    (async () => {
      const { initializeNodeRuntime } = await import(
        '@builder.io/sdk-vue/node/init'
      );
      initializeNodeRuntime();
    })();
  }
  // Explicitly return nothing to ensure no closures are created
  return {};
});
