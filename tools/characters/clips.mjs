// Hand-keyed procedural clips that the source packs don't have (dance, wave, fall, flop, sit…).
//
// A clip starts from a base pose (frame 0 of an existing clip, e.g. Idle) and adds rotations
// given in CHARACTER space (+X = character's left, +Y up, +Z forward): a world-axis rotation R at
// a joint becomes the local rotation P⁻¹·R·P·L, where P is the parent's world rotation in the
// base pose. Every joint the base clip animates gets a track, so nothing leaks from the previous
// clip when the game cross-fades.
const FPS = 30;

// ── tiny quaternion helpers ([x, y, z, w]) ──
function qmul(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
const qinv = ([x, y, z, w]) => [-x, -y, -z, w];
function qaxis(axis, angle) {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}
/** Rotation from character-space Euler angles (applied X, then Y, then Z, all world axes). */
function qeuler([x, y, z]) {
  return qmul(qaxis([0, 0, 1], z), qmul(qaxis([0, 1, 0], y), qaxis([1, 0, 0], x)));
}
function qrot(q, v) {
  const p = qmul(qmul(q, [v[0], v[1], v[2], 0]), qinv(q));
  return [p[0], p[1], p[2]];
}
function qnorm(q) {
  const l = Math.hypot(...q) || 1;
  return q.map((c) => c / l);
}

function baseValue(node, path, baseClip) {
  if (baseClip) {
    for (const c of baseClip.listChannels()) {
      if (c.getTargetNode() === node && c.getTargetPath() === path) {
        const out = c.getSampler().getOutput();
        return out.getElement(0, []);
      }
    }
  }
  return path === 'rotation' ? node.getRotation() : node.getTranslation();
}

/**
 * spec: { name, from: 'Idle', duration, loop?: true,
 *         rot: { Bone: (t, u) => [x, y, z] },         // character-space angles, radians
 *         move: { Bone: (t, u) => [x, y, z] } }        // character-space offset, metres*
 *   t = seconds, u = t / duration (0..1). *offsets are in model units before the catalog scale.
 */
function buildClip(doc, spec) {
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0];
  const baseClip = root.listAnimations().find((a) => a.getName() === spec.from);
  if (spec.from && !baseClip) throw new Error(`no base clip ${spec.from}`);
  // Joints win over same-named mesh nodes (RobotExpressive has a "Head" mesh and a "Head" bone).
  const joints = new Set(root.listSkins().flatMap((s) => s.listJoints()));
  const byName = new Map();
  for (const n of root.listNodes()) if (!byName.has(n.getName()) || joints.has(n)) byName.set(n.getName(), n);

  // Base-pose world rotations and scales (rotation only matters for axis conversion).
  const worldRot = new Map();
  const worldScale = new Map();
  const worldPos = new Map();
  const visit = (node, parentRot, parentScale, parentPos) => {
    const local = baseValue(node, 'rotation', baseClip);
    const wr = qnorm(qmul(parentRot, local));
    const s = node.getScale()[0] * parentScale;
    const t = qrot(parentRot, baseValue(node, 'translation', baseClip).map((c) => c * parentScale));
    const wp = [parentPos[0] + t[0], parentPos[1] + t[1], parentPos[2] + t[2]];
    worldRot.set(node, wr);
    worldScale.set(node, s);
    worldPos.set(node, wp);
    for (const child of node.listChildren()) visit(child, wr, s, wp);
  };
  for (const scene of root.listScenes()) for (const n of scene.listChildren()) visit(n, [0, 0, 0, 1], 1, [0, 0, 0]);

  // Two-bone leg IK (sagittal plane): rigs whose feet are separate root-level joints keep the
  // feet planted, so bending a thigh alone does nothing. Given the body offset and a foot offset,
  // solve thigh and shin angles (knee forward) and move the foot joint.
  if (spec.legs) {
    spec.rot ??= {};
    spec.move ??= {};
    const bodyMove = spec.move.Body ?? (() => [0, 0, 0]);
    const theta = (v) => Math.atan2(v[2], -v[1]); // 0 = straight down, + = forward
    for (const [side, footFn] of Object.entries(spec.legs)) {
      const thigh = byName.get(`UpperLeg.${side}`);
      const shin = byName.get(`LowerLeg.${side}`);
      const foot = byName.get(`Foot.${side}`);
      const hip0 = worldPos.get(thigh);
      const knee0 = worldPos.get(shin);
      const foot0 = worldPos.get(foot);
      const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
      const a = Math.hypot(...sub(knee0, hip0));
      const b = Math.hypot(...sub(foot0, knee0));
      const th0 = theta(sub(knee0, hip0));
      const sh0 = theta(sub(foot0, knee0));
      const solve = (t, u) => {
        const bo = bodyMove(t, u);
        const fo = footFn(t, u);
        const hip = [hip0[0] + bo[0], hip0[1] + bo[1], hip0[2] + bo[2]];
        const ft = [foot0[0] + fo[0], foot0[1] + fo[1], foot0[2] + fo[2]];
        const v = sub(ft, hip);
        const d = Math.min(Math.hypot(v[1], v[2]), (a + b) * 0.999);
        const alpha = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
        const th = theta(v) + alpha;
        const knee = [hip[1] - a * Math.cos(th), hip[2] + a * Math.sin(th)];
        const sh = Math.atan2(ft[2] - knee[1], -(ft[1] - knee[0]));
        // Negative X rotation swings a hanging limb forward (raises θ).
        const dxThigh = -(th - th0);
        const dxShin = sh0 - sh - dxThigh;
        return { dxThigh, dxShin };
      };
      const thighExtra = spec.rot[`UpperLeg.${side}`];
      spec.rot[`UpperLeg.${side}`] = (t, u) => {
        const e = thighExtra ? thighExtra(t, u) : [0, 0, 0];
        return [solve(t, u).dxThigh + e[0], e[1], e[2]];
      };
      spec.rot[`LowerLeg.${side}`] = (t, u) => [solve(t, u).dxShin, 0, 0];
      spec.move[`Foot.${side}`] = footFn;
    }
  }
  const parentOf = new Map();
  for (const n of root.listNodes()) for (const c of n.listChildren()) parentOf.set(c, n);

  for (const k of [...Object.keys(spec.rot ?? {}), ...Object.keys(spec.move ?? {})]) {
    if (!byName.has(k)) throw new Error(`${spec.name}: no joint ${k}`);
  }

  // Joints that get tracks: everything the base clip animates, plus anything the spec drives.
  const targets = new Set();
  if (baseClip) for (const c of baseClip.listChannels()) targets.add(c.getTargetNode());
  for (const k of [...Object.keys(spec.rot ?? {}), ...Object.keys(spec.move ?? {})]) targets.add(byName.get(k));

  const frames = Math.max(2, Math.round(spec.duration * FPS) + 1);
  const times = new Float32Array(frames);
  for (let i = 0; i < frames; i++) times[i] = (i / (frames - 1)) * spec.duration;
  const input = doc.createAccessor().setType('SCALAR').setArray(times).setBuffer(buffer);

  const anim = doc.createAnimation(spec.name);
  for (const node of targets) {
    const name = node.getName();
    const parent = parentOf.get(node);
    const P = parent ? worldRot.get(parent) : [0, 0, 0, 1];
    const pScale = parent ? worldScale.get(parent) : 1;
    const baseR = baseValue(node, 'rotation', baseClip);
    const baseT = baseValue(node, 'translation', baseClip);
    for (const path of ['rotation', 'translation']) {
      const fn = path === 'rotation' ? spec.rot?.[name] : spec.move?.[name];
      const animated = baseClip?.listChannels().some((c) => c.getTargetNode() === node && c.getTargetPath() === path);
      if (!fn && !animated) continue;
      const size = path === 'rotation' ? 4 : 3;
      const out = new Float32Array(frames * size);
      for (let i = 0; i < frames; i++) {
        const t = times[i];
        const u = t / spec.duration;
        if (path === 'rotation') {
          let q = baseR;
          if (fn) {
            const R = qeuler(fn(t, u));
            q = qnorm(qmul(qmul(qmul(qinv(P), R), P), baseR));
          }
          out.set(q, i * 4);
        } else {
          let v = baseT;
          if (fn) {
            const d = qrot(qinv(P), fn(t, u)).map((c) => c / pScale);
            v = [baseT[0] + d[0], baseT[1] + d[1], baseT[2] + d[2]];
          }
          out.set(v, i * 3);
        }
      }
      const output = doc.createAccessor().setType(size === 4 ? 'VEC4' : 'VEC3').setArray(out).setBuffer(buffer);
      const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
      const channel = doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler);
      anim.addSampler(sampler).addChannel(channel);
    }
  }
  return anim;
}

