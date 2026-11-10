# Asset credits and licenses

Every file under `public/assets/` must have a row here. CC0 preferred; CC-BY requires credit (also shown in-game).

| File | Source URL | Author | License |
|---|---|---|---|
| public/assets/models/horse.glb | https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/c06a6fa9a1b13576edf3bd62d7b52aba334f8fc0/public/glb/animals_pack/Horse.glb (Ultimate Animated Animal Pack, https://quaternius.com/packs/ultimateanimatedanimals.html); attack/death/hit clips removed, Trot clip derived from Walk, recoloured, meshopt-compressed (tools/horse) | Quaternius | CC0 1.0 |
| public/assets/audio/music-explore.ogg | https://opengameart.org/content/sunny-city ("Sunny City", sunny_city_bpm120.ogg) | MintoDog | CC0 1.0 |
| public/assets/audio/music-urgent.ogg | https://opengameart.org/content/sunny-city ("Sunny City" climax, sunny_city_climax_bpm135.ogg) | MintoDog | CC0 1.0 |
| public/assets/audio/music-action.ogg | https://opengameart.org/content/sky-blue-street ("Sky Blue Street", sky_blue_street_bpm165.ogg) | MintoDog | CC0 1.0 |
| public/assets/audio/music-air.ogg | https://opengameart.org/content/happy-clappy-loop ("Happy Clappy Loop") | OwlishMedia | CC0 1.0 |
| public/assets/audio/jingle-win.ogg | https://opengameart.org/content/victory ("Victory") | celestialghost8 | CC0 1.0 |
| public/assets/characters/robot.glb | https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/models/gltf/RobotExpressive/RobotExpressive.glb ("RobotExpressive", original: https://quaternius.com), recoloured; fighting clips removed; procedural Flop clip added (tools/characters) | Tomás Laulhé (Quaternius) | CC0 1.0 |
| public/assets/characters/frog.glb | https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/c06a6fa9a1b13576edf3bd62d7b52aba334f8fc0/public/glb/ultimate_space_pack/Astronaut_FinnTheFrog-transformed.glb (Ultimate Space Kit, https://quaternius.com/packs/ultimatespacekit.html); pistol and fighting clips removed, suit recoloured, bigger head, procedural clips added | Quaternius | CC0 1.0 |
| public/assets/characters/panda.glb | https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/c06a6fa9a1b13576edf3bd62d7b52aba334f8fc0/public/glb/ultimate_space_pack/Astronaut_RaeTheRedPanda-transformed.glb (Ultimate Space Kit); same changes as frog.glb | Quaternius | CC0 1.0 |
| public/assets/characters/bee.glb | https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/c06a6fa9a1b13576edf3bd62d7b52aba334f8fc0/public/glb/ultimate_space_pack/Astronaut_BarbaraTheBee-transformed.glb (Ultimate Space Kit); same changes as frog.glb | Quaternius | CC0 1.0 |
| public/assets/characters/flamingo.glb | https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/c06a6fa9a1b13576edf3bd62d7b52aba334f8fc0/public/glb/ultimate_space_pack/Astronaut_FernandoTheFlamingo-transformed.glb (Ultimate Space Kit); same changes as frog.glb | Quaternius | CC0 1.0 |
| public/assets/characters/rex.glb | https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/c06a6fa9a1b13576edf3bd62d7b52aba334f8fc0/public/glb/dinosaurs_pack/Trex.glb (Animated Dinosaur Pack, https://quaternius.com/packs/animateddinosaurs.html); attack/death clips removed, cartoon recolour, bigger head, procedural clips added | Quaternius | CC0 1.0 |

Audio notes: each OpenGameArt page above lists CC0 as the only licence (checked 2026-11-10). Files were
loudness-matched (static gain), loop-seam crossfaded where needed (music-air, 10 ms), and re-encoded to OGG
Vorbis ~96 kbps stereo (jingle 64 kbps mono). Validate with `node tests/audio/validate-tracks.mjs`.
