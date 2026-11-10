// Where each character comes from. All CC0 1.0 by Quaternius (quaternius.com), fetched from the
// trebeljahr/quaternius-showcase mirror on GitHub (its LICENSES.md lists each pack as CC0-1.0),
// except the robot, which is the three.js example copy (r170) on jsDelivr.
const MIRROR = 'https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/c06a6fa9a1b13576edf3bd62d7b52aba334f8fc0/public/glb';

export const SOURCES = [
  {
    id: 'robot',
    url: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/models/gltf/RobotExpressive/RobotExpressive.glb',
    cacheName: 'RobotExpressive.glb',
    // The exact bytes the shipped robot.glb was built from (was public/assets/models/, now unused).
    sha256: '047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319',
    pack: 'Animated Robot (three.js example copy)',
    // Same both-channel palette the game already uses for the robot: light body, dark joints.
    materials: { Main: '#eae6dc', Grey: '#3d434d', Black: '#15171a' },
    roughness: 0.65,
  },
  {
    id: 'frog',
    url: `${MIRROR}/ultimate_space_pack/Astronaut_FinnTheFrog-transformed.glb`,
    cacheName: 'Astronaut_FinnTheFrog.glb',
    pack: 'Ultimate Space Kit',
    // Suit repainted (was the same grey for all four) so each character has its own colour;
    // all suits stay light in both R and G, with dark gloves/boots for contrast.
    swatches: [{ uv: [0.014, 0.14], color: '#d8f59a' }, { uv: [0.014, 0.266], color: '#3f8f2a' }],
    boneScale: { Head: 1.35 },
  },
  {
    id: 'panda',
    url: `${MIRROR}/ultimate_space_pack/Astronaut_RaeTheRedPanda-transformed.glb`,
    cacheName: 'Astronaut_RaeTheRedPanda.glb',
    pack: 'Ultimate Space Kit',
    // Suit repainted (was the same grey for all four) so each character has its own colour;
    // all suits stay light in both R and G, with dark gloves/boots for contrast.
    swatches: [{ uv: [0.014, 0.14], color: '#ffcf8f' }, { uv: [0.014, 0.234], color: '#d8641c' }],
    boneScale: { Head: 1.35 },
  },
  {
    id: 'bee',
    url: `${MIRROR}/ultimate_space_pack/Astronaut_BarbaraTheBee-transformed.glb`,
    cacheName: 'Astronaut_BarbaraTheBee.glb',
    pack: 'Ultimate Space Kit',
    // Suit repainted (was the same grey for all four) so each character has its own colour;
    // all suits stay light in both R and G, with dark gloves/boots for contrast.
    swatches: [{ uv: [0.014, 0.14], color: '#ffe14a' }, { uv: [0.014, 0.204], color: '#f2b705' }],
    boneScale: { Head: 1.35 },
  },
  {
    id: 'flamingo',
    url: `${MIRROR}/ultimate_space_pack/Astronaut_FernandoTheFlamingo-transformed.glb`,
    cacheName: 'Astronaut_FernandoTheFlamingo.glb',
    pack: 'Ultimate Space Kit',
    // Suit repainted (was the same grey for all four) so each character has its own colour;
    // all suits stay light in both R and G, with dark gloves/boots for contrast.
    swatches: [{ uv: [0.014, 0.14], color: '#ffb6d3' }, { uv: [0.014, 0.169], color: '#ff7fb0' }],
    boneScale: { Head: 1.35 },
  },
  {
    id: 'rex',
    url: `${MIRROR}/dinosaurs_pack/Trex.glb`,
    cacheName: 'Trex.glb',
    pack: 'Animated Dinosaur Pack',
    // Friendly cartoon colours instead of the dark realistic ones: light lime body (bright in both R
    // and G against grass), darker green back markings, cream belly.
    materials: { Green: '#bfe868', LightGreen: '#5c9634', LightYellow: '#fff6d8', Red: '#e0607a', Black: '#141414' },
    roughness: 0.8,
    boneScale: { Head: 1.25 },
  },
];
