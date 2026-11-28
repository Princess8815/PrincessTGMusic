# Axolotl RPG
Open rpg/index.html through the local web server.

- index.html: menu markup and dialogs.
- styles/home.css: menu design and responsive layout.
- styles/village.css: scenery and animation.
- script/home.js: menu actions and browser-local settings.
- json/menu.json: menu configuration.
- images/: original vector village and character artwork.

No inline JavaScript or CSS. No external dependencies. Play Game opens the first playable map. Combat, account integration and persistent saves are not implemented yet.

## Audio
- script/audio.js: reusable Web Audio engine, independent music/effects channels, and menu sounds.
- script/village-music.js: original looping village composition (notes and chords).
- Volume preferences share the existing browser-local menu settings. Defaults: music 55%, effects 70%.
- Audio attempts to start as soon as the menu loads. If the browser blocks autoplay, the first click, pointer release or keypress retries playback. Audio suspends while the tab is hidden.
- No downloads or external audio libraries are needed. New game sound effects can use the same audio engine.

## First playable map
- json/maps/willowfin.json: tile rows, player spawn, and interactive objects.
- json/items.json: item names and icons.
- script/world.js: map loading, terrain, collision, and interaction queries.
- script/player.js: movement and direction.
- script/renderer.js: top-down Canvas drawing and camera.
- script/inventory.js: ten-slot inventory, selection, stacking and UI.
- script/game.js: screen lifecycle, keyboard input and game loop.
- styles/game.css: gameplay HUD and inventory.
Tile codes: G grass, P path, W water (solid), B bridge, T tree (solid), H house (solid), R rock (solid).
Walk with WASD or arrows, interact with E, select slots with 1–9 or 0. Inventory and position remain in memory when returning to the menu; refreshing resets this prototype.

## Northern farm
- json/maps/farm.json: separate 36 × 22 tile region joined to the north of the village at runtime.
- F = farmhouse footprint (solid), L = tall grass (walkable), S = sticks (solid). All new farm features are decorative; no clearing, harvesting, planting or house entry yet.
- Admin > Games > Axolotl RPG > Item Catalogue reads the same json/items.json used by the game. Categories and source are metadata, not gameplay mechanics. The admin interface is role-gated; runtime item definitions are public static assets, not secret data.

## Starter equipment
- script/tools.js: dedicated tool slot, T/click cycles Rusty Sword → Rusty Hatchet → Rusty Pickaxe → Rusty Hoe → Rusty Watering Can → Rusty Sword.
- Tool icons are in images/tools/. Definitions are in json/items.json and appear in the admin catalogue. toolType and tier identify future upgrade paths.
- Tools are permanent starter equipment and never consume inventory slots. They are displayed beside the player, but tool actions are not implemented yet.

## Player vitals
- script/stats.js: starting health and stamina are both 10/10. Includes bounded damage, healing, stamina spending and restoration functions plus HUD synchronization.
- No passive drain, regeneration, damage sources or death behavior yet. Walking and switching tools do not consume stamina.

## Tree variants and expanded inventory
- T = regular tree; O = oak tree. Both are solid, with separate treeType values for future harvesting. Existing tree positions are preserved.
- I opens/closes the shared inventory dialog. Three rows of ten, with the first row unlocked and mirrored in the hotbar. The other 20 slots are locked and cannot receive items. unlockNextRow() is available for future progression; no unlock method is exposed to players yet.

## Equipment inventory
- I opens equipment above the original 30-slot storage. Twelve gear slots: head, chest, legs, boots, gloves, offhand, ammo, sword, hatchet, pickaxe, hoe and watering can.
- script/equipment.js owns the loadout and slot compatibility; starter tools live here, and the T hotbar uses this same loadout. Click a tool in equipment to activate it. Armor/offhand/ammo start empty; equipping future drops and stat effects are not implemented yet.

## Tree harvesting
- tree-types.json defines 15 species, their unique tile codes, art, hardness and one-log drops. Only regular and oak are placed on existing maps. Regular trees drop Wood.
- Face an adjacent tree, select the hatchet with T and press E once per hit. Rusty strength is 1, default regular hardness is 3. Each hit costs 1 stamina; zero instantly resets to 10 during alpha. Felled tiles become grass and drop a collectible log. Boundary forest walls are protected.
- Admin → Games → Axolotl RPG → Tree hardness saves overrides to Firestore rpgTreeTypes. Deploy security/firestore.rules before using the editor. New world loads use server overrides or fall back to defaults if offline. Existing running worlds retain their initial hardness.

## Skills
- script/skills.js: eight skills, cumulative XP, levels, shared reward helper and K skills dialog. Health starts at level 10 with the exact cumulative XP required; all other skills start at 1 and zero XP.
- The first level costs 100 XP; each successive cost is ceil(100 × 1.1^(level−1)), accumulated across levels. Hover/focus/click reveals total XP and remaining XP. No arbitrary gameplay level cap (safe integer arithmetic limits apply).
- Tree definitions carry independent woodcuttingXp rewards, starting at 10 for regular and 15 for oak. XP is awarded once when a tree falls, not per hit or when collecting logs. Hardness overrides do not alter XP rewards.
- Only woodcutting is trainable for now. Skills persist in the current session, not across page refresh. Health level does not yet alter HP; other skills do not yet affect gameplay.