const TAU = Math.PI * 2;
const sin = Math.sin;
const cos = Math.cos;
/** Smooth 0→1→0 envelope that makes looping clips start and end on the base pose. */
const ease = (u) => 0.5 - 0.5 * cos(TAU * u);
/** Ramp 0→1 over the first `k` of the clip, then hold (for one-shot poses). */
const ramp = (u, k = 0.35) => {
  const x = Math.min(1, u / k);
  return x * x * (3 - 2 * x);
};

// ───────────── per-skeleton clip sets ─────────────
// Sign guide (character space): for a limb hanging down, −X swings it forward, +Z swings it
// towards +X (the character's left). So raising the left arm sideways is +Z, the right arm −Z.

/** Space-suit animals (Quaternius Ultimate Space Kit rig). Units: model units (~2.6 tall). */
function astroClips(src) {
  const pos = (x) => Math.max(0, x);
  const planted = { L: () => [0, 0, 0], R: () => [0, 0, 0] };
  const out = [];
  out.push({
    name: 'Dance',
    from: 'Idle',
    duration: 1.2,
    rot: {
      Torso: (t, u) => [0, 0, 0.2 * sin(TAU * u)],
      Head: (t, u) => [0.12 * sin(2 * TAU * u), 0, -0.28 * sin(TAU * u)],
      'UpperArm.L': (t, u) => [0, 0, 2.3 + 0.3 * sin(2 * TAU * u)],
      'UpperArm.R': (t, u) => [0, 0, -2.3 - 0.3 * sin(2 * TAU * u)],
      'LowerArm.L': (t, u) => [0, 0, 0.5 * (0.5 + 0.5 * sin(2 * TAU * u))],
      'LowerArm.R': (t, u) => [0, 0, -0.5 * (0.5 + 0.5 * sin(2 * TAU * u))],
    },
    move: {
      Body: (t, u) => [0.1 * sin(TAU * u), -0.1 * (0.5 + 0.5 * cos(2 * TAU * u)), 0],
    },
    legs: planted,
  });
  out.push({
    name: 'Flop',
    from: 'Idle',
    duration: 0.6,
    loop: false,
    rot: {
      'UpperArm.L': (t, u) => [0, 0, 1.6 * ramp(u)],
      'UpperArm.R': (t, u) => [0, 0, -1.6 * ramp(u)],
      'UpperLeg.L': (t, u) => [0, 0, 0.35 * ramp(u)],
      'UpperLeg.R': (t, u) => [0, 0, -0.35 * ramp(u)],
      Head: (t, u) => [-0.3 * ramp(u), 0, 0.25 * ramp(u)],
    },
    legs: {
      L: (t, u) => [0.27 * ramp(u), 0.05 * ramp(u), 0],
      R: (t, u) => [-0.27 * ramp(u), 0.05 * ramp(u), 0],
    },
  });
  out.push({
    name: 'Sit',
    from: 'Idle',
    duration: 0.5,
    loop: false,
    rot: {
      'UpperArm.L': (t, u) => [-1.0 * ramp(u), 0, 0],
      'UpperArm.R': (t, u) => [-1.0 * ramp(u), 0, 0],
    },
    legs: {
      L: (t, u) => [0, 0.3 * ramp(u), 0.55 * ramp(u)],
      R: (t, u) => [0, 0.3 * ramp(u), 0.55 * ramp(u)],
    },
  });
  if (src.id === 'flamingo') {
    out.push({
      name: 'Spin',
      from: 'Idle',
      duration: 1.6,
      rot: {
        Root: (t, u) => [0, TAU * u, 0],
        'UpperArm.L': (t, u) => [0, 0, 1.4 * ease(u)],
        'UpperArm.R': (t, u) => [0, 0, -1.4 * ease(u)],
        Head: (t, u) => [-0.25 * ease(u), 0, 0],
      },
      legs: {
        L: () => [0, 0, 0],
        R: (t, u) => [0, 0.55 * ease(u), -0.05 * ease(u)],
      },
    });
  }
  if (src.id === 'frog') {
    const lift = (u) => 0.55 * pos(sin(TAU * u));
    const squat = (u) => 0.22 * pos(-sin(TAU * u));
    out.push({
      name: 'Hop',
      from: 'Idle',
      duration: 1.0,
      rot: {
        'UpperArm.L': (t, u) => [0, 0, 2.4 * pos(sin(TAU * u))],
        'UpperArm.R': (t, u) => [0, 0, -2.4 * pos(sin(TAU * u))],
        Head: (t, u) => [-0.3 * pos(sin(TAU * u)), 0, 0],
      },
      move: {
        Body: (t, u) => [0, lift(u) - squat(u), 0],
      },
      legs: {
        L: (t, u) => [0, lift(u) * 0.85, 0],
        R: (t, u) => [0, lift(u) * 0.85, 0],
      },
    });
  }
  return out;
}

