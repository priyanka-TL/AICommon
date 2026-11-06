# CLAUDE.md — AI Sandbox Prototype

Read this file before building or changing any page. Every page must follow it. If a rule here conflicts with a library default, this file wins.

## 1. What we are building

**AI Sandbox**: a shared, multi-tenant AI infrastructure prototype, presented by ShikshaLokam to partner organisations. Organisations use it to develop, test (functional + load), evaluate and pilot AI capabilities without building their own platform.

- Audience for the demo: NGOs, social entrepreneurs, funders. It must feel **professional, calm, trustworthy and warm**, not like a hacker tool and not like a marketing site.
- Two roles only: **Admin** (ShikshaLokam platform staff) and **User** (developer inside one organisation/tenant).
- Every user, environment and request belongs to a **tenant** (organisation).
- No backend, no database. All data is mock data.

## 2. Tech stack (fixed)

- React + TypeScript + Vite
- Tailwind CSS + shadcn/ui (restyled with the tokens below; never ship shadcn's default zinc look)
- Zustand for in-memory state, so actions in one role show up in the other role's views within the same session
- recharts for charts, lucide-react for icons
- React Router with role-based route guards

### Folder structure
```
src/
  data/          seed.ts (all mock data, one place)
  store/         useAppStore.ts (Zustand: auth, tenants, users, requests, environments, catalog)
  components/
    layout/      AppShell, Sidebar, Topbar, PageHeader
    ui/          shadcn components, restyled
    shared/      StatusBadge, KpiCard, EmptyState, CostEstimate, QuotaBar, DataTable
  pages/
    auth/        Login, ForgotPassword
    admin/       Dashboard, Tenants, TenantDetail, Users, Requests, Environments, Catalog, Providers
    user/        Dashboard, NewEnvironment (wizard), EnvironmentDetail, Catalog, Playground, Testing, MyRequests
  lib/           format.ts (currency ₹, dates, numbers in Indian format)
```

## 3. Brand foundation

The visual language is adapted from the shikshagraha brand toolkit (https://shikshagraha.org/toolkit/). That brand was designed for a public movement website, so this file adapts it for a dense product UI. **Do not copy the marketing site's loud, full-bleed colour fields into app screens.**

### 3.1 Logo
- Do **not** use the shikshagraha logo or dandelion mark. This product is not a shikshagraha initiative, and their brand book requires approval for logo use.
- Use a text wordmark: "AI Sandbox" in Comfortaa 700, Indigo, with a small "by ShikshaLokam" line in Source Sans 3 400, muted text.
- Leave a clearly marked slot so the real ShikshaLokam logo can be dropped in later.

### 3.2 Colour tokens

Brand colours (exact hex from the toolkit):

| Token | Hex | Role in this app |
|---|---|---|
| `indigo` | `#572E91` | **Primary.** Buttons, active nav, links, headings, key icons |
| `purple` | `#99459A` | Secondary emphasis, gradient partner to indigo, "change requested" state |
| `pink` | `#ED2388` | Focus rings, tiny highlights, large numbers only. **Never body text** |
| `red` | `#D11F44` | Errors, destructive actions, rejected state |
| `vermilion` | `#EE4533` | Warnings that need attention (over-quota) |
| `tangerine` | `#FF9911` | Pending state fill, highlights. **Never text on white** |
| `yellow` | `#FFDE59` | Only on indigo backgrounds (e.g., login panel highlight). **Never on white** |
| `teal` | `#00DDBB` | Charts, running-state fills. **Never text on white** |
| `cyan` | `#33DCEE` | Charts only |
| `blue` | `#1177FF` | Charts, provisioning state fill, info |
| `clay` | `#CA7862` | Charts, muted fills |
| `terracotta` | `#961C00` | Charts when a heavy colour is needed |

Neutrals and status shades (derived for UI; not in the brand book):

```
--bg-page:        #F8F6FB   /* very light indigo-tinted grey */
--bg-surface:     #FFFFFF   /* cards, tables, panels */
--bg-subtle:      #F1EDF7   /* table header, hover rows, wizard side panel */
--border:         #E6E1EE
--border-strong:  #CFC6DD
--text-primary:   #1F1530   /* body text: near-black with an indigo tint */
--text-secondary: #5B5566
--text-muted:     #857F90
--indigo-hover:   #47257A
--indigo-50:      #EEE8F6   /* selected rows, active nav background */
```

Tailwind config: add all of the above under `theme.extend.colors`, using the token names (`bg-indigo`, `text-text-secondary`, etc.). Never hard-code hex values in components.

### 3.3 Contrast rules (from the brand book; non-negotiable)
- On white: only **indigo, purple, red, terracotta** and the neutrals may be used for normal-size text.
- **Pink, vermilion, blue, clay**: large text (≥ 24px) or non-text only.
- **Tangerine, yellow, teal, cyan**: never as text on white. Use them as fills with dark text, or as text only on indigo.
- Text on indigo backgrounds: white, yellow, teal or cyan.

### 3.4 Status badges (use the `StatusBadge` component everywhere)

Pill shape, tinted background + dark text, 12px semibold, with a 6px dot in the base colour.

| Status | Background | Text | Dot |
|---|---|---|---|
| Pending | `#FFF1DD` | `#8A4B00` | tangerine |
| Approved | `#EEE8F6` | `#572E91` | indigo |
| Provisioning | `#E3EEFF` | `#0B4FB0` | blue (animated pulse) |
| Running | `#DDFAF4` | `#00695A` | teal |
| Stopped | `#F1EFF4` | `#5B5566` | `#857F90` |
| Rejected | `#FCE4E9` | `#D11F44` | red |
| Change requested | `#F7E9F7` | `#99459A` | purple |
| Over quota | `#FDE7E3` | `#B5301F` | vermilion |

### 3.5 Chart palette
Series order: `indigo, teal, tangerine, blue, pink, clay, cyan, terracotta`. Gridlines `--border`, axis labels `--text-muted` 12px. No 3D, no gradients inside bars. Tooltips use the card style.

## 4. Typography

Fonts (Google Fonts, both free):
```html
<link href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@400;600;700&family=Source+Sans+3:ital,wght@0,300;0,400;0,600;0,700;1,400&display=swap" rel="stylesheet">
```
- **Comfortaa**: headings, page titles, KPI numbers, wordmark. Rounded and warm.
- **Source Sans 3**: everything else: body, labels, tables, buttons, forms, badges, code-adjacent UI.
- **JetBrains Mono** (or system mono): API keys, endpoints, code snippets only.

The brand's website scale (50/30/22/20px) is too large for a product UI. Use this app scale:

| Use | Font | Size / line-height | Weight |
|---|---|---|---|
| Page title (H1) | Comfortaa | 28 / 36 | 700 |
| Section title (H2) | Comfortaa | 22 / 30 | 700 |
| Card title (H3) | Comfortaa | 17 / 24 | 600 |
| KPI number | Comfortaa | 32 / 38 | 700 |
| Eyebrow | Source Sans 3, uppercase, tracking 0.08em | 12 / 16 | 600 |
| Body | Source Sans 3 | 15 / 24 | 400 |
| Body small / table cells | Source Sans 3 | 14 / 20 | 400 |
| Labels, buttons | Source Sans 3 | 14 / 20 | 600 |
| Caption, helper text | Source Sans 3 | 13 / 18 | 400 |

- Numbers in tables use Source Sans 3 with `font-variant-numeric: tabular-nums`, right-aligned.
- Comfortaa runs optically small. If a heading looks weak, raise its size; don't make the body smaller.
- Never use Comfortaa for paragraphs, table cells or form inputs.

## 5. Layout & spacing

- 4px base grid. Common spacings: 4, 8, 12, 16, 24, 32, 48.
- App shell: left sidebar 256px (collapsible to 72px icons-only), top bar 64px, content max-width 1360px, page padding 32px desktop / 16px mobile.
- Page structure, always in this order: `PageHeader` (eyebrow + H1 + one-line description + primary action on the right) → filters/tabs → content.
- Cards: white surface, 1px `--border`, radius **14px**, padding 24px, shadow `0 1px 2px rgba(31,21,48,0.06)`. Hover on clickable cards: shadow `0 6px 20px rgba(87,46,145,0.10)` and border `--border-strong`.
- Radius: cards 14px, buttons and inputs 10px, badges/pills fully rounded, modals 16px.
- Responsive: sidebar becomes a drawer below 1024px; tables become stacked cards below 768px.

## 6. Components

**Buttons**
- Primary: indigo background, white text; hover `--indigo-hover`. One primary button per view.
- Secondary: white background, indigo text, 1px `--border-strong`.
- Ghost: no border, `--text-secondary`, hover `--bg-subtle`.
- Destructive: red background, white text; always behind a confirmation dialog.
- Height 40px (36px compact in tables). Icon + label, icon 16px.
- Focus ring for every interactive element: 2px pink `#ED2388` outline with 2px offset.

**Sidebar**: white background, right border. Active item: `--indigo-50` background, indigo text, 3px indigo left bar. Section labels as eyebrows. Shows tenant name and role at the bottom.

**Top bar**: page breadcrumb on the left; global search, notifications bell (pink dot for unread) and user menu on the right.

**Tables**: header row `--bg-subtle`, 13px semibold `--text-secondary`; rows 52px; zebra off; hover `--bg-subtle`; row click opens a detail drawer from the right (width 520px).

**Forms**: label above the input, helper text below, error in red with an icon. Inputs: white background, 1px `--border-strong`, focus border indigo + pink ring. Required fields marked with a small "Required" tag, not an asterisk.

**Wizard (New environment)**: vertical stepper on the left; form in the centre; sticky **CostEstimate** panel on the right (`--bg-subtle`, shows credits/month, GPU-hours, and the tenant's quota remaining). Back / Next at the bottom; "Save draft" as ghost.

**Selectable cards (models, ASR, libraries)**: logo placeholder (initials in a tinted circle; no real vendor logos), name, one-line description, tags (licence, "Open source" / "Hosted API", languages), GitHub link icon. Selected state: 2px indigo border + check icon in the top-right.

**KPI card**: eyebrow label, Comfortaa number, small trend line beneath in `--text-secondary` (green-free: use teal arrow for up, vermilion for down).

**QuotaBar**: indigo fill; turns tangerine above 80%, vermilion above 95%.

**Empty states**: simple flat illustration (solid fills, bold black outlines, as the brand book specifies) or a large lucide icon in an indigo-50 circle; one sentence; one action.

**Toasts**: bottom-right, white card, coloured left bar matching the status.

## 7. Login page

Split layout. Left half: indigo → purple diagonal gradient (`#572E91` → `#99459A`), white Comfortaa headline, one supporting line in white, and three short value points with yellow or teal icons. Right half: white, centred login card with email, password, "Forgot password?", primary "Sign in" button, and a "Demo access" section with two buttons: **Sign in as Admin** and **Sign in as User**.

This is the only screen where large brand-colour fields are allowed.

## 8. Voice & copy

Adapted from the shikshagraha tone of voice: **direct, grounded in people, invitational, never saviour.**

- Indian English spelling: organisation, prioritise, licence (noun), programme, centre.
- Currency in ₹ with Indian grouping (₹1,25,000). Dates as 6 Nov 2026.
- Say "organisation", not "client" or "customer". Say "people" or "teams", never "beneficiaries".
- Buttons are verbs: "Request environment", "Approve request", "Run load test". Never "Submit" or "OK".
- Error messages say what happened and what to do next: "This exceeds your organisation's GPU quota by 40 hours. Reduce the GPU tier or ask your admin for more quota."
- No hype ("revolutionary", "cutting-edge", "AI-powered magic"). No exclamation marks.
- Every page footer: "Prototype — all data is simulated."

## 9. Mock data rules

- All seed data lives in `src/data/seed.ts`. Pages never define their own data.
- Use realistic Indian organisation names, person names and districts. Spread them across states.
- Use plausible numbers: credits in the thousands, latency in ms, GPU types T4/A10/A100.
- Every state change (approve, reject, create, start/stop) goes through the store and writes an activity-feed entry.
- Provisioning → Running happens automatically ~5 seconds after approval (setTimeout in the store).

## 10. Before you finish any page — checklist

- [ ] Uses tokens only; no raw hex in components
- [ ] Comfortaa for headings and KPI numbers only; Source Sans 3 everywhere else
- [ ] No tangerine, yellow, teal or cyan text on white
- [ ] Status shown with `StatusBadge`, never ad-hoc colours
- [ ] One primary button per view
- [ ] Empty, loading (skeleton) and error states exist
- [ ] Works at 375px, 768px and 1440px
- [ ] Keyboard focus visible (pink ring) on every control
- [ ] Copy in Indian English, verbs on buttons, no hype
- [ ] The Admin ↔ User flow still works end to end: user requests → admin approves → user's dashboard updates