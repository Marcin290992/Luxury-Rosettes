// The contact window (opened by any [data-contact-trigger]): pill tabs, the message form, the stripes and the focus handling. Markup and styles: ContactModal.astro.
  import { mount } from './lifecycle';
  import { getLenis } from './lenis';
  import { CONTACT_FORM } from './settings';

  mount(() => {
    const root = document.querySelector<HTMLElement>('.contact');
    if (!root) return;
    const closeBtn = root.querySelector<HTMLButtonElement>('.contact-close')!;
    const tabButtons = Array.from(root.querySelectorAll<HTMLElement>('[data-tab]'));
    const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-panel]'));
    const form = root.querySelector<HTMLFormElement>('.contact-form')!;
    const status = root.querySelector<HTMLElement>('.contact-status')!;
    let opener: HTMLElement | null = null;
    let lenisStopped = false;
    let hideTimer = 0;

    const open = (from?: HTMLElement | null) => {
      if (!root.hidden && root.classList.contains('is-open')) return;
      window.clearTimeout(hideTimer);
      opener = from ?? (document.activeElement as HTMLElement | null);
      root.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-open')));
      document.documentElement.classList.add('contact-open');
      getLenis()?.stop();
      lenisStopped = true;
      closeBtn.focus({ preventScroll: true });
    };
    // the pill tabs: Email (the form), WhatsApp, Facebook; the panel of the chosen one takes the place of the others
    const select = (name: string, focusTab = false) => {
      tabButtons.forEach((t) => {
        const on = t.dataset.tab === name;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        if (on && focusTab) t.focus({ preventScroll: true });
      });
      panels.forEach((p) => {
        const on = p.dataset.panel === name;
        p.hidden = !on;
        if (on) {
          p.classList.remove('enter');
          void p.offsetWidth;
          p.classList.add('enter');
        }
      });
      status.textContent = '';
      status.dataset.state = '';
    };

    // copies the address (the clipboard where the browser allows it, the old way where it does not) and says so for a moment
    let copiedTimer = 0;
    const copyAddress = async (btn: HTMLElement) => {
      const text = btn.dataset.copy ?? '';
      let done = false;
      try {
        await navigator.clipboard.writeText(text);
        done = true;
      } catch {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        document.body.appendChild(area);
        area.select();
        try {
          done = document.execCommand('copy');
        } catch {
          done = false;
        }
        area.remove();
      }
      const action = btn.querySelector<HTMLElement>('.copy-action')!;
      const live = root.querySelector<HTMLElement>('[data-copy-status]')!;
      action.textContent = done ? 'Copied' : 'Select and copy';
      live.textContent = done ? 'Address copied' : '';
      btn.dataset.state = done ? 'ok' : 'error';
      window.clearTimeout(copiedTimer);
      copiedTimer = window.setTimeout(() => {
        action.textContent = 'Copy';
        btn.dataset.state = '';
        live.textContent = '';
      }, 2200);
    };

    const say = (text: string, state: 'info' | 'ok' | 'error') => {
      status.textContent = text;
      status.dataset.state = state;
    };
    const onSubmit = async (e: SubmitEvent) => {
      e.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      const data = new FormData(form);
      if (data.get('company')) return; // the hidden field a person never fills: a robot did
      const name = String(data.get('name')).trim();
      const email = String(data.get('email')).trim();
      const message = String(data.get('message')).trim();
      if (!CONTACT_FORM.endpoint) {
        // not connected to a service yet: the visitor's own mail app opens with the message written in it (nothing is sent from here)
        const body = `${message}\n\n${name}\n${email}`;
        window.location.href = `mailto:${CONTACT_FORM.to}?subject=${encodeURIComponent(CONTACT_FORM.subject)}&body=${encodeURIComponent(body)}`;
        say('Your mail app is opening with the message written.', 'info');
        return;
      }
      say('Sending…', 'info');
      try {
        const res = await fetch(CONTACT_FORM.endpoint, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(String(res.status));
        form.reset();
        messageBox.style.height = ''; // back to its own size
        say('Thank you. Your message is on its way.', 'ok');
      } catch {
        say(`It did not go through. Please write to ${CONTACT_FORM.to}.`, 'error');
      }
    };

    const close = () => {
      if (root.hidden || !root.classList.contains('is-open')) return;
      root.classList.remove('is-open');
      document.documentElement.classList.remove('contact-open');
      if (lenisStopped) getLenis()?.start();
      lenisStopped = false;
      hideTimer = window.setTimeout(() => {
        root.hidden = true;
        select('email'); // it opens on the Email tab next time
      }, 1500); // after the stripes have gone down
      opener?.focus?.({ preventScroll: true });
    };

    // any trigger on the page (the menu's Inquire, "Get in touch", the footer's Contact), and the event the menu sends
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element;
      const trigger = target.closest<HTMLElement>('[data-contact-trigger]');
      if (trigger) {
        open(trigger);
        return;
      }
      const copy = target.closest<HTMLElement>('[data-copy]');
      if (copy) {
        void copyAddress(copy);
        return;
      }
      const tab = target.closest<HTMLElement>('[data-tab]');
      if (tab) select(tab.dataset.tab ?? 'email');
      else if (target.closest('[data-contact-close]')) close();
    };
    const onEvent = () => open();
    const onKey = (e: KeyboardEvent) => {
      if (root.hidden) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && document.activeElement?.hasAttribute('data-tab')) {
        // the arrow keys go through the tabs
        e.preventDefault();
        const at = tabButtons.indexOf(document.activeElement as HTMLElement);
        const next = tabButtons[(at + (e.key === 'ArrowRight' ? 1 : -1) + tabButtons.length) % tabButtons.length];
        select(next.dataset.tab ?? 'email', true);
      } else if (e.key === 'Tab') {
        // the focus stays inside the screen
        const items = Array.from(root.querySelectorAll<HTMLElement>('a[href], button, input:not(.cf-trap), textarea')).filter((n) => n.offsetParent !== null);
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    // The on-screen keyboard (phone, tablet) is drawn OVER the page: the layout does not shrink (iOS Safari, and Chrome Android since v108),
    // so the lower fields and the Send button sat behind it. The screen follows the visual viewport (the part that is really visible) while
    // the keyboard is up, and the field being written in is brought into view inside it, but only when it is not in view (when the keyboard comes
    // up or the person goes to another field). It must never pull the screen back while a finger is moving it: the person scrolls freely.
    const stage = root.querySelector<HTMLElement>('.contact-stage')!;
    const vv = window.visualViewport;
    const field = () => {
      const a = document.activeElement as HTMLElement | null;
      return a && form.contains(a) && a.matches('input, textarea') ? a : null;
    };
    const keepInView = () => {
      const f = field();
      if (!f) return;
      const seen = stage.getBoundingClientRect();
      const at = f.getBoundingClientRect();
      if (at.top < seen.top + 8 || at.bottom > seen.bottom - 8) f.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    let keyboardHeight = 0;
    const followViewport = () => {
      if (!vv) return;
      const up = !root.hidden && window.innerHeight - vv.height > 120;
      root.classList.toggle('kb', up);
      if (up) {
        root.style.setProperty('--vv-h', `${vv.height}px`);
        root.style.setProperty('--vv-top', `${vv.offsetTop}px`);
        if (vv.height !== keyboardHeight) keepInView(); // the keyboard has just come up or changed its height, not a scroll
        keyboardHeight = vv.height;
      } else {
        keyboardHeight = 0;
        root.style.removeProperty('--vv-h');
        root.style.removeProperty('--vv-top');
      }
    };
    const onFocusIn = () => {
      window.setTimeout(keepInView, 350); // after the keyboard has come up and the screen has been resized
    };
    // The message grows with what is written instead of scrolling inside itself: a box that scrolls its own text takes the finger's drag for itself,
    // and the screen could not be moved up from it.
    const messageBox = form.querySelector<HTMLTextAreaElement>('textarea')!;
    const grow = () => {
      messageBox.style.height = 'auto';
      messageBox.style.height = `${messageBox.scrollHeight}px`;
    };
    messageBox.addEventListener('input', grow);
    vv?.addEventListener('resize', followViewport);
    vv?.addEventListener('scroll', followViewport);
    form.addEventListener('focusin', onFocusIn);

    document.addEventListener('click', onClick);
    form.addEventListener('submit', onSubmit);
    document.addEventListener('open-contact-modal', onEvent);
    document.addEventListener('keydown', onKey);
    return () => {
      vv?.removeEventListener('resize', followViewport);
      vv?.removeEventListener('scroll', followViewport);
      form.removeEventListener('focusin', onFocusIn);
      messageBox.removeEventListener('input', grow);
      document.removeEventListener('click', onClick);
      form.removeEventListener('submit', onSubmit);
      document.removeEventListener('open-contact-modal', onEvent);
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(hideTimer);
      window.clearTimeout(copiedTimer);
      if (lenisStopped) getLenis()?.start();
      document.documentElement.classList.remove('contact-open');
    };
  }, '.contact');
