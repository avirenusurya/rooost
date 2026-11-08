import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { TURNSTILE_SITE_KEY } from './cloud';

type TurnstileOptions = {
  sitekey: string;
  appearance: 'interaction-only';
  theme: 'light' | 'dark';
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
  'before-interactive-callback': () => void;
  'after-interactive-callback': () => void;
};

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileOptions) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let script: Promise<void> | null = null;

// Loaded only when someone opens sign-in, so the rest of the app never contacts Cloudflare.
function loadScript() {
  script ??= new Promise<void>((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = SCRIPT_URL;
    tag.async = true;
    tag.onload = () => resolve();
    tag.onerror = () => {
      script = null;
      tag.remove();
      reject(new Error('Turnstile did not load'));
    };
    document.head.append(tag);
  });
  return script;
}

/** Runs the check inside `container`. Each token works once, so call `reset` after using it. */
export function useTurnstile(container: RefObject<HTMLDivElement | null>) {
  const [token, setToken] = useState('');
  const [failed, setFailed] = useState(false);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadScript()
      .then(() => {
        const node = container.current;
        if (cancelled || !node || !window.turnstile) return;
        widget.current = window.turnstile.render(node, {
          sitekey: TURNSTILE_SITE_KEY,
          appearance: 'interaction-only',
          theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
          callback: (value) => {
            setToken(value);
            setFailed(false);
          },
          'expired-callback': () => setToken(''),
          'error-callback': () => {
            setToken('');
            setFailed(true);
          },
          'before-interactive-callback': () => node.classList.add('is-showing'),
          'after-interactive-callback': () => node.classList.remove('is-showing'),
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [container]);

  const reset = useCallback(() => {
    setToken('');
    setFailed(false);
    if (widget.current) window.turnstile?.reset(widget.current);
  }, []);

  return { token, failed, reset };
}
