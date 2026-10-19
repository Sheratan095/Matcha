# Matcha UI kit: "Press Edition"

Everything a screen needs, from `@/ui`. Importing anything from `@/ui` also loads the fonts, the tokens and the
global styles (`src/ui/styles/index.css`); `main.tsx` may also import that file directly to make the order explicit.
The kit is presentational only: no state store, no fetching. Showcase: `/styleguide` in the app, or
`styleguide.html` on its own (`npx vite --mode demo --port 4100`, then `http://localhost:4100/styleguide.html`;
`?demo=shell|auth|chat|match` opens the full-page layout demos).

```tsx
import { AppShell, Button, Headline, ProfileCard, toast } from '@/ui'
```

---

## House rules (read these first)

**The look.** Matcha is printed matter: warm paper, five ink drums (black, matcha, strawberry, yolk, cobalt), 3px ink
keylines, hard offset shadows that never blur, and heavy uppercase lettering used as a design element. Flat colour
fields only: no gradients, no blur, no glass, no soft drop shadows, no grey. If you need something the kit lacks,
build it from the tokens below and keep to these rules.

**Colour.** Text on matcha, strawberry and yolk is always ink. Text on cobalt, tin green (`deep`) and ink is card
stock (`--c-paper-hi`). Coloured text on paper uses the `-deep` variants (`--c-matcha-deep`, `--c-strawberry-deep`,
`--c-yolk-deep`) or `--c-blue`. Strawberry means like / danger, yolk means super-like / highlight, cobalt means
info and is the focus ring, matcha is the brand and "go". Never put light text on matcha/strawberry/yolk.

**Spacing.** 4px rhythm: `--s-1` 4 · `--s-2` 8 · `--s-3` 12 · `--s-4` 16 · `--s-5` 20 · `--s-6` 24 · `--s-8` 32 ·
`--s-10` 40 · `--s-12` 48 · `--s-16` 64. Page gutter `--gutter` (16px). Between form fields `--s-4`; between page
sections `--s-6`–`--s-8`. Use `Stack` / `Row` (`gap={4}` = 16px) instead of ad-hoc margins.

**Which headline.** One poster headline per screen: `PageHeader` (size `lg`, Headline `d1` condensed + riso) for
top-level pages; `md` (`d2`) for sub-pages and wizard steps; `compact` (`d4`, one line) for chat and sheets.
Card / panel titles: `Headline size="d3"` or `d4`, condensed. `mega` and `PosterWord` are for decorative,
cropped words only (landing, match moment, empty states). Small metadata, counts, dates, serials: `Label` (Space
Mono). Running text: `Text` (Archivo, normal width). Never set long sentences in Headline.

**Print treatments.** `riso` (ink + a misregistered colour plate) is the default for display type. `overprint`
(two colour plates multiplied) and `outline` (paper letters, ink keyline) are for one hero word per screen.
`worn` is for stamps and big decorative words, not for anything that must be read quickly.

**Textures.** Grain is global (printed over everything by `body::after`); never add another. Patterns (`Pattern`,
`Halftone`) go inside a positioned, `overflow: hidden` box, behind content, at 15–40% opacity, and are always
decorative. At most one halftone and one pattern per view. Stickers and stamps sit at an angle (±4–14°).

**Motion.** Physical and brief: press (90ms), thunk (280ms overshoot), sheet (320ms). Use the `--ease-*` and
`--dur-*` tokens. Everything already respects `prefers-reduced-motion` (the global rule collapses animations to
their end state); if you write a looping animation, also turn it off in a reduced-motion media query.

**Accessibility.** Use the real controls (they are native inputs / buttons underneath). Every `IconButton` and
`ActionButton` needs `label`. Touch targets are ≥ 44px. Focus is a 3px cobalt ring (yellow on dark fields: put
`data-surface="ink"` on custom dark containers). Decorative lettering (`PosterWord`, `Poster`, `Marquee` without
`label`, print furniture) is `aria-hidden`: say the same thing in real text nearby.

**Do / don't.** Do press things into their shadows; do crop giant words with the container edge; do keep labels
short (buttons ≤ 3 words, stickers ≤ 7 characters a line). Don't round photos into circles except `Avatar`;
don't mix more than two accent drums in one component; don't use `box-shadow` with blur; don't override the
font weights below 700 for anything uppercase.

---

