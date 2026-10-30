Original asset baseline

CHR pixels and nametable bytes are decoded from the supplied ROM without executing it.
characters/player.png and clone.png: 16 horizontal frames, 24x40 each. Background tile drawtable and stage0 palette binding confirmed statically. Body poses use CHR1KiB banks128..135; trouser bank128 is the baseline. See source-frames.json.
Both player and clone use BG palette2. Their different color indices give a white player and pink clone in stage1. Idle is pose2; normal firing loops poses0..5, four game ticks per pose. Leg CHR bank follows playerX independently of body animation.
enemies/common.png: 16 horizontal 16x16 enemy forms. More original animation data is available in sprites.json and chr-index.png.
ui/title.png: original title nametable with three statically matched CHR banks.
bosses/ninja-00..05.png: original giant ninja portraits, full 256x240 nametables. Static bank39 B9C1 lookup confirms portraits00..03 are stage1..4 clear screens. Portrait04/05 have additional state selectors; their context has not been confirmed. These are not six different stage bosses.
bosses/stage1..4.png: four actual stage bosses; bosses/mid*.png: statically identified middle encounters. maps.json scenePages contains all eight original map pages for each scene index0..8, selected by native stage scripts.
backgrounds/interlude*.png: original READY TO DIE and raised-fists ninja scenes. backgrounds/ground-stage1..4.png: original HUD and floor tile strips, 256x40. Dynamic score and charge glyph metadata is in sprites.json.
effects/shot.png and enemyBullet.png: 16 horizontal frames, 8x16 each. Enemy bullet preview samples type1; other types may choose other original tiles and colors.
effects/explosion.png: 16 horizontal frames, 16x16 each. effects/sword.png: one 8x128 maximum-length template; runtime extent controls its displayed length.
sprites.json also contains the original starfield position/type tables, four initial stage palettes, and effect tile definitions. All decoded pixels and table values came from the supplied ROM, without CPU or hardware emulation.

PNG replacement sheets may have higher resolution, but preserve horizontal frame ordering and aspect ratio.
Music and SFX folders intentionally have no invented original audio. Native audio is controlled by the web game; user audio files can be substituted in the resource panel.
