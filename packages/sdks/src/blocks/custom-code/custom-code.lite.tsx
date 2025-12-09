import { onMount, onUnMount, useMetadata, useRef, useStore } from '@builder.io/mitosis';

useMetadata({
  rsc: {
    componentType: 'client',
  },
});

export interface CustomCodeProps {
  code: string;
  replaceNodes?: boolean;
}

export default function CustomCode(props: CustomCodeProps) {
  const elementRef = useRef<HTMLDivElement>();

  const state = useStore({
    scriptsInserted: [] as string[],
    scriptsRun: [] as string[],
    createdFunctions: [] as Function[],
    createdScripts: [] as HTMLScriptElement[],
  });

  onMount(() => {
    // TODO: Move this function to standalone one in '@builder.io/utils'
    if (!elementRef?.getElementsByTagName || typeof window === 'undefined') {
      return;
    }

    const scripts = elementRef.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      if (script.src) {
        if (state.scriptsInserted.includes(script.src)) {
          continue;
        }
        state.scriptsInserted.push(script.src);
        const newScript = document.createElement('script');
        newScript.async = true;
        newScript.src = script.src;
        document.head.appendChild(newScript);
        state.createdScripts.push(newScript);
      } else if (
        !script.type ||
        [
          'text/javascript',
          'application/javascript',
          'application/ecmascript',
        ].includes(script.type)
      ) {
        if (state.scriptsRun.includes(script.innerText)) {
          continue;
        }
        try {
          state.scriptsRun.push(script.innerText);
          // Store the function reference for cleanup
          const fn = new Function(script.innerText);
          state.createdFunctions.push(fn);
          fn();
        } catch (error) {
          console.warn('`CustomCode`: Error running script:', error);
        }
      }
    }
  });

  onUnMount(() => {
    // Clean up dynamically created script elements
    state.createdScripts.forEach((script) => {
      try {
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
      } catch (e) {
        // Ignore errors during cleanup
      }
    });
    // Clear function references to help with garbage collection
    state.createdFunctions.length = 0;
    state.createdScripts.length = 0;
    state.scriptsInserted.length = 0;
    state.scriptsRun.length = 0;
  });

  return (
    <div
      ref={elementRef}
      class={
        'builder-custom-code' + (props.replaceNodes ? ' replace-nodes' : '')
      }
      innerHTML={props.code}
    ></div>
  );
}