## Tokens (`styles/tokens.css`)

| Group | Tokens |
|---|---|
| Paper | `--c-paper` #F1E7CF (page), `--c-paper-hi` #FBF6E6 (card stock), `--c-paper-lo` #E3D5B2 (kraft) |
| Ink | `--c-ink` #15130F, `--c-ink-2` #3B362D, `--c-ink-3` #625B4B (muted, AA on all papers) |
| Matcha | `--c-matcha` #72C13C, `--c-matcha-deep` #1D4B24, `--c-matcha-tint` #D3E9AE |
| Strawberry | `--c-strawberry` #FF4F64, `--c-strawberry-deep` #B3122D, `--c-strawberry-tint` #FFD3D0 |
| Yolk | `--c-yolk` #FFC531, `--c-yolk-deep` #7A4F00, `--c-yolk-tint` #FFE9A8 |
| Cobalt | `--c-blue` #2B48F0, `--c-blue-tint` #CFD8FF |
| Semantic | `--c-bg`, `--c-surface`, `--c-text`, `--c-text-muted`, `--c-like`, `--c-super`, `--c-info`, `--c-danger`, `--c-danger-text`, `--c-focus`, `--c-scrim` |
| Lines | `--bw` 3px, `--bw-thin` 2px, `--line`, `--line-thin` |
| Radii | `--r-xs` 6 · `--r-sm` 10 · `--r-md` 14 · `--r-lg` 20 · `--r-xl` 28 · `--r-pill` |
| Shadows | `--sh-1` 2px · `--sh-2` 4px · `--sh-3` 6px · `--sh-4` 10px (all `x y 0 ink`), `--press` 4px |
| Type | `--font-display`, `--font-body` (Archivo Variable), `--font-mono` (Space Mono); widths `--wd-condensed` 62% · `--wd-narrow` 78% · `--wd-normal` · `--wd-wide` 112% · `--wd-expanded` 125% |
| Type scale | `--fs-mega` ≈72–116px · `--fs-d1` ≈52–80 · `--fs-d2` ≈40–54 · `--fs-d3` 32 · `--fs-d4` 24 · `--fs-d5` 19 · `--fs-lead` 18 · `--fs-body` 16 · `--fs-sm` 14 · `--fs-xs` 13 · `--fs-label` 12 · `--fs-micro` 11 |
| Motion | `--ease-press`, `--ease-thunk`, `--ease-out`, `--dur-press` 90ms, `--dur-fast` 140ms, `--dur-thunk` 280ms, `--dur-sheet` 320ms |
| Layout | `--col` 30rem (phone column), `--topbar-h` 60, `--tabbar-h` 68, `--rail-w` 240, `--touch` 44, `--safe-t`, `--safe-b` |
| Layers | `--z-raised`, `--z-nav` 50, `--z-overlay` 200, `--z-toast` 300, `--z-grain` 1000 |
| Textures | `--tex-grain`, `--tex-wear` (mask), `--tex-dots`/`-size`, `--tex-halftone`/`-size`, `--tex-stripes`, `--tex-hatch`, `--tex-grid`/`-size`, `--tex-checks`/`-size` (paint in `currentColor`) |

**Tones.** Many components take `tone: Tone` = `'ink' | 'paper' | 'kraft' | 'matcha' | 'deep' | 'strawberry' | 'yolk' | 'blue'`.
Any element with `data-tone="…"` gets `--tone-bg`, `--tone-fg` (AA text on it), `--tone-text` (the hue as text on
paper) and `--tone-tint`. `TONES` lists them; `TONE_COLOR[tone]` is the raw colour. Global class `sr-only` hides
content visually.

---

## Lettering

**`Headline`**: display lettering (uppercase Archivo 900).
Props: `as` (default `h2`), `size` `'mega'|'d1'|'d2'|'d3'|'d4'|'d5'` (default `d2`), `width`
`'condensed'|'narrow'|'normal'|'wide'|'expanded'`, `print` `'solid'|'riso'|'overprint'|'outline'`, `ink` (Tone of the
main plate, default ink), `offset` (Tone of the second plate, default matcha), `align`, `italic`, `worn`, `nowrap`,
`id`, `className`, `style`. `overprint` needs plain-text children.
`<Headline as="h1" size="d1" width="condensed" print="riso">Discover</Headline>`

