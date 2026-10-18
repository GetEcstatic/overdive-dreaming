# HUD fonts

Barlow and Barlow Condensed (SIL Open Font License 1.1, see `OFL.txt`), from
<https://github.com/google/fonts/tree/main/ofl>.

**Modified:** the OpenType `tnum` feature (tabular figures) is frozen into the
default glyphs with `pyftfeatfreeze -f tnum` (opentype-feature-freezer), so
every digit has the same advance width. The server rasteriser (resvg) ignores
`font-variant-numeric`, so without this the running HUD clock jitters
sideways. Barlow declares no Reserved Font Name, so the family names are kept.

Used by the burned HUD exports (copied into the Cloud Functions bundle by
`functions/build.mjs`) and by the in-app HUD.

To regenerate:

```sh
pip install opentype-feature-freezer
pyftfeatfreeze -f tnum BarlowCondensed-Bold.ttf static/fonts/BarlowCondensed-Bold.ttf
```
