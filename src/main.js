// ── Scroll: header shadow + active nav ──────────────────────────────────────
const navbar   = document.getElementById('navbar');
const navLinks = document.querySelectorAll('#mainNav a');
const sections = ['inicio', 'actividades', 'noticias', 'nosotros', 'contacto'];

window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
    let current = '';
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el && window.scrollY >= el.offsetTop - 120) current = id;
    });
    navLinks.forEach(a => {
        a.classList.toggle('is-active', a.getAttribute('href') === `#${current}`);
    });
}, { passive: true });

// ── Smooth scroll ────────────────────────────────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
        const id = a.getAttribute('href').slice(1);
        const target = document.getElementById(id);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        mobileNav.classList.remove('open');
    });
});

// ── Mobile menu ──────────────────────────────────────────────────────────────
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileNav     = document.getElementById('mobileNav');
mobileMenuBtn.addEventListener('click', () => mobileNav.classList.toggle('open'));

// ── Fade-up on scroll ─────────────────────────────────────────────────────────
const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
        }
    });
}, { threshold: 0.12 });

document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));

// ── User session ─────────────────────────────────────────────────────────────
const loginBtn = document.getElementById('loginBtn');

(async () => {
    try {
        const res = await fetch('/api/me');
        if (!res.ok) return;
        const user = await res.json();
        if (loginBtn) {
            loginBtn.textContent = `Hola, ${user.firstName || 'Usuario'}`;
            loginBtn.href = '/admin';
        }
    } catch { /* not logged in */ }
})();

// ── News loader ───────────────────────────────────────────────────────────────
const CAT_BG = {
    general: 'bg-general', club: 'bg-club',
    taekwondo: 'bg-taekwondo', ballet: 'bg-ballet',
    ingles: 'bg-ingles', robotica: 'bg-robotica',
    funcional: 'bg-funcional', pintura: 'bg-pintura',
    camaleon: 'bg-camaleon', shelfie: 'bg-shelfie',
};
const CAT_ACT = {
    taekwondo: 'act-taekwondo', ballet: 'act-ballet',
    ingles: 'act-ingles', robotica: 'act-robotica',
    funcional: 'act-funcional', pintura: 'act-pintura',
    camaleon: 'act-camaleon',
};
const CAT_LABEL = {
    general: 'General', club: 'Club', taekwondo: 'Taekwondo',
    ballet: 'Ballet', ingles: 'Inglés', robotica: 'Robótica',
    funcional: 'Funcional', pintura: 'Pintura', camaleon: 'Camaleón', shelfie: 'Shelfie',
};

function esc(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(iso) {
    const d = new Date(iso);
    return {
        d: String(d.getDate()).padStart(2, '0'),
        m: d.toLocaleDateString('es-ES', { month: 'short' }).slice(0, 3).toUpperCase(),
    };
}

async function loadNews() {
    const grid = document.getElementById('newsDynamic');
    if (!grid) return;
    try {
        const res = await fetch('/api/posts?limit=3');
        if (!res.ok) throw new Error();
        const posts = await res.json();
        if (!posts.length) {
            grid.innerHTML = '<p style="color:var(--ink-3);font-size:14px;grid-column:1/-1;padding:12px 0;">No hay noticias publicadas aún.</p>';
            return;
        }
        grid.innerHTML = posts.map(post => {
            const cat    = post.category || 'general';
            const bgCls  = CAT_BG[cat]  || 'bg-general';
            const actCls = CAT_ACT[cat] || '';
            const label  = CAT_LABEL[cat] || cat;
            const { d, m } = fmtDate(post.published_at || post.created_at);
            const img = post.cover_image_url
                ? `<img src="${esc(post.cover_image_url)}" alt="${esc(post.title)}" loading="lazy">`
                : '';
            return `<a href="/noticias/${esc(post.slug)}" class="news-card ${actCls}" data-post-id="${esc(post.id)}">
  <div class="img ${bgCls}">${img}<div class="badge-date"><div class="d">${d}</div><div class="m">${m}</div></div></div>
  <div class="body">
    <span class="cat">${esc(label)}</span>
    <h4>${esc(post.title)}</h4>
    ${post.excerpt ? `<p>${esc(post.excerpt)}</p>` : ''}
  </div>
</a>`;
        }).join('');

        // Track clicks
        grid.querySelectorAll('.news-card[data-post-id]').forEach(card => {
            card.addEventListener('click', e => {
                e.preventDefault();
                const href = card.href;
                fetch(`/api/posts/${card.dataset.postId}/click`, { method: 'POST' })
                    .finally(() => { window.location.href = href; });
            });
        });

        // Animate new cards
        grid.querySelectorAll('.news-card').forEach((el, i) => {
            el.classList.add('fade-up', `d${(i % 3) + 1}`);
            observer.observe(el);
        });
    } catch { /* silently clear skeletons */ }
}

loadNews();