**`PosterWord`**: a giant decorative word to crop inside a `position: relative; overflow: hidden` parent. `aria-hidden`.
Props: `children`, `size` (CSS length, default `34vw`), `width` (default condensed), `tone`, `outline`, `rotate`,
`opacity`, `className`, `style` (position it).
`<PosterWord size="40vw" tone="matcha" style={{ position: 'absolute', left: -12, bottom: -20 }}>Swipe</PosterWord>`

**`Label`**: the mono ticket label for metadata, kickers, counts.
Props: `as` (default span), `size` `'sm'|'md'|'lg'`, `tone` `'ink'|'muted'|'matcha'|'strawberry'|'yolk'|'blue'|'paper'`,
`boxed`, `inverse`, `light`, `htmlFor`, `id`, `className`, `style`.
`<Label tone="muted">Last seen 2h ago</Label>`

**`Text`**: running text. Props: `as` (default p), `size` `'lead'|'body'|'sm'|'xs'`, `muted`, `strong`, `align`,
`lines` (clamp), `id`, `className`, `style`. `<Text size="sm" muted lines={2}>{bio}</Text>`

**`VisuallyHidden`**: screen-reader-only content. Props: `as`, `children`.

**`Wordmark`**: the MATCHA lockup (tile mark + expanded lettering with a matcha plate).
Props: `size` `'sm'|'md'|'lg'|'xl'`, `mark` (show tile, default true), `tagline` (`true` = "Press edition", or a string),
`tone` `'ink'|'paper'` (paper on dark fields), `className`, `style`. `<Wordmark size="sm" />`

**`LogoMark`**: the tile alone (heart made of two leaves). Props: `size` (px, default 32), `flat` (no shadow),
`title`, `className`. Same drawing as `public/favicon.svg`.

**`Stamp`**: rotated heavy label: LIKE / NOPE / SUPER / MATCH.
Props: `children`, `tone` (convention: strawberry LIKE, ink NOPE, yolk SUPER, matcha MATCH), `variant`
`'solid'|'rubber'` (solid over photos, rubber on paper), `size` `'sm'|'md'|'lg'|'xl'`, `rotate` (deg, default -8),
`thunk` (play the slam-in on mount; remount with a `key` to replay), `worn` (default on for rubber), `sub` (small mono
line), `className`, `style`. `<Stamp tone="matcha" size="lg" thunk sub="12 · 03">Match!</Stamp>`

**`Sticker`**: a sticker at an angle. Props: `children` (≤ 7 chars a line, use `<br />`), `tone` (default yolk),
`shape` `'burst'|'circle'|'pill'|'tag'`, `size` (CSS length for burst/circle, default 88px), `rotate` (default 8),
`thunk`, `className`, `style`. `<Sticker tone="yolk">Likes<br />you</Sticker>`

**`Marquee`**: an endless ticker band. Props: `items: ReactNode[]`, `tone` (default ink, with matcha letters),
`speed` (s per loop, default 22), `reverse`, `tilt` (deg; let the parent clip the overhang), `size`
`'sm'|'md'|'lg'`, `separator`, `label` (makes it readable by AT; otherwise hidden), `className`, `style`. Still under
reduced motion. `<Marquee items={['Fresh matches daily', 'Stone-ground']} tone="matcha" tilt={-2} />`

## Print furniture (all decorative, `aria-hidden`)

**`Pattern`**: flat repeating texture. Props: `kind` `'dots'|'halftone'|'stripes'|'grid'|'checks'`, `tone`
(colour of the pattern), `cover` (absolute inset 0, default true), `opacity`, `className`, `style`.
`<Pattern kind="dots" tone="ink" opacity={0.25} />`

**`Halftone`**: a real halftone ramp (dots shrinking on a 45° screen), SVG, covers its box. Props: `from`
`'top'|'bottom'|'left'|'right'|'center'|'bottom-left'|'top-right'` (where dots are biggest), `tone`, `columns`
(fineness, default 26), `cover`, `opacity`, `className`, `style`. `<Halftone from="bottom-left" tone="matcha" />`

**`Perforation`**: a tear line. Props: `variant` `'dashes'|'holes'`, `notches` (ticket half-circles at both ends),
`bleed` (CSS length to reach the card edge; inside `Card` it defaults to the card padding), `notchColor` (what shows
through the notches, default page paper), `className`, `style`. `<Perforation notches />`

