document.addEventListener('DOMContentLoaded', () => {
    // --- Navbar Scroll Effect ---
    const navbar = document.getElementById('navbar');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // --- Reveal on Scroll ---
    const revealElements = document.querySelectorAll('.reveal');

    const revealOnScroll = () => {
        const triggerBottom = window.innerHeight * 0.85;
        revealElements.forEach(el => {
            if (el.getBoundingClientRect().top < triggerBottom) {
                el.classList.add('active');
            }
        });
    };

    window.addEventListener('scroll', revealOnScroll);
    revealOnScroll();

    // --- Mobile Menu Toggle ---
    const menuToggle = document.getElementById('menuToggle');
    const navLinks = document.getElementById('navLinks');

    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
        });
    }

    // --- Smooth Scrolling ---
    document.querySelectorAll('.nav-links a').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href.startsWith('#')) {
                e.preventDefault();
                document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
                this.classList.add('active');
                const targetElement = document.getElementById(href.substring(1));
                if (targetElement) {
                    window.scrollTo({ top: targetElement.offsetTop - 80, behavior: 'smooth' });
                }
            }
        });
    });

    // --- Parallax Hero ---
    window.addEventListener('scroll', () => {
        const hero = document.querySelector('.hero');
        if (hero) hero.style.backgroundPositionY = `${window.scrollY * 0.5}px`;
    });

    // --- User Session (via /api/me — reads httpOnly cookie, never localStorage) ---
    const loginBtn = document.getElementById('loginBtn');

    const updateNavbar = async () => {
        try {
            const res = await fetch('/api/me');
            if (!res.ok) return;
            const user = await res.json();

            if (loginBtn) {
                loginBtn.textContent = `Hola, ${user.firstName || 'Usuario'}`;
                loginBtn.href = '#';
                loginBtn.style.pointerEvents = 'none';
            }

            if (user.canAccessAdmin && !document.getElementById('adminPanelBtn')) {
                const adminBtn = document.createElement('a');
                adminBtn.id = 'adminPanelBtn';
                adminBtn.textContent = 'Panel Admin';
                adminBtn.href = '/admin';
                adminBtn.className = 'btn btn-outline';
                adminBtn.style.cssText = 'margin-left:15px;padding:8px 15px;font-size:0.9rem;';
                loginBtn.parentNode.appendChild(adminBtn);
            }

            if (!document.getElementById('logoutBtn')) {
                const logoutBtn = document.createElement('button');
                logoutBtn.id = 'logoutBtn';
                logoutBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i>';
                logoutBtn.title = 'Cerrar Sesión';
                logoutBtn.style.cssText = 'margin-left:15px;background:transparent;border:none;color:inherit;cursor:pointer;font-size:1.2rem;transition:color 0.3s ease;';
                logoutBtn.addEventListener('mouseenter', () => logoutBtn.style.color = '#ff4d4d');
                logoutBtn.addEventListener('mouseleave', () => logoutBtn.style.color = 'inherit');
                logoutBtn.onclick = async () => {
                    await fetch('/api/logout', { method: 'POST' }).catch(() => {});
                    localStorage.removeItem('aim_current_user');
                    window.location.reload();
                };
                loginBtn.parentNode.appendChild(logoutBtn);
            }
        } catch (e) {
            // Not logged in or network error — show default button
        }
    };

    updateNavbar();

    // --- Latest News Section ---
    const newsList = document.getElementById('newsDynamic');
    const newsMoreLink = document.getElementById('newsMoreLink');

    const loadNews = async () => {
        if (!newsList) return;
        try {
            const res = await fetch('/api/posts?limit=4');
            if (!res.ok) throw new Error();
            const posts = await res.json();

            if (posts.length === 0) {
                newsList.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;">No hay noticias publicadas aún.</p>';
                return;
            }

            newsList.innerHTML = posts.map(post => {
                const date = post.published_at
                    ? new Date(post.published_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
                    : '';
                return `
                <div class="news-item">
                    <div class="news-date">${date}</div>
                    <div class="news-info">
                        <h4>${escapeHtml(post.title)}</h4>
                        ${post.excerpt ? `<p>${escapeHtml(post.excerpt)}</p>` : ''}
                        <a href="/noticias/${post.slug}" data-post-id="${post.id}" class="news-read-more" style="font-size:0.8rem;color:var(--color-green);font-weight:600;text-decoration:none;margin-top:4px;display:inline-block;">Leer más →</a>
                    </div>
                </div>`;
            }).join('');

            // Track clicks
            newsList.querySelectorAll('.news-read-more').forEach(link => {
                link.addEventListener('click', function (e) {
                    e.preventDefault();
                    const id = this.dataset.postId;
                    const href = this.href;
                    fetch('/api/posts/' + id + '/click', { method: 'POST' }).finally(() => {
                        window.location.href = href;
                    });
                });
            });

            if (newsMoreLink) newsMoreLink.href = '/noticias';
        } catch {
            if (newsList) newsList.innerHTML = '';
        }
    };

    loadNews();
});

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
