/* HJ TRENDING  SHARED JS */

document.addEventListener('DOMContentLoaded', function () {

  async function copyCurrentUrl(btn) {
    const originalText = btn ? btn.textContent : '';
    const setState = (text, ok = true) => {
      if (!btn) return;
      btn.textContent = text;
      btn.style.background = ok ? 'var(--black)' : '#E8002D';
      btn.style.color = 'var(--white)';
      setTimeout(() => {
        btn.textContent = originalText || 'Copy Link';
        btn.style.background = '';
        btn.style.color = '';
      }, 1800);
    };

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(window.location.href);
        setState('Copied!', true);
        return true;
      }
      throw new Error('Clipboard API unavailable');
    } catch (_) {
      try {
        const input = document.createElement('input');
        input.value = window.location.href;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        setState('Copied!', true);
        return true;
      } catch (err) {
        // Final fallback so users can still manually copy.
        window.prompt('Copy this link:', window.location.href);
        setState('Copy manually', false);
        return false;
      }
    }
  }

  async function sendSubscriptionEmail(email) {
    const payload = {
      name: 'HJ Trending Subscriber',
      email,
      subject: 'New HJ Trending subscriber',
      message: `New subscriber email: ${email}\nPage: ${window.location.href}\nTime: ${new Date().toISOString()}`,
      _captcha: 'false',
      _template: 'table'
    };

    const res = await fetch('https://formsubmit.co/ajax/hamzajadoon71@gmail.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Subscription request failed');
    return true;
  }

  //  BACK TO TOP 
  const backTop = document.getElementById('backTop');
  if (backTop) {
    window.addEventListener('scroll', () => {
      backTop.classList.toggle('visible', window.scrollY > 400);
    });
    backTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  //  NAVBAR SHADOW 
  const navWrap = document.querySelector('.nav-wrap');
  if (navWrap) {
    window.addEventListener('scroll', () => {
      navWrap.style.boxShadow = window.scrollY > 10 ? '0 2px 24px rgba(0,0,0,.1)' : 'none';
    });
  }

  //  SEARCH OVERLAY 
  const searchBtn = document.getElementById('searchBtn');
  const searchOverlay = document.getElementById('searchOverlay');
  const searchClose = document.getElementById('searchClose');
  const searchInput = document.getElementById('searchInput');
  if (searchBtn && searchOverlay) {
    searchBtn.addEventListener('click', () => {
      searchOverlay.classList.add('open');
      setTimeout(() => searchInput && searchInput.focus(), 100);
    });
    searchClose && searchClose.addEventListener('click', () => searchOverlay.classList.remove('open'));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') searchOverlay.classList.remove('open'); });
    searchOverlay.addEventListener('click', e => { if (e.target === searchOverlay) searchOverlay.classList.remove('open'); });
  }

  //  MOBILE MENU 
  const burgerBtn = document.getElementById('burgerBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  const mobileClose = document.getElementById('mobileClose');
  if (burgerBtn && mobileMenu) {
    burgerBtn.addEventListener('click', () => mobileMenu.classList.add('open'));
    mobileClose && mobileClose.addEventListener('click', () => mobileMenu.classList.remove('open'));
  }

  //  NEWSLETTER 
  document.querySelectorAll('.nl-form, .newsletter-form').forEach(form => {
    const input = form.querySelector('input[type="email"]');
    const btn = form.querySelector('button');
    if (!input || !btn) return;
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (input.value && input.value.includes('@')) {
        const orig = btn.textContent;
        const email = input.value.trim();
        btn.disabled = true;
        btn.textContent = 'Sending...';
        try {
          await sendSubscriptionEmail(email);
          btn.textContent = ' You\'re in!';
          btn.style.background = '#00C853';
          input.value = '';
        } catch (_) {
          // Fallback when remote form endpoint is blocked/unavailable.
          const subject = encodeURIComponent('New HJ Trending subscriber');
          const body = encodeURIComponent(`Subscriber email: ${email}\nPage: ${window.location.href}`);
          window.location.href = `mailto:hamzajadoon71@gmail.com?subject=${subject}&body=${body}`;
          btn.textContent = 'Email app opened';
          btn.style.background = '#2563eb';
        }
        setTimeout(() => {
          btn.textContent = orig;
          btn.style.background = '';
          btn.disabled = false;
        }, 2800);
      } else {
        input.style.borderColor = '#E8002D';
        setTimeout(() => { input.style.borderColor = ''; }, 2000);
      }
    });
  });

  //  CATEGORY FILTER (homepage) 
  window.filterCat = function (btn, cat) {
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('[data-cat]').forEach(el => {
      el.style.display = (cat === 'all' || el.dataset.cat === cat) ? '' : 'none';
    });
  };

  //  READING PROGRESS (article page) 
  const readingBar = document.getElementById('readingBar');
  const articleBody = document.querySelector('.article-body');
  if (readingBar && articleBody) {
    window.addEventListener('scroll', () => {
      const top = articleBody.getBoundingClientRect().top + window.scrollY;
      const height = articleBody.offsetHeight;
      const progress = Math.min(100, Math.max(0, ((window.scrollY - top) / height) * 100));
      readingBar.style.width = progress + '%';
    });
  }

  //  AUTO READ TIME 
  if (articleBody) {
    const words = articleBody.innerText.split(/\s+/).length;
    const mins = Math.max(1, Math.ceil(words / 200));
    document.querySelectorAll('.js-read-time').forEach(el => { el.textContent = mins + ' min read'; });
  }

  //  SHARE BUTTONS 
  document.querySelectorAll('.share-btn').forEach(btn => {
    btn.addEventListener('click', function (e) {
      const type = this.dataset.share ||
        (this.classList.contains('share-twitter') ? 'twitter' :
         this.classList.contains('share-facebook') ? 'facebook' :
         this.classList.contains('share-whatsapp') ? 'whatsapp' :
         this.classList.contains('share-copy') ? 'copy' : '');
      if (!type) return;

      if (this.tagName === 'A') {
        // Prevent "#" anchors from jumping to top.
        e.preventDefault();
      }

      const url = encodeURIComponent(window.location.href);
      const title = encodeURIComponent(document.title);
      if (type === 'twitter') window.open(`https://twitter.com/intent/tweet?text=${title}&url=${url}`, '_blank');
      if (type === 'facebook') window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
      if (type === 'whatsapp') window.open(`https://wa.me/?text=${title}%20${url}`, '_blank');
      if (type === 'copy') copyCurrentUrl(this);
    });
  });

  // Handle inline copy-link buttons that don't have data-share.
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('button, a');
    if (!btn) return;
    const text = (btn.textContent || '').toLowerCase();
    const isCopyBtn = btn.dataset.share === 'copy' || btn.classList.contains('sh-cp') || text.includes('copy link');
    if (!isCopyBtn) return;
    e.preventDefault();
    copyCurrentUrl(btn);
  });

  //  LOAD MORE 
  window.loadMore = function (btn, containerId, items) {
    btn.innerHTML = '<span>Loading...</span>';
    setTimeout(() => {
      const container = document.getElementById(containerId);
      items.forEach(item => {
        const el = document.createElement('article');
        el.className = 'card-row';
        el.dataset.cat = item.cat || '';
        const rowImage = item.thumb
          ? `<img src="${item.thumb}" alt="${item.title}">`
          : `<div class="ph"><span>${item.img}</span></div>`;
        el.innerHTML = `
          <a href="${item.href||'#'}" class="card-row__img ${item.thumb ? '' : `ph ${item.ph || ''}`}">${rowImage}</a>
          <div>
            <div class="card-row__cat ${item.catClass}">${item.catLabel}</div>
            <h3 class="card-row__title"><a href="${item.href||'#'}">${item.title}</a></h3>
            <div class="card-row__meta">Hamza Jadoon  ${item.meta}</div>
          </div>`;
        container.appendChild(el);
      });
      btn.innerHTML = 'No More Stories';
      btn.disabled = true;
      btn.style.opacity = '.5';
      btn.style.cursor = 'default';
    }, 700);
  };

});