**`Serial`**: mono serial number. Props: `value` (numbers are zero-padded), `prefix` (default "№"), `digits` (6),
`tone` `'ink'|'muted'|'paper'`, `className`. `<Serial value={card.fame} digits={3} />`

**`Barcode`**: decorative bars derived from a string (stable per value). Props: `value`, `height` (36), `caption`
(print the value), `tone` `'ink'|'paper'`, `className`. `<Barcode value={userId} height={28} />`

**`CropMarks`**: printer's crop marks around the nearest positioned ancestor (which must not clip overflow).
Props: `size` (14), `gap` (6), `tone`, `className`. `<div style={{ position: 'relative' }}><CropMarks />…</div>`

**`RegMark`**: registration target. Props: `size` (24), `tone`, `className`, `style`.

**`ColorBar`**: a strip of the six inks, a footer sign-off. Props: `className`.

**`TicketHeader`**: the mono strip "LABEL ——— META" that tops a panel. Props: `label`, `meta`, `tone`
`'ink'|'paper'`, `className`. `<TicketHeader label="Admit one" meta={<Serial value={42} />} />`

## Controls

**`Button`**: the press button. Extends `<button>` props. Props: `variant`
`'matcha'|'ink'|'strawberry'|'yolk'|'blue'|'paper'|'ghost'` (matcha = primary, paper = outline, ghost = text only),
`size` `'sm'|'md'|'lg'` (38 / 50 / 60px; sm keeps a 44px hit area), `block`, `loading` (spinner, aria-busy, clicks
ignored), `icon`, `iconRight`, `type` (default `button`). `<Button type="submit" size="lg" block loading={busy}>Sign in</Button>`

**`ButtonLink`**: a link that looks like a Button. Props: the same look props plus `to` (react-router) or `href`
(external / top-level navigations like the GitHub OAuth redirect), `target`, `rel`, `replace`, `aria-label`.
`<ButtonLink href={`${API_URL}/auth/github`} variant="ink" icon={<IconGithub />}>Continue with GitHub</ButtonLink>`

**`IconButton`**: one icon in a square (or round) button. Extends `<button>`. Props: `label` (required: accessible
name and tooltip), `children` (the icon), `variant` (default paper), `size` `'sm'|'md'|'lg'` (36 / 44 / 52), `round`,
`badge` (count sticker). `<IconButton label="Filters" onClick={open}><IconSliders /></IconButton>`

**`ActionButton`**: the big round deck buttons. Extends `<button>`. Props: `kind` `'pass'|'like'|'superlike'|'rewind'`
(sets tone, icon and label), `tone`, `label`, `size` `'md'|'lg'|'xl'` (56 / 68 / 80), `children` (custom icon).
`<ActionButton kind="like" size="xl" onClick={() => swipe('like')} />`

**`Field`**: label row + control + hint/error, for custom controls (the inputs below already include it). Props:
`label`, `hideLabel`, `hint`, `error`, `aside` (right of the label: "optional", a counter, a link), `htmlFor`,
`hintId`, `errorId`, `labelId`, `className`, `style`, `children`. **`FieldHint`**, **`FieldError`**: the two message
lines on their own (`id`, `children`).

**`TextField`**: single-line input. Extends `<input>` props. Plus `label` (required), `hideLabel`, `hint`, `error`
(sets `aria-invalid` + description), `aside`, `icon` (leading), `trailing`, `fieldClassName`.
`<TextField label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} error={err} />`

**`PasswordField`**: TextField with a show/hide toggle (aria-pressed). Same props except `type` / `trailing`.
`<PasswordField label="Password" autoComplete="current-password" aside={<Link to="/forgot-password">Forgot?</Link>} />`

**`TextArea`**: multi-line with a "042/500" counter. Extends `<textarea>`. Plus `label`, `hideLabel`, `hint`, `error`,
`counter` (default true; shows when `maxLength` is set), `fieldClassName`. Default `rows` 4.
`<TextArea label="Biography" maxLength={MAX_BIOGRAPHY_LENGTH} value={bio} onChange={…} />`

**`Select`**: native select in the house box. Extends `<select>` (no children). Plus `options: {value,label,disabled?}[]`,
`placeholder` (empty first option), `label`, `hideLabel`, `hint`, `error`, `aside`, `icon`, `fieldClassName`.

