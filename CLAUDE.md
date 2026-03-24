# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal academic portfolio website for Roger Creus Castanyer (PhD student, AI/ML). Static single-page site deployed via GitHub Pages directly from the `main` branch — no build step, no framework, no package manager.

## Development

No build system. To develop locally, open `index.html` in a browser or run `python3 -m http.server`. Changes pushed to `main` deploy automatically via GitHub Pages.

## Architecture

**Single-page scrollable layout** — everything lives in `index.html` with styles in `main.css`.

- **Sections** are defined by anchor IDs: `#about`, `#news`, `#publications`, `#projects`
- **Navigation** is a custom sticky navbar with frosted-glass effect, Intersection Observer for active link highlighting, and a full-screen overlay menu on mobile
- **Styling** is framework-free custom CSS (no Bulma, no Tailwind) using CSS Grid and Flexbox
- **Typography** uses Inter (sans-serif, body) + Source Serif 4 (serif, headings) via Google Fonts CDN
- **Icons** from Font Awesome 6 Free (single CSS CDN)
- **Theming** via CSS custom properties in `:root`
- **No JavaScript frameworks** — vanilla JS for nav scroll detection, mobile menu, fade-in animations (Intersection Observer), news toggle, YouTube lazy-load, and abstract expand/collapse

## File Structure

- `index.html` — entire site content, structure, and inline JS
- `main.css` — all custom styles (variables, responsive breakpoints, component styles)
- `pics/` — publication thumbnails and profile photo
- `uploads/` — CV PDF

## Key Patterns

- Publications use `<details>/<summary>` for expandable abstracts (no JS needed)
- News section shows 6 most recent items; older items toggled via JS
- YouTube videos are lazy-loaded (thumbnail → iframe on click)
- Scroll-triggered fade-in animations via `.fade-in` class + Intersection Observer
- Responsive: mobile-first with breakpoints at 480px and 768px
- BEM-like naming: `.nav__link`, `.pub-card__title`, `.hero__sidebar`
