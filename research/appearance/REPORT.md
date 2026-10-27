# Look book: other ways to draw the planets and their marks

**Date:** 2026-10-26.
**Answers:** the owner's request of 2026-10-26 for samples, without changing the game, of: planets without the nose; more compact marks for you, your quarry and your hunter; photos of real planets; images computed from the player ID; chase lines from every hunter to its quarry; and annotations chosen per round and per player. Nothing was decided on the day; see **Chosen**.
**Chosen:** on 2026-10-26 the owner picked the shaded sphere, the pip, the colour-and-shape marks and thrust flames, with names under the planets as each player's choice. They're built (PLAN §12). The page still labels the earlier look "Now" and "As built".
**Setup:** open `look-book.html` in a browser. It contacts nothing; the photos and the recorded rounds are inline.
- The samples use the game's geometry and palette: planet radius 0.03 arena sides, the ring of radius 0.18, the 12 colours of `src/render/palette.ts`, and the renderer's line widths.
- Each specimen is drawn at two sizes: a 760 px arena, the largest on a desktop (r = 22.8 px), and a 380 px arena, a Pixel 8a held upright (r = 11.4 px).
- The moving samples replay two rounds recorded tick by tick from `src/core/sim`, with every player steered by `dev/steer.ts`, each with its own gain and nerve: 8 planets with an ante of 5, and 5 planets with an ante of 4. The countdown was cut to 3 s for the recordings.

## What the page shows

| Section | Samples |
|---|---|
| Orientation without the nose | the nose (as built), notch, pip, visor, lit side, highlight, turned number, eyes, moon |
| Marks for you, your quarry and your hunter | rings (as built), tight shapes, colour and shape, inside the planet, halo, lock-on brackets, badges, focus (the other planets faded) |
| Planet looks | flat colour (as built), shaded sphere, the seat's colour with features from the ID, solar system photos, and Jazzicon-, Blockies-, identicon- and marble-style images from the ID |
| Chase lines | arrowhead, chevrons, marching dashes, pulse, taper, comet, curved, hunter's colour; all lines alike, mine bright, or mine only |
| Mix and match | each annotation chosen separately, in two columns: what the round sets for everyone (the proposer), and what each player chooses where the round leaves it open. View as any planet or as a spectator. Names under planets and thrust flames are extras. |

## Findings

1. **The nose and the marks as built reach far.** The nose reaches 1.6 r, past the collision circle, so two noses meet before the planets touch. Your quarry's ring and ticks reach 2.7 r and cover neighbours in a scrum. Every alternative mark stays within 1.9 r, and most within 1.7 r.
2. **Compact marks need an orientation mark that stays inside.** The nose pokes through marks drawn at 1.3 r, so the marks, looks and chase-line sections show the notch by default.
3. **Photos and ID images lose the palette's checks.** `src/render/palette.test.ts` keeps every hunter and quarry apart under colour blindness; photos and ID colours can't promise that. Jupiter and Saturn look alike at phone size, and two IDs can pick similar colours. These samples draw the number in the seat's colour instead. The seat-colour-plus-features look keeps the palette and takes only the pattern from the ID.
4. **Eight photos fit the cap.** Numbered from the Sun, Mercury to Neptune, the eight planets match the 8-player mesh cap. A higher cap would need moons or dwarf planets.
5. **ID images follow the player.** Numbers follow the join order, so they change from round to round (the owner's report of 2026-10-25, about labels); an image from the player ID doesn't.
6. **Two chase-line styles need motion.** Marching dashes and the pulse show no direction in a still frame. The arrowhead, chevrons, taper, comet, curve and hunter's colour do.
7. **Choices fixed by the round would touch the hashed state.** They would travel with the ante, minimum and maximum, which are part of the canonical state (A.1), so the codec and the goldens would change. Each player's own choices are display-only and would live in Settings (`src/storage/settings.ts`).

## Regenerating

- The rounds: `npx vitest run --config research/appearance/vitest.config.ts` runs `record.ts`, which writes them into the page. It is deterministic.
- The photos: `node research/appearance/photos.mjs` fetches them from Wikimedia Commons, checks that each is public domain, crops it to the planet's disc in headless Chromium and writes the crops into the page. It contacts commons.wikimedia.org and upload.wikimedia.org.
- Both reproduced the page's data byte for byte on 2026-10-26. The rest of the page is hand-written: edit it directly.

## Sources

- The photos are NASA's, public domain, via Wikimedia Commons: Mercury from MESSENGER, Venus from Mariner 10, Earth from Apollo 17, Mars from the Viking orbiters, Jupiter from Hubble, Saturn from Cassini, Uranus and Neptune from Voyager 2. The file names are in `photos.mjs`.
- The ID images are the page's own code, in the style of MetaMask's Jazzicon, Ethereum's Blockies, GitHub's identicons and Boring Avatars' marble. They are not those libraries' output.