**`Segmented`**: single-choice chips (a radio group); the chosen chip stays pressed. Generic over the value type.
Props: `options: {value,label,icon?,disabled?}[]`, `value` (or null), `onChange(value)`, `label`, `hideLabel`, `hint`,
`error`, `name`, `tone` (chosen colour, default matcha), `size` `'md'|'lg'`, `block` (equal widths), `stacked`
(one column of big targets, onboarding), `disabled`, `className`.
`<Segmented label="I am" options={genderOptions} value={gender} onChange={setGender} size="lg" stacked />`

**`Checkbox`**: Extends `<input>` (type fixed). Props: `children` (label, may contain links), `description`, `error`.
`<Checkbox checked={ok} onChange={e => setOk(e.target.checked)}>I accept the terms</Checkbox>`

**`Switch`**: on/off (`role="switch"`), label left, switch right. Extends `<input>`. Props: `children`, `description`.

**`Slider`**: single value with a big read-out. Props: `value`, `onChange(number)`, `min` (0), `max` (100), `step` (1),
`format(v)`, `unit`, `label`, `hideLabel`, `hint`, `error`, `disabled`, `id`, `name`, `className`.
`<Slider label="Distance" value={km} onChange={setKm} min={1} max={200} unit="km" />`

**`DualSlider`**: two thumbs on one rail (age range); each thumb is its own focusable slider. Props: `value: [lo, hi]`,
`onChange([lo, hi])`, `min`, `max`, `step`, `minGap` (default one step), `format`, `unit`, `thumbLabels`
(default `['Minimum','Maximum']`), `label`, `hideLabel`, `hint`, `error`, `disabled`, `className`.
`<DualSlider label="Age" value={[min, max]} onChange={([a, b]) => { setMin(a); setMax(b) }} min={18} max={99} thumbLabels={['Minimum age', 'Maximum age']} />`

**`TagInput`**: interests editor. Type + Enter or comma adds, Backspace on empty removes the last, suggestions are
tappable chips filtered by what is typed. Props: `value: string[]` (no '#'), `onChange(tags)`, `suggestions`
(catalogue), `max` (shows "03/10"), `maxLength` (per tag, default 50), `suggestionLimit` (8), `placeholder`,
`normalize(raw)` (default: lowercase, strip '#', spaces → dashes), `label`, `hideLabel`, `hint`, `error`, `disabled`,
`className`. `<TagInput label="Interests" value={tags} onChange={setTags} suggestions={catalogue} max={10} />`

**`PhotoTile`**: one slot of the photo grid. Empty → a file picker; filled → picture + actions. Props: `src`, `alt`,
`onPick(file)`, `onRemove`, `onMakeMain` (button shown when not main), `main` (MAIN sticker), `busy` (spinner overlay),
`disabled`, `accept` (jpeg/png/webp), `label` (empty text, default "Add photo"), `index` (slot number, 1-based),
`ratio` (default "3 / 4"), `className`, `style`. Lay five out in a CSS grid.
`<PhotoTile index={1} src={pic?.url} main={pic?.isProfile} onPick={upload} onRemove={() => remove(pic.id)} />`

**`Notice`**: inline banner. Props: `tone` `'error'|'success'|'info'|'warning'`, `title`, `children`, `icon`, `action`,
`onDismiss`, `role` (default alert for errors, status otherwise), `className`, `style`.

**`FormError`**: form-level error banner, above the submit button. Props: `error` (string, string[], or an
`ApiError`-like `{message, messages}`; renders nothing when empty), `title`, `action`, `className`.
`<FormError error={status.error} />`

## Display

**`Card`**: the "tin" panel. Props: `as`, `tone` (default paper), `shadow` 0–4 (default 2), `pad`
`'none'|'sm'|'md'|'lg'`, `radius` `'sm'|'md'|'lg'|'xl'`, `tilt`, `rim` (inner keyline), `dashed` (placeholder),
`clip`, `label` + `meta` (ticket strip on top), `id`, `role`, `aria-label(ledby)`, `className`, `style`. Dark tones set
`data-surface="ink"` for you. `<Card label="Settings" meta="№ 03">…</Card>`

**`Chip`**: mono pill tag. Props: `children` (interests as `#tea`), `tone` (paper; matcha for shared interests),
`size` `'sm'|'md'`, `icon`, `onClick` + `selected` (toggle chip, aria-pressed), `onRemove` + `removeLabel` (removable),
`disabled`, `className`, `style`.

