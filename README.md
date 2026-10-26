# Handlebar Lab

A private EmptyOS service for comparing motorcycle handlebar bends in 3D on a Beta RR 390. You enter the bar you have now, by catalog bend or by its published width, rise, pullback and clamp width. You can then try any other bend, roll either bar in the clamps, and see how the hands, grip angles and a simple standing or seated rider change.

## What it shows

- A calibrated side photo of the bike, placed as a billboard in a three.js scene. 3D forks, clamps, pegs and wheel outlines are added so the bike still reads when you orbit away from the side view.
- Your bar (translucent blue) and the bar you are trying (orange), built to each maker's published dimensions. Views: 3/4, side, front, top and from the rider's eyes.
- Roll for each bar. 0° stands the bar's clamp-to-bend section parallel to the fork legs, and positive roll moves the grips forward. There are also riser-height and clamp fore/aft sliders for the bike.
- A table of changes at the hand: height and reach from the pegs and seat, hand spacing, back-sweep and up-sweep as ridden, torso lean and elbow angle. "Match my grip angle" finds the roll that gives the new bar the same up-sweep as yours.
- Every bar, sortable by how far it moves your hands from where they are now. You can filter by use, brand, diameter or your shortlist.

## Data

`data/bars.json` is built by `python3 -I scripts/build-bars.py data/research` from the per-brand research files in `data/research/`. Each row was captured from the maker's own bend chart, and its `source` links that chart. Retailer charts were used only where a maker page was blank, and those rows say so in `notes`. Missing dimensions are never estimated; rows without width, rise and pullback are skipped. The script's docstring documents how each maker's labels map to the normalised fields:

- Renthal publishes A–F: width, height, rise to the bend, clamp width, sweep, control length.
- ODI publishes the same A–F set.
- Pro Taper publishes HEIGHT to the bar ends and RISE to the bend.
- Zeta, Scar, Tag, Accel, Fly and Moose also publish both a height and a rise.
- Mika, FASST, Magura and Neken publish a single height. Neken's is measured on the tube centreline.

The catalog has 530 bends across 14 brands: Renthal, Pro Taper, ODI, Mika Metals, FASST, Neken, Zeta, Scar, Moose Racing, Accel, Fly Racing, Tag Metals, Magura and Beta OEM. Brands that publish no bend data (Domino, Doma, Tag T3) are absent. So is one Pro Taper EVO bend that is sold without published dimensions.

Beta's own stock bars come from the factory drawings on Beta Australia's parts pages:
- 2020+ RR bar 037.35.000.00.59: 810 wide, 87 height, 40 pullback, 10° up-sweep and back-sweep.
- 2007–2019 RR bar 22.20391.000.

At 0° roll, the 2020+ bar's end lands 17 mm from the stock grip visible in the calibrated photo.

Where a maker does not publish clamp width, grip length or sweep angles, the 3D bend uses typical values. The hand position still follows the published numbers exactly.

Renthal's WorksFit tool lists its 604 bend as similar to the 2017–2024 RR 390 stock bar, and its 821 as similar to the 2025 X-Pro and 2024 RS. Both rows are tagged `similar_to_stock`. WorksFit's stock-bar records reuse the Renthal dimensions, so they are not separate rows.

`data/bike.json` holds the bike model and calibration notes. The photo is scaled at 0.847 px/mm, the mean of the front tyre, rear tyre and axle spacing, which agree within 1.5%. The peg and seat positions are measured from the photo. Beta does not publish rake or offset for the current chassis, so the 2019 RR-S figures are used: 26.5° and 23 mm. The fork line in the photo measures 26.3°. Bar mount height and offset are estimates, which is why the riser and clamp sliders exist. The photo is Beta's MY2027 RR Race 4T studio image, used privately. `scripts/cutout.py` removed its white background.

The rider uses Drillis & Contini segment proportions and a simple posture rule, so read it for the direction and size of a change, not as a bike fit.

## Runtime

Node >=22.13, built-in `node:sqlite`, and no dependencies or install step. three.js 0.170.0 (MIT) is vendored in `public/vendor/`, so the page loads nothing from the network. The service reads `PORT` and `EMPTYOS_DATASET_HANDLEBAR_LAB_DATA`. The Database holds one `setup` row (your bar, rolls, riser, clamp shift, rider height and posture) and a `shortlist` table. Both are created with `CREATE TABLE IF NOT EXISTS` on first start. Units, view toggles and photo opacity are per-browser conveniences kept in local storage.

JSON writes require the `X-Handlebar-Lab-Client: app` header. Bodies are capped at 16 KB, and only listed `public/` files are served. User text is rendered as text, never as HTML.

`./verify` checks syntax and catalog integrity, and builds every bar to confirm its ends land on the published dimensions. It also checks the direction of roll, riser and rise effects and the photo calibration. Finally it runs the service against a temporary SQLite file on an ephemeral loopback port, covering assets, write protection, validation, and persistence across a restart.

For UI testing, set `HANDLEBAR_LAB_TEST_DB` to a fresh temporary path and `PORT` to an unused port. Never point tests at the canonical Database.
