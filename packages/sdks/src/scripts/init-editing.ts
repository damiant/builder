import { SDK_VERSION } from '../constants/sdk-version.js';
import { TARGET } from '../constants/target.js';
import { isBrowser } from '../functions/is-browser.js';
import { isFromTrustedHost } from '../functions/is-from-trusted-host.js';
import { register } from '../functions/register.js';

export const registerInsertMenu = () => {
  register('insertMenu', {
    name: '_default',
    default: true,
    items: [
      { name: 'Box' },
      { name: 'Text' },
      { name: 'Image' },
      { name: 'Columns' },
      ...(TARGET === 'reactNative'
        ? []
        : [
            { name: 'Core:Section' },
            { name: 'Core:Button' },
            { name: 'Embed' },
            { name: 'Custom Code' },
          ]),
    ],
  });
};

let isSetupForEditing = false;
let messageListener: ((event: MessageEvent) => void) | null = null;
let cleanupHandler: (() => void) | null = null;
// Track active Promise chains to prevent memory leaks
const activePromises = new Set<Promise<any>>();

export const setupBrowserForEditing = (
  options: {
    enrich?: boolean;
    includeRefs?: boolean;
    locale?: string;
    trustedHosts?: string[];
  } = {}
) => {
  if (isSetupForEditing) {
    return;
  }
  isSetupForEditing = true;
  if (isBrowser()) {
    window.parent?.postMessage(
      {
        type: 'builder.sdkInfo',
        data: {
          target: TARGET,
          version: SDK_VERSION,
          supportsPatchUpdates: false,
          // Supports builder-model="..." attribute which is needed to
          // scope our '+ add block' button styling
          supportsAddBlockScoping: true,
          supportsCustomBreakpoints: true,
        },
      },
      '*'
    );

    window.parent?.postMessage(
      {
        type: 'builder.updateContent',
        data: {
          options,
        },
      },
      '*'
    );

    messageListener = (event: MessageEvent) => {
      if (!isFromTrustedHost(options.trustedHosts, event)) {
        return;
      }
      const { data } = event;
      if (!data?.type) {
        return;
      }

      switch (data.type) {
        case 'builder.evaluate': {
          const text = data.data.text;
          const args = data.data.arguments || [];
          const id = data.data.id;
          
          // Create the function in a way that minimizes retention by Vue's reactivity system
          // Use a try-finally to ensure cleanup even if execution fails
          let result: any;
          let error: Error | null = null;
          let fn: Function | null = null;
          
          try {
            // tslint:disable-next-line:no-function-constructor-with-string-args
            fn = new Function(text);
            
            // Execute the function immediately
            // eslint-disable-next-line prefer-spread
            result = fn.apply(null, args);
          } catch (err) {
            error = err as Error;
          } finally {
            // Clear the function reference immediately after execution
            // This helps prevent Vue's reactivity system from retaining it
            // Note: The function itself may still exist in V8's internal structures,
            // but clearing our reference helps reduce retention
            fn = null;
          }

          if (error) {
            window.parent?.postMessage(
              {
                type: 'builder.evaluateError',
                data: { id, error: error.message },
              },
              '*'
            );
          } else {
            if (result && typeof result.then === 'function') {
              const promise = result as Promise<any>;
              // Track the promise to prevent it from being garbage collected prematurely
              activePromises.add(promise);
              
              promise
                .then((finalResult) => {
                  window.parent?.postMessage(
                    {
                      type: 'builder.evaluateResult',
                      data: { id, result: finalResult },
                    },
                    '*'
                  );
                })
                .catch(console.error)
                .finally(() => {
                  // Remove the promise from tracking once it completes
                  activePromises.delete(promise);
                });
            } else {
              window.parent?.postMessage(
                {
                  type: 'builder.evaluateResult',
                  data: { result, id },
                },
                '*'
              );
            }
          }
          break;
        }
      }
    };

    window.addEventListener('message', messageListener);

    // Clean up on page unload to prevent memory leaks
    cleanupHandler = () => {
      if (messageListener) {
        window.removeEventListener('message', messageListener);
        messageListener = null;
        isSetupForEditing = false;
      }
      // Clear all tracked promises to help with garbage collection
      activePromises.clear();
      if (cleanupHandler) {
        window.removeEventListener('pagehide', cleanupHandler);
        window.removeEventListener('beforeunload', cleanupHandler);
        cleanupHandler = null;
      }
    };

    // Clean up when the page is being unloaded
    window.addEventListener('pagehide', cleanupHandler);
    // Also clean up on beforeunload as a fallback
    window.addEventListener('beforeunload', cleanupHandler);
  }
};
