export function initTheme() {
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeToggleMobileBtn = document.getElementById('theme-toggle-mobile');

    // Apply saved theme or system preference
    const currentTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

    if (currentTheme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }

    const toggleTheme = () => {
        document.documentElement.classList.toggle('dark');
        const isDark = document.documentElement.classList.contains('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    };

    const bindThemeToggle = (button) => {
        if (!button || button.dataset.themeBound === 'true') return;
        button.addEventListener('click', toggleTheme);
        button.dataset.themeBound = 'true';
    };

    bindThemeToggle(themeToggleBtn);
    bindThemeToggle(themeToggleMobileBtn);
}

export function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="flex items-center justify-between">
            <span>${message}</span>
            <button class="ml-4 focus:outline-none" onclick="this.parentElement.parentElement.remove()"><i class="fas fa-times"></i></button>
        </div>
    `;

    container.appendChild(toast);

    // Trigger reflow
    void toast.offsetWidth;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

export function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
}

export function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initScrollAnimations();

    // Mobile menu toggle
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenuBtn && mobileMenu) {
        const closeMobileMenu = () => {
            mobileMenu.classList.add('hidden');
            mobileMenuBtn.setAttribute('aria-expanded', 'false');
            document.body.classList.remove('mobile-menu-open');
        };

        const openMobileMenu = () => {
            mobileMenu.classList.remove('hidden');
            mobileMenuBtn.setAttribute('aria-expanded', 'true');
            document.body.classList.add('mobile-menu-open');
        };

        mobileMenuBtn.setAttribute('aria-controls', 'mobile-menu');
        mobileMenuBtn.setAttribute('aria-expanded', 'false');

        mobileMenuBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            if (mobileMenu.classList.contains('hidden')) {
                openMobileMenu();
                return;
            }
            closeMobileMenu();
        });

        mobileMenu.querySelectorAll('a, button').forEach((item) => {
            item.addEventListener('click', () => {
                if (window.innerWidth < 768) {
                    closeMobileMenu();
                }
            });
        });

        document.addEventListener('click', (event) => {
            if (mobileMenu.classList.contains('hidden')) return;
            const clickedInsideMenu = mobileMenu.contains(event.target);
            const clickedMenuButton = mobileMenuBtn.contains(event.target);
            if (!clickedInsideMenu && !clickedMenuButton) {
                closeMobileMenu();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeMobileMenu();
            }
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth >= 768) {
                closeMobileMenu();
            }
        });
    }
});
