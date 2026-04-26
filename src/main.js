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
        anchor.addEventListener('click', function(e) {
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

    // --- View All Activities Logic ---
    const viewAllBtn = document.getElementById('viewAllActivitiesBtn');
    const hiddenActivities = document.querySelectorAll('.hidden-activity');
    let isExpanded = false;

    if (viewAllBtn) {
        viewAllBtn.addEventListener('click', () => {
            isExpanded = !isExpanded;
            hiddenActivities.forEach(el => {
                if (isExpanded) {
                    el.classList.add('show');
                } else {
                    el.classList.remove('show');
                }
            });
            
            viewAllBtn.textContent = isExpanded ? 'Ver menos' : 'Ver todas las actividades';
            
            if (!isExpanded) {
                // Scroll back to activities section if collapsing
                document.getElementById('actividades').scrollIntoView({behavior: 'smooth'});
            } else {
                // Trigger reveal for newly shown items
                setTimeout(revealOnScroll, 100);
            }
        });
    }

    // --- Activities Data & Modal Logic ---
    const activitiesData = {
        'taekwondo': {
            title: 'Taekwondo',
            icon: '<i class="fas fa-fist-raised" style="color: var(--color-green)"></i>',
            img: 'https://images.unsplash.com/photo-1555597673-b21d5c935865?auto=format&fit=crop&q=80&w=800',
            desc: 'Despierta tu fuerza interior y supera tus límites.',
            details: 'Nuestro programa de Taekwon-Do se enfoca en la disciplina, el respeto mutuo y la autodefensa. Impartido por instructores altamente cualificados, es ideal tanto para niños que buscan canalizar su energía como para adultos que desean mantenerse en forma y ganar seguridad.'
        },
        'ballet': {
            title: 'Ballet Clásico',
            icon: '<i class="fas fa-shoe-prints" style="color: var(--color-pink)"></i>',
            img: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&q=80&w=800',
            desc: 'Déjate llevar por la magia de la danza y la precisión.',
            details: 'El ballet es la base de todas las disciplinas de danza. Ofrecemos clases desde iniciación hasta niveles avanzados, enfocándonos en la técnica, la postura correcta, la flexibilidad y la expresión artística en un entorno muy cuidado.'
        },
        'ingles': {
            title: 'Inglés',
            icon: '<i class="fas fa-language" style="color: var(--color-blue)"></i>',
            img: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=800',
            desc: 'Aprende el idioma del mundo y comunica tus sueños.',
            details: 'Nuestras clases de inglés están diseñadas para ser dinámicas y altamente participativas. Preparamos a los alumnos para exámenes oficiales mediante inmersión lingüística, juegos y metodologías interactivas que aseguran el aprendizaje.'
        },
        'robotica': {
            title: 'Robótica',
            icon: '<i class="fas fa-robot" style="color: var(--color-yellow)"></i>',
            img: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&q=80&w=800',
            desc: 'Construye el futuro hoy con nuestras clases de tecnología.',
            details: 'Enseña a los más jóvenes el pensamiento lógico y la resolución de problemas a través de la programación y la construcción de robots. Una habilidad fundamental y estimulante para prepararlos para las profesiones del futuro.'
        },
        'pintura': {
            title: 'Pintura',
            icon: '<i class="fas fa-palette" style="color: var(--color-purple)"></i>',
            img: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&q=80&w=800',
            desc: 'Expresa tu creatividad a través de colores y formas.',
            details: 'Descubre diferentes técnicas pictóricas (acuarela, acrílico, óleo) en un ambiente relajado e inspirador. Nuestras clases de pintura fomentan la imaginación, mejoran la motricidad fina y cultivan el aprecio por el arte.'
        },
        'gimnasia': {
            title: 'Gimnasia Rítmica',
            icon: '<i class="fas fa-ribbon" style="color: var(--color-pink)"></i>',
            img: 'https://images.unsplash.com/photo-1518605368461-1ee7c5320d29?auto=format&fit=crop&q=80&w=800',
            desc: 'Flexibilidad, ritmo y expresión corporal en perfecta armonía.',
            details: 'Nuestra gimnasia rítmica combina elementos de ballet y danza junto con el uso de aparatos como la cuerda, el aro, la pelota, las mazas y la cinta. Una actividad excelente para mejorar la coordinación y la elegancia del movimiento.'
        },
        'kickboxing': {
            title: 'Kickboxing',
            icon: '<i class="fas fa-fire" style="color: var(--color-red)"></i>',
            img: 'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?auto=format&fit=crop&q=80&w=800',
            desc: 'Libera tensiones y mejora tu resistencia cardiovascular.',
            details: 'Un dinámico deporte de contacto que mezcla técnicas de boxeo con artes marciales. Es la actividad ideal para liberar el estrés diario, quemar calorías intensamente y aprender técnicas eficaces de defensa personal.'
        },
        'baile_moderno': {
            title: 'Baile Moderno',
            icon: '<i class="fas fa-music" style="color: var(--color-blue)"></i>',
            img: 'https://images.unsplash.com/photo-1508807526345-15e9b5f4eaff?auto=format&fit=crop&q=80&w=800',
            desc: 'Aprende las últimas coreografías y diviértete bailando.',
            details: 'Una mezcla vibrante de estilos urbanos y contemporáneos. Las clases se centran en el ritmo musical, la coordinación motriz y la expresión corporal, creando coreografías dinámicas y sobre todo, muy divertidas.'
        },
        'funcional': {
            title: 'Entrenamiento Funcional',
            icon: '<i class="fas fa-dumbbell" style="color: var(--color-green)"></i>',
            img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&q=80&w=800',
            desc: 'Mejora tu condición física general con ejercicios dinámicos.',
            details: 'Rutinas variadas basadas en movimientos cotidianos que involucran múltiples grupos musculares simultáneamente. Aumenta tu fuerza, resistencia, agilidad y equilibrio de forma altamente eficiente y segura.'
        },
        'pilates': {
            title: 'Pilates',
            icon: '<i class="fas fa-spa" style="color: var(--color-yellow)"></i>',
            img: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&q=80&w=800',
            desc: 'Fortalece tu core, mejora tu postura y gana flexibilidad.',
            details: 'El método Pilates se centra en el control mental profundo sobre el movimiento físico, la respiración coordinada y la alineación de la columna. Perfecto para prevenir lesiones, aliviar tensiones y mejorar el bienestar general.'
        },
        'campamento': {
            title: 'Campamento de Verano',
            icon: '<i class="fas fa-campground" style="color: #f97316"></i>',
            img: 'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?auto=format&fit=crop&q=80&w=800',
            desc: 'Diversión, aprendizaje y aventuras para los más pequeños.',
            details: 'Durante las vacaciones escolares, ofrecemos un campamento lleno de actividades multideportivas, talleres creativos, excursiones al aire libre y muchísima diversión en un entorno seguro, familiar y muy enriquecedor.'
        }
    };

    const modal = document.getElementById('activityModal');
    const closeModal = document.getElementById('closeModal');
    const cardLinks = document.querySelectorAll('.card-link');

    // Elementos del modal
    const modalTitle = document.getElementById('modalTitle');
    const modalIcon = document.getElementById('modalIcon');
    const modalImage = document.getElementById('modalImage');
    const modalDesc = document.getElementById('modalDesc');
    const modalDetails = document.getElementById('modalDetails');

    if (modal && cardLinks) {
        cardLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const activityId = link.getAttribute('data-activity');
                
                if (activityId && activitiesData[activityId]) {
                    const data = activitiesData[activityId];
                    
                    // Rellenar datos
                    modalTitle.textContent = data.title;
                    modalIcon.innerHTML = data.icon;
                    modalImage.src = data.img;
                    modalImage.alt = data.title;
                    modalDesc.textContent = data.desc;
                    modalDetails.textContent = data.details;
                    
                    // Mostrar modal
                    modal.classList.add('active');
                }
            });
        });

        // Cerrar modal
        closeModal.addEventListener('click', () => {
            modal.classList.remove('active');
        });

        // Cerrar al hacer clic fuera del contenido
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    }
});
