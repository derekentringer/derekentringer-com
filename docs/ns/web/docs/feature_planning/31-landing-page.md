# 31 — Landing Page & Marketing Site

**Status:** Planned
**Phase:** Phase 1 — Launch Readiness
**Priority:** High
**Depends on:** Feature plan 30 (Branding & Domain Migration)

## Summary

Public-facing marketing site at the new .com domain. Explains what the product is, shows screenshots/videos, drives signups. Separate from the app itself — this is the front door for new users.

## Structure

### Pages

1. **Homepage** — hero section with tagline, key screenshots, feature highlights, CTA to sign up
2. **Features** — detailed breakdown with screenshots: AI features, live preview, cross-platform, wiki-links, command palette
3. **Pricing** — free/personal/pro tiers with feature comparison table
4. **Download** — desktop (macOS DMG, Windows coming soon) and mobile (App Store, Play Store) links
5. **Blog** — launch announcement, feature updates, tips & workflows (SEO content)
6. **Changelog** — public version history
7. **Comparison pages** (SEO) — "vs Obsidian", "vs Notion", "vs Bear", "vs Standard Notes"

### Tech Stack Options

- **Option A:** Static site with Astro or Next.js, deployed to Cloudflare Pages or Vercel (separate from app)
- **Option B:** Add marketing routes to the existing Vite app (simpler but mixes concerns)
- **Recommended:** Option A — keeps marketing site fast, SEO-optimized, and independent from the app

### Key Elements

- Screenshots of dark and light themes
- Short demo video or GIF (AI completions, live preview, command palette)
- Social proof section (once available — testimonials, user count, GitHub stars)
- "Built by a developer, for developers" positioning
- Privacy-first messaging (self-hosted option, no data selling)

## SEO Strategy

Target keywords:
- "AI note taking app"
- "markdown note app"
- "note taking app with AI"
- "obsidian alternative"
- "best note taking app 2026"
- "self-hosted note app"
- "note app with wiki links"

Each comparison page targets "[product] vs [product]" searches.

## Verification

- Google Lighthouse score >90 on all pages
- Mobile responsive
- Open Graph meta tags for social sharing
- Sitemap.xml and robots.txt
- Google Search Console setup
