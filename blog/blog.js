// Shared behaviour for blog pages: mobile menu, dark-mode toggle,
// click-to-load YouTube embeds and theme-matched X embeds.
(function () {
    const burger = document.getElementById('navBurger');
    const links = document.getElementById('navLinks');

    // Mobile menu toggle
    burger.addEventListener('click', () => {
        const isOpen = links.classList.toggle('open');
        burger.classList.toggle('open', isOpen);
        burger.setAttribute('aria-expanded', isOpen);
        document.body.style.overflow = isOpen ? 'hidden' : '';
    });
    links.querySelectorAll('.nav__link').forEach(link => {
        link.addEventListener('click', () => {
            links.classList.remove('open');
            burger.classList.remove('open');
            burger.setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
        });
    });

    // Dark-mode toggle
    const themeToggle = document.getElementById('themeToggle');
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    themeToggle.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        if (themeMeta) themeMeta.setAttribute('content', next === 'dark' ? '#110f0e' : '#faf9f7');
        try { localStorage.setItem('theme', next); } catch (e) {}
    });

    // YouTube: thumbnail first, iframe only on click
    document.querySelectorAll('.yt-embed').forEach(btn => {
        btn.addEventListener('click', () => {
            const iframe = document.createElement('iframe');
            iframe.src = 'https://www.youtube-nocookie.com/embed/' + btn.dataset.yt + '?autoplay=1&rel=0';
            iframe.title = btn.getAttribute('aria-label') || 'YouTube video';
            iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
            iframe.allowFullscreen = true;
            iframe.className = 'yt-embed__frame';
            btn.replaceWith(iframe);
        });
    });

    // X embeds follow the page theme at load time
    const theme = document.documentElement.getAttribute('data-theme');
    document.querySelectorAll('blockquote.twitter-tweet').forEach(q => q.setAttribute('data-theme', theme));
})();
