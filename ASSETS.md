# Asset credits and licenses

Every file under `public/assets/` must have a row here. CC0 preferred; CC-BY requires credit (also shown in-game).

| File | Source URL | Author | License |
|---|---|---|---|
| public/assets/models/RobotExpressive.glb | https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/models/gltf/RobotExpressive/RobotExpressive.glb (original: https://quaternius.com) | Tomás Laulhé (Quaternius) | CC0 1.0 |
| public/assets/audio/music-explore.ogg | https://opengameart.org/content/sunny-city ("Sunny City", sunny_city_bpm120.ogg) | MintoDog | CC0 1.0 |
| public/assets/audio/music-urgent.ogg | https://opengameart.org/content/sunny-city ("Sunny City" climax, sunny_city_climax_bpm135.ogg) | MintoDog | CC0 1.0 |
| public/assets/audio/music-action.ogg | https://opengameart.org/content/sky-blue-street ("Sky Blue Street", sky_blue_street_bpm165.ogg) | MintoDog | CC0 1.0 |
| public/assets/audio/music-air.ogg | https://opengameart.org/content/happy-clappy-loop ("Happy Clappy Loop") | OwlishMedia | CC0 1.0 |
| public/assets/audio/jingle-win.ogg | https://opengameart.org/content/victory ("Victory") | celestialghost8 | CC0 1.0 |

Audio notes: each OpenGameArt page above lists CC0 as the only licence (checked 2026-11-10). Files were
loudness-matched (static gain), loop-seam crossfaded where needed (music-air, 10 ms), and re-encoded to OGG
Vorbis ~96 kbps stereo (jingle 64 kbps mono). Validate with `node tests/audio/validate-tracks.mjs`.