**`Badge`**: small solid label (NEW, ONLINE, LIKES YOU). Props: `children`, `tone` (ink), `rotate`, `icon`, `className`, `style`.

**`CountBadge`**: round count sticker; nothing at 0. Props: `count`, `max` (99 → "99+"), `tone` (strawberry),
`showZero`, `label` (e.g. "unread messages", for AT), `className`.

**`Avatar`**: picture or initials on a colour picked from the name. Props: `src`, `name` (required), `size`
`'xs'|'sm'|'md'|'lg'|'xl'|'2xl'` (28/36/48/64/96/132), `online` (true matcha dot, false kraft dot, omit for none),
`shape` `'circle'|'tile'`, `shadow`, `decorative` (hide from AT when the name is printed next to it), `className`, `style`.

**`PhotoFrame`**: outlined photo with a poster fallback and print treatments. Props: `src`, `alt` (required),
`ratio` (default "3 / 4"; "auto" to size from the parent), `treatment` `'none'|'duotone'|'halftone'`, `tone` (duotone
field, matcha), `seed` (fallback artwork; pass the user id), `framed` (default true), `shadow` 0–4, `radius`
`'none'|'sm'|'md'|'lg'|'xl'`, `tilt`, `loading`, `children` (overlay; the frame is `position: relative`), `className`, `style`.

**`PosterFigure`**: placeholder portrait (flat two-plate poster bust, 3:4, palette and haircut from `seed`).
Props: `seed`, `title`, `className`, `style`.

**`ProfileCard`**: the face of a swipe card (photo + tin label with name, age, distance, interests); the deck adds
the drag. Props: `name`, `age`, `photo`, `seed`, `city`, `distanceKm`, `online`, `tags`, `commonTags` (printed first,
in matcha), `likedYou` (LIKES YOU sticker), `stamp` `'like'|'nope'|'super'|null` + `stampStrength` 0–1 (drive both
from the drag), `serial`, `photoCount` + `photoIndex` (pips), `onInfo` (info button → profile sheet), `fill` (take the
parent's height instead of 3:4.6; give the deck a height), `children` (photo overlay), `className`, `style` (apply
the drag transform here or on a wrapper). `<ProfileCard {...card} name={card.firstName ?? ''} photo={main?.url} distanceKm={card.distanceKm} stamp={dir} stampStrength={progress} onInfo={open} fill />`

**`MatchCelebration`** / **`MatchMoment`**: "It's a match". `MatchCelebration` is the composition (sunburst, two
polaroids, MATCH stamp, ticker, two buttons) and fills its container; `MatchMoment` shows it as a full-screen,
focus-trapped takeover. Props: `me` / `them: {name, photo?, seed?}`, `onMessage`, `onDismiss`, `children` (replace the
line under the headline), `animate` (Celebration only, default true); MatchMoment adds `open`, `onClose`.
`<MatchMoment open={!!match} onClose={clear} me={me} them={{ name: m.profile.firstName ?? '', photo }} onMessage={() => navigate(`/chat/${m.id}`)} />`

**`Stat`** / **`StatGroup`**: big condensed numeral + mono label (fame, km, age). Stat props: `value`, `unit`, `label`,
`icon`, `tone` (plate colour, matcha), `size` `'md'|'lg'`, `className`. StatGroup puts Stats side by side in one ruled
box. `<StatGroup><Stat value={74} label="Fame" /><Stat value={3} unit="km" label="Away" tone="yolk" /></StatGroup>`

**`Steps`**: wizard progress as a punch card. Props: `current` (1-based), `total`, `labels`, `className`.
`<Steps current={2} total={5} labels={['Gender', 'Preference', 'Bio', 'Interests', 'Photos']} />`

**`Tabs`** / **`TabPanel`**: an outlined tab strip with arrow-key navigation. Tabs props: `items: {value,label,count?,icon?}[]`,
`value`, `onChange`, `label` (aria-label), `idBase`, `className`. TabPanel props: `idBase` (same), `value`, `active`,
`children`, `className`.

**`ListRow`**: a list row (matches, likes, settings), separated by a dashed rule. Props: `leading` (Avatar), `title`,
`subtitle`, `meta` (time), `trailing` (CountBadge, button; defaults to a chevron when interactive), `unread` (bold +
matcha edge), `to` (Link) or `onClick` (button), `className`. Wrap rows in `<ul><li>`.
`<ListRow to={`/chat/${m.id}`} leading={<Avatar name={n} src={src} online={o} decorative />} title={n} subtitle={last} meta="14:02" unread />`