/** T-rex (Quaternius Animated Dinosaur Pack rig). Arms are FrontUpLeg.*; its feet are pinned
 * IK joints too, so these clips move only the upper body, arms, head and tail. */
function rexClips() {
  const tailWag = (amp, speed) => (i) => (t, u) => [0, amp * sin(speed * TAU * u - i * 0.6), 0];
  const wag = tailWag(0.28, 2);
  return [
    {
      name: 'Dance',
      from: 'Idle',
      duration: 1.2,
      rot: {
        Body: (t, u) => [0, 0.12 * sin(TAU * u), 0.1 * sin(TAU * u)],
        Neck: (t, u) => [0.15 * sin(2 * TAU * u), 0, 0],
        Head: (t, u) => [0.15 * sin(2 * TAU * u), 0.25 * sin(TAU * u), 0],
        Tail1: wag(1),
        Tail2: wag(2),
        Tail3: wag(3),
        Tail4: wag(4),
        Tail5: wag(5),
        'FrontUpLeg.L': (t, u) => [-0.8 * (0.5 + 0.5 * sin(4 * TAU * u)), 0, 0],
        'FrontUpLeg.R': (t, u) => [-0.8 * (0.5 - 0.5 * sin(4 * TAU * u)), 0, 0],
      },
    },
    {
      name: 'Wave',
      from: 'Idle',
      duration: 1.0,
      rot: {
        'FrontUpLeg.R': (t, u) => [-1.3, 0, -0.5 * sin(2 * TAU * u)],
        Head: (t, u) => [0, -0.2, 0.15 * sin(TAU * u)],
        Tail3: tailWag(0.2, 1)(3),
        Tail4: tailWag(0.2, 1)(4),
        Tail5: tailWag(0.2, 1)(5),
      },
    },
    {
      name: 'Fall',
      from: 'Idle',
      duration: 0.8,
      rot: {
        Tail1: (t, u) => [-0.25, 0.1 * sin(TAU * u), 0],
        Tail3: (t, u) => [-0.2, 0.15 * sin(TAU * u - 1), 0],
        'FrontUpLeg.L': (t, u) => [-1.0 + 0.3 * sin(2 * TAU * u), 0, 0],
        'FrontUpLeg.R': (t, u) => [-1.0 - 0.3 * sin(2 * TAU * u), 0, 0],
        Head: (t, u) => [-0.25, 0, 0],
      },
    },
    {
      name: 'Flop',
      from: 'Idle',
      duration: 0.6,
      loop: false,
      rot: {
        'FrontUpLeg.L': (t, u) => [0, 0, 1.0 * ramp(u)],
        'FrontUpLeg.R': (t, u) => [0, 0, -1.0 * ramp(u)],
        Head: (t, u) => [0.3 * ramp(u), 0, 0.3 * ramp(u)],
        Tail2: (t, u) => [0, 0.3 * ramp(u), 0],
      },
    },
    {
      name: 'Sit',
      from: 'Idle',
      duration: 0.5,
      loop: false,
      rot: {
        Tail1: (t, u) => [0.3 * ramp(u), 0, 0],
        'FrontUpLeg.L': (t, u) => [-0.8 * ramp(u), 0, 0],
        'FrontUpLeg.R': (t, u) => [-0.8 * ramp(u), 0, 0],
      },
    },
  ];
}

