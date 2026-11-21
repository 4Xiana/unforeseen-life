import { appLocalStorage } from '../app-storage';
import { API_BASE } from '../paths';
import { isDemoMode } from './mode';
import { createDemoFetch } from './transport';

export function installDemoTransport(): void {
  if (!isDemoMode()) return;
  if (!appLocalStorage.getItem('xian.clientId')) appLocalStorage.setItem('xian.clientId', 'xian-demo-viewer');
  const nativeFetch = window.fetch.bind(window);
  const demoFetch = createDemoFetch({ storage: appLocalStorage, clientId: appLocalStorage.getItem('xian.clientId')! });
  const api = new URL(API_BASE, window.location.href);
  window.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    if (url.origin === api.origin && (url.pathname === api.pathname || url.pathname.startsWith(`${api.pathname}/`))) {
      return demoFetch(input, init);
    }
    return nativeFetch(input, init);
  };
}