**`EmptyState`**: Props: `title`, `children`, `stamp` (rubber-stamp word), `stampTone`, `icon`, `action`, `className`.
`<EmptyState stamp="Sold out" title="You've seen everyone nearby" action={<Button>Widen filters</Button>} />`

**`Spinner`**: registration mark clicking round (inherits colour). Props: `size` (20), `label` ("Loading"; "" when a
parent announces), `className`. **`Loader`**: page-level loader (the tile stamping, role=status). Props: `children`
(caption, default "Whisking"), `fill` (centre in a tall box), `className`, `style`. **`Skeleton`**: hatched
placeholder. Props: `width`, `height`, `shape` `'block'|'text'|'circle'`, `className`, `style`.

## Overlays

**`toast`** + **`Toaster`**: imperative toasts. Mount `<Toaster />` once (portals to body; extra instances stay
silent; prop `position` `'top-right'|'top-center'|'bottom-right'` for wide screens, always top on phones). API:
`toast.show({ title, message?, tone?: 'ink'|'matcha'|'strawberry'|'yolk'|'blue', icon?, duration? (ms, 4500; 0 =
sticky), action?: {label, onClick}, id? (replace) })` → id; shortcuts `toast.success(title, msg?)`,
`toast.error(title, msg?)`, `toast.info(title, msg?)`; `toast.dismiss(id)`, `toast.clear()`. Hover/focus pauses the
fuse. `toast.show({ tone: 'yolk', title: 'Alice liked you', icon: <Avatar name="Alice" size="sm" decorative /> })`

**`Modal`**: bottom sheet on phones, centred dialog from 640px. Focus trap, Escape, scroll lock, inert background,
focus restored, `aria-modal`, exit animation. Props: `open`, `onClose`, `title` (accessible name), `hideTitle`,
`kicker`, `children`, `footer` (actions row), `variant` `'auto'|'sheet'|'dialog'|'takeover'`, `size` `'sm'|'md'|'lg'`,
`tone`, `bleed` (no body padding: full-width photos in the profile sheet), `dismissible` (default true),
`initialFocus` (ref), `className`, `style`.
`<Modal open={o} onClose={close} title="Unmatch Alice?" size="sm" footer={<><Button variant="paper" onClick={close}>Keep</Button><Button variant="strawberry" onClick={go}>Unmatch</Button></>}>…</Modal>`

**`Sheet`**: a Modal that is always a bottom sheet (filters, action lists). Same props minus `variant`.

**`Menu`**: dropdown of actions behind a "…" button (arrows, Home/End, Escape, Tab, outside click). Props:
`items: {label, icon?, onSelect, tone?: 'default'|'danger', disabled?}[]`, `label` (trigger name, "More options"),
`trigger` (content), `align` `'start'|'end'`, `triggerVariant` `'paper'|'ghost'`, `className`.

**`ActionList`**: big tappable action rows for inside a Sheet. Props: `items` (MenuItem, plus `description`), `className`.

## Chat

**`ChatThread`**: the column of messages (`role="log"`). Props: `children`, `label`, `className`. Put it inside
`Screen` (which scrolls); scroll to the bottom yourself on new messages.

**`ChatBubble`**: Props: `side` `'mine'|'theirs'`, `children`, `time` (preformatted), `status`
`'sending'|'sent'|'read'|'failed'` (mine only), `position` `'single'|'first'|'middle'|'last'` (runs from one side),
`showMeta`, `className`. `<ChatBubble side="mine" position="last" time="14:01" status="read">On my way</ChatBubble>`

**`TypingIndicator`**: Props: `name` (for AT). **`DayDivider`**: Props: `children` ("Today").

**`ChatComposer`**: growing textarea + send button; Enter sends, Shift+Enter new line. Props: `value`, `onChange`,
`onSend(trimmedText)`, `placeholder`, `maxLength` (1000), `disabled`, `sending`, `label`, `className`.

## Layout

