# Axolotl RPG
Open rpg/index.html through the local web server.

- index.html: menu markup and dialogs.
- styles/home.css: menu design and responsive layout.
- styles/village.css: scenery and animation.
- script/home.js: menu actions and browser-local settings.
- json/menu.json: menu configuration.
- images/: original vector village and character artwork.

No inline JavaScript or CSS. No external dependencies. Play Game opens a development notice until gameplay is implemented. Keep future maps, combat, account integration and saves in separate files.

## Audio
- script/audio.js: reusable Web Audio engine, independent music/effects channels, and menu sounds.
- script/village-music.js: original looping village composition (notes and chords).
- Volume preferences share the existing browser-local menu settings. Defaults: music 55%, effects 70%.
- Audio starts on the first interaction, follows browser autoplay rules, and suspends while the tab is hidden.
- No downloads or external audio libraries are needed. New game sound effects can use the same audio engine.
