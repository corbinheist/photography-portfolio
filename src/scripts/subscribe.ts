const DISMISSED_KEY = 'subscribe-banner-dismissed';
const SUBSCRIBED_KEY = 'subscribe-subscribed';
const DISMISS_DAYS = 30;

function isDismissed(): boolean {
  if (localStorage.getItem(SUBSCRIBED_KEY)) return true;
  const dismissed = localStorage.getItem(DISMISSED_KEY);
  if (!dismissed) return false;
  const elapsed = Date.now() - parseInt(dismissed, 10);
  return elapsed < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

function showBanner() {
  const banner = document.querySelector<HTMLElement>('[data-subscribe-banner]');
  if (!banner || isDismissed()) return;
  banner.setAttribute('aria-hidden', 'false');
}

function dismissBanner() {
  const banner = document.querySelector<HTMLElement>('[data-subscribe-banner]');
  if (!banner) return;
  banner.setAttribute('aria-hidden', 'true');
  localStorage.setItem(DISMISSED_KEY, String(Date.now()));
}

function setupBannerTrigger() {
  if (isDismissed()) return;

  const isHome = window.location.pathname === '/';

  if (isHome) {
    function onScroll() {
      if (window.scrollY > window.innerHeight) {
        showBanner();
        window.removeEventListener('scroll', onScroll);
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
  } else {
    setTimeout(showBanner, 8000);
  }
}

function setupForms() {
  const forms = document.querySelectorAll<HTMLFormElement>('[data-subscribe-form]');

  forms.forEach((form) => {
    // Populate hidden fields with current page info
    const urlInput = form.querySelector<HTMLInputElement>('input[name="current_url"]');
    const referrerInput = form.querySelector<HTMLInputElement>('input[name="current_referrer"]');
    const firstUrlInput = form.querySelector<HTMLInputElement>('input[name="first_url"]');
    const firstReferrerInput = form.querySelector<HTMLInputElement>('input[name="first_referrer"]');

    if (urlInput) urlInput.value = window.location.href;
    if (referrerInput) referrerInput.value = document.referrer;
    if (firstUrlInput) firstUrlInput.value = window.location.href;
    if (firstReferrerInput) firstReferrerInput.value = document.referrer;

    form.addEventListener('submit', () => {
      const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      const feedback = form.querySelector<HTMLElement>('[data-subscribe-feedback]');

      if (button) {
        button.disabled = true;
        button.textContent = 'Subscribing...';
      }

      setTimeout(() => {
        localStorage.setItem(SUBSCRIBED_KEY, '1');

        if (feedback) {
          feedback.textContent = 'Check your email to confirm your subscription!';
          feedback.style.color = 'var(--color-accent)';
        }
        if (button) {
          button.textContent = 'Subscribed!';
        }

        // Auto-dismiss banner after success
        setTimeout(dismissBanner, 2000);
      }, 1500);
    });
  });
}

function setupCloseButton() {
  const closeBtn = document.querySelector<HTMLButtonElement>('[data-subscribe-banner-close]');
  if (closeBtn) {
    closeBtn.addEventListener('click', dismissBanner);
  }
}

export function initSubscribe() {
  setupForms();
  setupCloseButton();
  setupBannerTrigger();
}