**`AppShell`**: the signed-in frame. Phones: sticky top bar (wordmark + `actions`), content, sticky bottom tab bar.
From 960px of its own width: side rail (wordmark, tabs, colour bar), the content as a phone-sized sheet on a cutting
mat with crop marks, and `poster` lettering in the margin. Props: `tabs: {to, label, icon, badge?, end?}[]`,
`children`, `actions`, `banner` (strip above everything, e.g. the DEMO marker), `poster` (margin word, e.g.
the section name), `homeTo` ("/discover"), `hideTabBar`, `flush` (no side padding, for the deck). Use it in
`AppLayout` with `<Outlet />` as children.
`<AppShell tabs={[{ to: '/discover', label: 'Discover', icon: <IconCards /> }, { to: '/matches', label: 'Matches', icon: <IconChat />, badge: unread }]} poster="discover"><Outlet /></AppShell>`

**`Screen`**: full-height screen outside the shell (the chat): fixed header, scrolling middle, fixed footer, same
sheet-on-mat look on wide screens. Props: `header`, `footer`, `children`, `poster`, `banner`, `className`.
`<Screen header={<PageHeader size="compact" back="/matches" title={name} />} footer={<ChatComposer … />}><ChatThread>…</ChatThread></Screen>`

**`PageHeader`**: Props: `title`, `kicker`, `back` (route string or handler), `backLabel`, `actions`, `size`
`'lg'|'md'|'compact'`, `print` (Headline treatment, default riso), `children` (under the title: Tabs, a lead), `className`.
`<PageHeader title="Matches" kicker="03 new" actions={<Menu items={…} />} />`

**`AuthLayout`**: the signed-out frame: poster band + ticket form on phones, poster half + calm form from 960px.
Props: `title`, `kicker` ("Admit one"), `intro`, `children` (the form fields and buttons; spaced for you), `footer`
(under the ticket), `poster` (PosterProps without `compact`). Wrap fields in your `<form>` inside.
`<AuthLayout title="Sign in" intro="Welcome back." footer={<>No account? <Link to="/register">Register</Link></>}><form>…</form></AuthLayout>`

**`Poster`**: the poster composition on its own (landing page hero). Props: `lines` (2–4 short words, default
"Whisk me away"), `tone` `'matcha'|'strawberry'|'yolk'|'blue'`, `sticker` (node or null), `marquee` (phrases or null),
`wordmark` (default true), `homeTo`, `compact` (phone band height), `className`, `style`. Give it a height.

**`Stack`** / **`Row`**: flex helpers on the spacing scale. Props: `as`, `gap` (step: 0,1,2,3,4,5,6,8,10,12,16),
`align` `'stretch'|'start'|'center'|'end'`, (Row) `justify` `'start'|'center'|'end'|'between'`, `wrap`, `id`,
`className`, `style`. `<Stack gap={4}>…</Stack>`

## Icons

24-grid, 2.5 stroke, `currentColor`. Every icon takes `size` (24), `strokeWidth` (2.5), `filled` (solid closed shapes),
`title` (accessible name; decorative without), plus any SVG prop. Names: `IconHeart`, `IconX`, `IconStar`, `IconUndo`,
`IconChat`, `IconUser`, `IconLeaf`, `IconSettings`, `IconCamera`, `IconSliders`, `IconSend`, `IconArrowLeft`,
`IconArrowRight`, `IconChevronLeft`, `IconChevronRight`, `IconChevronDown`, `IconChevronUp`, `IconMore`, `IconCheck`,
`IconEye`, `IconEyeOff`, `IconBolt`, `IconPin`, `IconLogout`, `IconMail`, `IconLock`, `IconGithub`, `IconTrash`,
`IconPlus`, `IconMinus`, `IconInfo`, `IconWarning`, `IconSearch`, `IconBell`, `IconShield`, `IconBlock`, `IconPencil`,
`IconFlame`, `IconImage`, `IconClock`, `IconRefresh`, `IconCup`, `IconGlobe`, `IconFlag`, `IconExternal`,
`IconSparkle`, `IconTicket`, `IconCards`. `ICONS` maps short names (`heart`, `x`, …) to components; types `IconProps`,
`IconComponent`, `IconName`. Filled icons with a hole (settings, camera, pin, mail, lock, send, ticket) paint the hole
with `var(--icon-hole)` (default card stock): set it to the background colour when that is not paper.
`<IconHeart filled size={20} />`

## Helpers

`cx(...classes)` joins class names. Types of every component's props are exported as `<Name>Props`.
