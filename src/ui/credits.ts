/** Credits data. The orchestrator extends this array. */
export interface CreditEntry {
  item: string;
  by: string;
  license: string;
  kind: 'model' | 'code' | 'font' | 'audio' | 'texture' | 'other';
}

export const CREDITS: readonly CreditEntry[] = [
  { item: 'RobotExpressive', by: 'Tomás Laulhé (Quaternius)', license: 'CC0', kind: 'model' },
  { item: 'Ultimate Space Kit, Animated Dinosaur Pack', by: 'Quaternius', license: 'CC0', kind: 'model' },
  { item: 'Music: Sunny City', by: 'MintoDog', license: 'CC0', kind: 'audio' },
  { item: 'Music: Sunny City (climax)', by: 'MintoDog', license: 'CC0', kind: 'audio' },
  { item: "Pip's voice: Kokoro-82M", by: 'hexgrad', license: 'Apache-2.0', kind: 'audio' },
  { item: 'Music: Sky Blue Street', by: 'MintoDog', license: 'CC0', kind: 'audio' },
  { item: 'Music: Happy Clappy Loop', by: 'OwlishMedia', license: 'CC0', kind: 'audio' },
  { item: 'three.js', by: 'three.js authors', license: 'MIT', kind: 'code' },
  { item: 'Rapier', by: 'Dimforge', license: 'Apache-2.0', kind: 'code' },
  { item: 'postprocessing', by: 'Raoul van Rüschen', license: 'Zlib', kind: 'code' },
  { item: 'Fonts', by: 'System fonts', license: '-', kind: 'font' },
];
