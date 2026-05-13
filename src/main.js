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
            const elementTop = el.getBoundingClientRect().top;

            if (elementTop < triggerBottom) {
                el.classList.add('active');
            }
        });
    };

    window.addEventListener('scroll', revealOnScroll);
    revealOnScroll(); // Initial check

    // --- Mobile Menu Toggle ---
    const menuToggle = document.getElementById('menuToggle');
    const navLinks = document.getElementById('navLinks');

    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
            // In a real modern app, we would use a more sophisticated transition here
            // but for simplicity we toggle display.
        });
    }

    // --- Smooth Scrolling for Navigation ---
    document.querySelectorAll('.nav-links a').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');

            if (href.startsWith('#')) {
                e.preventDefault();

                // Update active link
                document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
                this.classList.add('active');

                const targetId = href.substring(1);
                const targetElement = document.getElementById(targetId);

                if (targetElement) {
                    window.scrollTo({
                        top: targetElement.offsetTop - 80,
                        behavior: 'smooth'
                    });
                }
            }
        });
    });

    // --- Adding subtle parallax to Hero background ---
    window.addEventListener('scroll', () => {
        const scroll = window.scrollY;
        const hero = document.querySelector('.hero');
        if (hero) {
            hero.style.backgroundPositionY = `${scroll * 0.5}px`;
        }
    });

    // --- User Session Logic ---
    const loginBtn = document.getElementById('loginBtn');
    const updateLoginButton = () => {
        const userData = localStorage.getItem('aim_current_user');
        if (userData && loginBtn) {
            const user = JSON.parse(userData);
            // Mostrar saludo para todos los usuarios logueados
            loginBtn.textContent = `Hola, ${user.firstName || 'Usuario'}`;
            loginBtn.href = '#';
            loginBtn.style.pointerEvents = 'none'; // Hace que no parezca un enlace clickeable si no queremos que lo sea

            // Botón de Panel Admin (solo si el usuario tiene permiso)
            if (user.canAccessAdmin) {
                if (!document.getElementById('adminPanelBtn')) {
                    const adminBtn = document.createElement('a');
                    adminBtn.id = 'adminPanelBtn';
                    adminBtn.textContent = 'Panel Admin';
                    adminBtn.href = '/admin';
                    adminBtn.className = 'btn btn-outline';
                    adminBtn.style.marginLeft = '15px';
                    adminBtn.style.padding = '8px 15px';
                    adminBtn.style.fontSize = '0.9rem';

                    loginBtn.parentNode.appendChild(adminBtn);
                }
            }

            // Botón de Cerrar Sesión (para todos)
            if (!document.getElementById('logoutBtn')) {
                const logoutBtn = document.createElement('button');
                logoutBtn.id = 'logoutBtn';
                logoutBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i>';
                logoutBtn.title = 'Cerrar Sesión';
                logoutBtn.style.marginLeft = '15px';
                logoutBtn.style.background = 'transparent';
                logoutBtn.style.border = 'none';
                logoutBtn.style.color = 'inherit';
                logoutBtn.style.cursor = 'pointer';
                logoutBtn.style.fontSize = '1.2rem';
                logoutBtn.style.transition = 'color 0.3s ease';

                logoutBtn.addEventListener('mouseenter', () => logoutBtn.style.color = '#ff4d4d');
                logoutBtn.addEventListener('mouseleave', () => logoutBtn.style.color = 'inherit');

                logoutBtn.onclick = () => {
                    localStorage.removeItem('aim_current_user');
                    window.location.reload();
                };
                loginBtn.parentNode.appendChild(logoutBtn);
            }
        }
    };

    updateLoginButton();
    window.addEventListener('storage_updated', updateLoginButton);
});
