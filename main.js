/* HJ TRENDING — SHARED JS */

document.addEventListener('DOMContentLoaded', function () {

  // ── BACK TO TOP ──
  const backTop = document.getElementById('backTop');
  if (backTop) {
    window.addEventListener('scroll', () => {
      backTop.classList.toggle('visible', window.scrollY > 400);
    });
    backTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  // ── NAVBAR SHADOW ──
  const navWrap = document.querySelector('.nav-wrap');
  if (navWrap) {
    window.addEventListener('scroll', () => {
      navWrap.style.boxShadow = window.scrollY > 10 ? '0 2px 24px rgba(0,0,0,.1)' : 'none';
    });
  }

  // ── SEARCH OVERLAY ──
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

  // ── MOBILE MENU ──
  const burgerBtn = document.getElementById('burgerBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  const mobileClose = document.getElementById('mobileClose');
  if (burgerBtn && mobileMenu) {
    burgerBtn.addEventListener('click', () => mobileMenu.classList.add('open'));
    mobileClose && mobileClose.addEventListener('click', () => mobileMenu.classList.remove('open'));
  }

  // ── NEWSLETTER ──
  document.querySelectorAll('.nl-form').forEach(form => {
    const input = form.querySelector('input[type="email"]');
    const btn = form.querySelector('button');
    if (!input || !btn) return;
    btn.addEventListener('click', () => {
      if (input.value && input.value.includes('@')) {
        const orig = btn.textContent;
        btn.textContent = '✓ You\'re in!';
        btn.style.background = '#00C853';
        input.value = '';
        setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 3000);
      } else {
        input.style.borderColor = '#E8002D';
        setTimeout(() => { input.style.borderColor = ''; }, 2000);
      }
    });
  });

  // ── CATEGORY FILTER (homepage) ──
  window.filterCat = function (btn, cat) {
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('[data-cat]').forEach(el => {
      el.style.display = (cat === 'all' || el.dataset.cat === cat) ? '' : 'none';
    });
  };

  // ── READING PROGRESS (article page) ──
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

  // ── AUTO READ TIME ──
  if (articleBody) {
    const words = articleBody.innerText.split(/\s+/).length;
    const mins = Math.max(1, Math.ceil(words / 200));
    document.querySelectorAll('.js-read-time').forEach(el => { el.textContent = mins + ' min read'; });
  }

  // ── SHARE BUTTONS ──
  document.querySelectorAll('.share-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      const type = this.dataset.share;
      const url = encodeURIComponent(window.location.href);
      const title = encodeURIComponent(document.title);
      if (type === 'twitter') window.open(`https://twitter.com/intent/tweet?text=${title}&url=${url}`, '_blank');
      if (type === 'facebook') window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
      if (type === 'whatsapp') window.open(`https://wa.me/?text=${title}%20${url}`, '_blank');
      if (type === 'copy') {
        navigator.clipboard.writeText(window.location.href).then(() => {
          const orig = this.textContent;
          this.textContent = '✓ Copied!';
          this.style.background = 'var(--black)';
          this.style.color = 'var(--white)';
          setTimeout(() => { this.textContent = orig; this.style.background = ''; this.style.color = ''; }, 2000);
        });
      }
    });
  });

  // ── LOAD MORE ──
  window.loadMore = function (btn, containerId, items) {
    btn.innerHTML = '<span>Loading...</span>';
    setTimeout(() => {
      const container = document.getElementById(containerId);
      items.forEach(item => {
        const el = document.createElement('article');
        el.className = 'card-row';
        el.dataset.cat = item.cat || '';
        el.innerHTML = `
          <a href="${item.href||'#'}" class="card-row__img ph ${item.ph}"><div class="ph"><span>${item.img}</span></div></a>
          <div>
            <div class="card-row__cat ${item.catClass}">${item.catLabel}</div>
            <h3 class="card-row__title"><a href="${item.href||'#'}">${item.title}</a></h3>
            <div class="card-row__meta">Hamza Jadoon · ${item.meta}</div>
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
