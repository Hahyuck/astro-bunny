ASTRO BUNNY - replacement art pack

Game coordinates and non-character art grid: 256x240. Graphics use NEAREST sampling.
Renewal backing canvas: 512x480; existing non-character pixels remain 2x2 blocks
on integer game coordinates. New character sheets use one texel per 0.5 game units.
Classic mode retains its 256x240 canvas and original ninja artwork.
bg1..4.png: 256x208 pixels, playfield excluding the HUD area.
Renewal backgrounds also use moving stars at three depths and occasional meteors.
Preview the actual background motion for 12 seconds, with an idle character and no
shots or impacts, at effects-preview.html?scene=sky on the running local server.
enemies.png: 128x16 pixels, eight 16x16 cells in one horizontal row.
  0 saucer / 1 moth / 2 interceptor / 3 mine / 4 ring drone /
  5 heavy gunship / 6 skull / 7 friendly bunny pickup.
boss1..4.png: 128x112 pixels; target core at (64,56).
title.png: 256x240 pixels, ASTRO BUNNY title;
  the bottom-centre start menu is rendered by game code.
resources.json: maps images into named, individually replaceable sections.
palette.json: shared 48-color palette. All packed PNGs have binary transparency.

Spacesuit bunny character replacement specification:
The larger player and mint clone sheets have been re-extracted from the approved
large artwork, validated and published as the renewal defaults.
Player and mint clone: 1024x96 horizontal strips, sixteen 64x96 frames each.
player.png / clone.png remain the firing-and-sword sheets; their existing PNGs are unchanged.
player-move.png / clone-move.png: 384x96 strips, six 64x96 frames for walking.
Movement resource keys: characters.playerMove / characters.cloneMove.
Default renewal display: 32x48 game units (previously 24x40); intended visible
figure height is approximately 25% larger. The image box itself is 20% taller.
  0..5: upward gaze, alternate left/right arm raised for automatic fire.
  6..10: both arms raised together for the charged sword and return.
  11..15: reserved slots, filled with completed poses for compatibility.
Keep the helmet, ear antennae, body scale and asset foot pivot (32,95) consistent.
The world foot baseline remains Y=208. Movement, collision boxes and timing are unchanged.
For firing/sword entries, confirm 16 frames; for movement entries, confirm 6 frames.
Automatic frame recognition accepts current, classic-default and renewal-default
sheet aspect ratios; apply the frame count explicitly when needed.
Custom character overrides use the selected theme's display area, just like defaults:
32x48 in renewal and 24x40 in classic. Uploaded files and frame settings are unchanged
by theme switching, and resource export/import preserves this behavior.
Classic template strips remain 384x40 with sixteen 24x40 frames.
To set a default, update the matching source and frames in resources.json;
source paths are relative to dist/assets. User replacements take priority.

The movement sheet is a front-facing forward walk/run in place, with feet kept beneath
the hips and alternating forward knee lifts; it has no wide lateral kicks or side steps.
Walking follows actual displacement: one frame per 8 game units, looping over 6 frames
(typically 4 ticks each). Both movement directions advance the same forward cycle.
Standing still or pushing against a wall uses
the stationary firing pose; charged sword poses stay on the existing 16-frame sheet.
Default renewal characters use the walking strips. If a user supplies a player/clone
base override, its movement override must also be supplied before walking is enabled
for that character. Otherwise its existing custom identity remains visible while moving.
Classic mode retains the original character animation.

Renewal destruction effects start on actual defeat: brief body blink and disappearance,
chained explosions, fragments and shockwaves. Midbosses last 76 ticks, main stage bosses
88, large ordinary enemies 48 and ordinary small explosions 32, at 60 ticks per second.
Enemy hits last 12 ticks with a short white/pink impact; armor deflection lasts 16 ticks
with steel/magenta ricochet; player hits use a 32-tick open pink ring and clone pickups
use a 32-tick mint pulse. Code-drawn three-tone filled burst clouds lead into smoke,
rings and debris. Same-target hit/armor visuals are limited to one per 4 ticks without
changing damage evaluation. Use effects-preview.html on the running local server
to compare impact and destruction variants.
Phase transitions, scripted retreats and interlude previews do not trigger boss destruction.
Shots/player foreground ordering is preserved. Classic explosions retain 32-tick display.
Gameplay paths, actor damage, physics, RNG, score and stage progression are unchanged by these visuals.

Weapons, explosions and HUD are code-drawn and can be replaced through the
existing resource editor. Main music and effects remain individually replaceable.
Uploaded replacements are stored in this browser's IndexedDB, not sent to a server.
Resource ZIP export/import preserves edited files and frame settings; restoring
defaults removes the corresponding local replacement setting.

Source art generated with the built-in image_gen tool; mechanically resized,
quantized and packed using Node sharp. The existing ten PNGs were reduced by
exactly one half with nearest sampling while preserving their surviving colors.
Full prompts are in ART-PROMPTS.json at project root. Audit reports and PNG
SHA-256 hashes are beside these assets; hero-audit.json and animation.json record
character validation and native animation timing for the published 1024x96 sheets.
move-audit.json and move-animation.json describe the latest forward-walk revision,
six distinct lower-body phases, and the same forward cycle for both movement directions.
The ten non-character PNGs are unchanged in this update.
The local work folder retains the larger source images.

characters.roar: three256x160 upper-body poses in roar.png(768x160), binary alpha.
Replaces the friendly giant portrait in original clone-supply scenes6:28/6:31.
The core controls supply timing and scroll; this is not a boss or collision actor.
Use effects-preview.html?scene=roar for isolated preview; music-preview.html for stage2BGM.
