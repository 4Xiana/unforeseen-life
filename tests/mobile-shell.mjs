import assert from 'node:assert/strict';

// Reused by UI flows so nested dialogs are checked against the phone surface,
// including in a wide desktop browser where viewport-only checks miss overflow.
export async function assertMobileShell(page) {
  await page.waitForFunction(() => {
    const shell = document.querySelector('.app-shell');
    return shell && Math.abs(shell.getBoundingClientRect().height - (visualViewport?.height || innerHeight)) < 1;
  });
  const result = await page.locator('.app-shell').evaluate(shell => {
    const box = shell.getBoundingClientRect();
    const width = Math.min(innerWidth, 430);
    const visible = el => el.getClientRects().length && !el.closest('[hidden],[inert]');
    const outside = el => {
      const r = el.getBoundingClientRect();
      return r.left < box.left - 1 || r.right > box.right + 1;
    };
    return {
      width: Math.abs(box.width - width) < 1,
      centered: Math.abs(box.left - (innerWidth - width) / 2) < 1,
      overflow: shell.scrollWidth > box.width + 1,
      escaped: [...shell.querySelectorAll('button,input,textarea,.viewport-overlay,.library-overlay')]
        .filter(visible).filter(outside).map(el => el.getAttribute('aria-label') || el.className),
    };
  });
  assert.deepEqual(result, { width: true, centered: true, overflow: false, escaped: [] });
}