/** RobotExpressive: only a comic flop pose is missing (its feet are pinned joints too). */
function robotClips() {
  return [
    {
      name: 'Flop',
      from: 'Idle',
      duration: 0.6,
      loop: false,
      rot: {
        'UpperArm.L': (t, u) => [0, 0, 1.7 * ramp(u)],
        'UpperArm.R': (t, u) => [0, 0, -1.7 * ramp(u)],
        Head: (t, u) => [0, 0, 0.25 * ramp(u)],
      },
    },
  ];
}

/**
 * Four-legged friends (animal pack and the triceratops). Their feet hang on root-level IK joints,
 * so these clips move only the body a little, the neck, head, ears and tail: wiggly, happy motion.
 */
function quadClips(src) {
  const animal = src.rig === 'animal';
  const neck = animal ? 'Neck1' : 'Neck';
  const tails = animal ? (src.id === 'fox' ? ['Tail1', 'Tail2', 'Tail3', 'Tail4', 'Tail5'] : ['Tail1', 'Tail2', 'Tail3']) : ['Tail1', 'Tail2', 'Tail3', 'Tail4', 'Tail5'];
  const ears = animal ? ['Ear1.L', 'Ear1.R'] : [];
  const wag = (amp, speed, lag = 0.6) => Object.fromEntries(tails.map((b, i) => [b, (t, u) => [0, amp * sin(speed * TAU * u - i * lag), 0]]));
  const earFlop = (amp, speed) => Object.fromEntries(ears.map((b, i) => [b, (t, u) => [amp * sin(speed * TAU * u + i * Math.PI), 0, 0]]));
  return [
    {
      name: 'Dance',
      from: 'Idle',
      duration: 1.2,
      rot: {
        Body: (t, u) => [0, 0.1 * sin(TAU * u), 0.09 * sin(TAU * u)],
        [neck]: (t, u) => [0.18 * sin(2 * TAU * u), 0, 0],
        Head: (t, u) => [0.12 * sin(2 * TAU * u), 0.3 * sin(TAU * u), 0.2 * sin(TAU * u)],
        ...wag(0.5, 2),
        ...earFlop(0.35, 2),
      },
    },
    {
      name: 'Wave',
      from: 'Idle',
      duration: 1.0,
      rot: {
        [neck]: (t, u) => [-0.15, 0, 0],
        Head: (t, u) => [-0.1, 0.15, 0.3 * sin(2 * TAU * u)],
        ...wag(0.7, 3, 0.4),
        ...earFlop(0.3, 2),
      },
    },
    {
      name: 'Cheer',
      from: 'Idle',
      duration: 0.8,
      rot: {
        [neck]: (t, u) => [-0.35 * ease(u), 0, 0],
        Head: (t, u) => [-0.25 * ease(u), 0, 0],
        ...wag(0.6, 4, 0.3),
      },
    },
    {
      name: 'Fall',
      from: 'Idle',
      duration: 0.8,
      rot: {
        [neck]: (t, u) => [-0.25, 0, 0],
        Head: (t, u) => [-0.2, 0, 0.1 * sin(TAU * u)],
        ...wag(0.35, 1),
        ...Object.fromEntries(ears.map((b) => [b, () => [-0.6, 0, 0]])),
      },
    },
    {
      name: 'Flop',
      from: 'Idle',
      duration: 0.6,
      loop: false,
      rot: {
        Body: (t, u) => [0, 0, 0.25 * ramp(u)],
        Head: (t, u) => [0.3 * ramp(u), 0, 0.35 * ramp(u)],
        ...Object.fromEntries(tails.map((b) => [b, (t, u) => [0, 0.25 * ramp(u), 0]])),
      },
    },
    {
      name: 'Sit',
      from: 'Idle',
      duration: 0.5,
      loop: false,
      rot: {
        [neck]: (t, u) => [-0.2 * ramp(u), 0, 0],
        ...Object.fromEntries(tails.map((b, i) => [b, (t, u) => [(i === 0 ? 0.3 : 0.1) * ramp(u), 0, 0]])),
      },
    },
  ];
}

export function addProceduralClips(doc, src) {
  const specs = src.id === 'robot' ? robotClips() : src.id === 'rex' ? rexClips() : src.rig ? quadClips(src) : astroClips(src);
  for (const spec of specs) buildClip(doc, spec);
}
