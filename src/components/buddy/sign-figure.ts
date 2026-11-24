/*
 * The 3D figure of the sign language concept preview, drawn with three.js.
 * Ported from the Gcina project (sasl-preview.tsx). This file and three.js are
 * only downloaded when someone switches the preview on (see bona-buddy.tsx).
 *
 * The figure does NOT sign. It makes a placeholder gesture per word.
 */
import * as THREE from "three";
import { poseFor, REST, WAVE, type ArmPose } from "./sign-words";

/** The word being shown now, when it started (performance.now) and for how long. */
export type SignCue = { word: string; start: number; dur: number };

export type SignFigure = {
  resize(width: number, height: number): void;
  dispose(): void;
};

type Arm = {
  side: number;
  shoulder: THREE.Group;
  elbow: THREE.Group;
  hand: THREE.Group;
  fingers: [THREE.Group, THREE.Group][];
  thumb: THREE.Group;
  cur: ArmPose;
};

/**
 * Builds the figure inside `host` and starts drawing. Returns null when the
 * device cannot do WebGL. `cue` and `waving` are read on every frame.
 */
export function createSignFigure(
  host: HTMLElement,
  options: {
    cue: () => SignCue | null;
    /** True while there is nothing to show, so the figure waves hello. */
    waving: () => boolean;
    /** No idle sway, no waving; poses change at once instead of gliding. */
    reduceMotion: boolean;
  },
): SignFigure | null {
  const reduce = options.reduceMotion;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.style.display = "block";

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 164 / 196, 0.1, 50);
  camera.position.set(0, 0.5, 3.75);
  camera.lookAt(0, 0.4, 0);

  // Studio lighting: warm key, soft fill, a pale blue rim so the hands stand out.
  scene.add(new THREE.HemisphereLight(0xfff6ec, 0x101a3d, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(2.2, 3, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffe2cc, 0.55);
  fill.position.set(-3, 1, 2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0x9bb8ff, 1.5);
  rim.position.set(-1.5, 2.5, -3);
  scene.add(rim);

  const skin = new THREE.MeshPhysicalMaterial({
    color: 0x8a5a3c,
    roughness: 0.55,
    sheen: 0.4,
    sheenColor: new THREE.Color(0xffc9a8),
    sheenRoughness: 0.6,
  });
  // BonaWork blue shirt with a white collar.
  const shirt = new THREE.MeshStandardMaterial({ color: 0x0346ff, roughness: 0.72 });
  const collar = new THREE.MeshStandardMaterial({ color: 0xfffdf8, roughness: 0.6 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x17171b, roughness: 0.92 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.35 });
  const iris = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.25 });
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lipMat = new THREE.MeshStandardMaterial({ color: 0x6e3030, roughness: 0.5 });
  const mouthIn = new THREE.MeshStandardMaterial({ color: 0x2c0b0b, roughness: 0.9 });
  const browMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.9 });
  const materials: THREE.Material[] = [
    skin,
    shirt,
    collar,
    hairMat,
    white,
    iris,
    shine,
    lipMat,
    mouthIn,
    browMat,
  ];
  const geometries: THREE.BufferGeometry[] = [];
  const g = <T extends THREE.BufferGeometry>(geometry: T) => {
    geometries.push(geometry);
    return geometry;
  };

  const body = new THREE.Group();
  scene.add(body);

  // Torso: a smooth lathe from waist to shoulders, flattened front to back.
  const profile = [
    [0.0, -0.62],
    [0.29, -0.6],
    [0.32, -0.3],
    [0.35, 0.0],
    [0.4, 0.22],
    [0.38, 0.32],
    [0.24, 0.42],
    [0.11, 0.46],
    [0.0, 0.47],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const torso = new THREE.Mesh(g(new THREE.LatheGeometry(profile, 40)), shirt);
  torso.scale.z = 0.7;
  body.add(torso);
  const collarRing = new THREE.Mesh(
    g(new THREE.TorusGeometry(0.115, 0.026, 10, 32)),
    collar,
  );
  collarRing.rotation.x = Math.PI / 2;
  collarRing.position.y = 0.45;
  collarRing.scale.set(1, 0.85, 1);
  body.add(collarRing);
  const neck = new THREE.Mesh(g(new THREE.CylinderGeometry(0.085, 0.1, 0.2, 20)), skin);
  neck.position.y = 0.53;
  body.add(neck);

  // Head.
  const head = new THREE.Group();
  head.position.y = 0.83;
  body.add(head);
  const skull = new THREE.Mesh(g(new THREE.SphereGeometry(0.27, 40, 28)), skin);
  skull.scale.set(0.94, 1.08, 0.98);
  head.add(skull);
  const earGeo = g(new THREE.SphereGeometry(0.055, 16, 12));
  for (const x of [-0.25, 0.25]) {
    const ear = new THREE.Mesh(earGeo, skin);
    ear.position.set(x, 0.0, -0.01);
    ear.scale.set(0.5, 1, 0.75);
    head.add(ear);
  }
  const nose = new THREE.Mesh(g(new THREE.SphereGeometry(0.042, 16, 12)), skin);
  nose.position.set(0, -0.025, 0.255);
  nose.scale.set(1, 0.85, 0.9);
  head.add(nose);

  // Short textured hair: a cap plus small curls spread over the top of the head.
  const cap = new THREE.Mesh(
    g(new THREE.SphereGeometry(0.285, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2.15)),
    hairMat,
  );
  cap.scale.set(0.95, 1.08, 0.99);
  cap.rotation.x = -0.18;
  head.add(cap);
  const curlGeo = g(new THREE.IcosahedronGeometry(0.034, 1));
  const CURLS = 90;
  const curls = new THREE.InstancedMesh(curlGeo, hairMat, CURLS);
  const matrix = new THREE.Matrix4();
  const tilt = new THREE.Vector3(1, 0, 0);
  const headShape = new THREE.Vector3(0.27, 0.293, 0.283);
  let placed = 0;
  for (let i = 0; i < CURLS * 2 && placed < CURLS; i++) {
    const y = 1 - (i / (CURLS * 2 - 1)) * 0.62;
    const ring = Math.sqrt(1 - y * y);
    const angle = i * 2.399963;
    const p = new THREE.Vector3(
      Math.cos(angle) * ring,
      y,
      Math.sin(angle) * ring,
    ).applyAxisAngle(tilt, -0.18);
    if (p.z > 0.55 && p.y < 0.72) continue; // keep the forehead clear
    p.multiply(headShape);
    matrix.makeTranslation(p.x, p.y, p.z);
    curls.setMatrixAt(placed++, matrix);
  }
  curls.count = placed;
  head.add(curls);

  // Eyes (they blink), brows, mouth.
  const eyes: THREE.Group[] = [];
  const brows: THREE.Mesh[] = [];
  const scleraGeo = g(new THREE.SphereGeometry(0.043, 20, 14));
  const irisGeo = g(new THREE.SphereGeometry(0.025, 16, 12));
  const shineGeo = g(new THREE.SphereGeometry(0.007, 8, 6));
  const browGeo = g(new THREE.CapsuleGeometry(0.012, 0.065, 4, 8));
  for (const x of [-0.092, 0.092]) {
    const eye = new THREE.Group();
    eye.position.set(x, 0.045, 0.218);
    head.add(eye);
    const sclera = new THREE.Mesh(scleraGeo, white);
    sclera.scale.set(1, 0.92, 0.55);
    eye.add(sclera);
    const pupil = new THREE.Mesh(irisGeo, iris);
    pupil.position.z = 0.017;
    pupil.scale.z = 0.5;
    eye.add(pupil);
    const glint = new THREE.Mesh(shineGeo, shine);
    glint.position.set(0.008, 0.009, 0.03);
    eye.add(glint);
    eyes.push(eye);
    const brow = new THREE.Mesh(browGeo, browMat);
    brow.rotation.z = Math.PI / 2 + (x < 0 ? -0.08 : 0.08);
    brow.position.set(x, 0.118, 0.236);
    head.add(brow);
    brows.push(brow);
  }
  const mouth = new THREE.Group();
  mouth.position.set(0, -0.125, 0.232);
  head.add(mouth);
  const inner = new THREE.Mesh(g(new THREE.SphereGeometry(1, 20, 12)), mouthIn);
  mouth.add(inner);
  const smile = new THREE.Mesh(
    g(new THREE.TorusGeometry(0.052, 0.011, 8, 24, Math.PI)),
    lipMat,
  );
  smile.rotation.z = Math.PI;
  smile.position.y = 0.022;
  smile.scale.set(1, 0.55, 0.6);
  mouth.add(smile);

  // Arms with two-joint fingers.
  const upperGeo = g(new THREE.CapsuleGeometry(0.082, 0.3, 6, 14));
  const cuffGeo = g(new THREE.TorusGeometry(0.083, 0.014, 8, 20));
  const foreGeo = g(new THREE.CapsuleGeometry(0.066, 0.28, 6, 14));
  const palmGeo = g(new THREE.CapsuleGeometry(0.068, 0.07, 6, 14));
  const segGeo = g(new THREE.CapsuleGeometry(0.021, 0.04, 4, 8));
  const thumbGeo = g(new THREE.CapsuleGeometry(0.024, 0.045, 4, 8));

  const arm = (side: number): Arm => {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.39 * side, 0.27, 0);
    body.add(shoulder);
    const upper = new THREE.Mesh(upperGeo, shirt);
    upper.position.y = -0.2;
    shoulder.add(upper);
    const cuff = new THREE.Mesh(cuffGeo, collar);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -0.36;
    shoulder.add(cuff);
    const elbow = new THREE.Group();
    elbow.position.y = -0.42;
    shoulder.add(elbow);
    const fore = new THREE.Mesh(foreGeo, skin);
    fore.position.y = -0.18;
    elbow.add(fore);
    const hand = new THREE.Group();
    hand.position.y = -0.38;
    elbow.add(hand);
    const palm = new THREE.Mesh(palmGeo, skin);
    palm.position.y = -0.06;
    palm.scale.set(1.05, 1, 0.45);
    hand.add(palm);
    const fingers = [-0.051, -0.017, 0.017, 0.051].map(
      (x, i): [THREE.Group, THREE.Group] => {
        const len = i === 1 ? 1.08 : i === 3 ? 0.82 : 1;
        const knuckle = new THREE.Group();
        knuckle.position.set(x * side, -0.135, 0);
        hand.add(knuckle);
        const prox = new THREE.Mesh(segGeo, skin);
        prox.position.y = -0.036 * len;
        prox.scale.y = len;
        knuckle.add(prox);
        const mid = new THREE.Group();
        mid.position.y = -0.068 * len;
        knuckle.add(mid);
        const dist = new THREE.Mesh(segGeo, skin);
        dist.position.y = -0.032 * len;
        dist.scale.set(0.92, len * 0.9, 0.92);
        mid.add(dist);
        return [knuckle, mid];
      },
    );
    const thumb = new THREE.Group();
    thumb.position.set(-0.075 * side, -0.045, 0.012);
    hand.add(thumb);
    const thumbMesh = new THREE.Mesh(thumbGeo, skin);
    thumbMesh.position.y = -0.045;
    thumb.add(thumbMesh);
    return {
      side,
      shoulder,
      elbow,
      hand,
      fingers,
      thumb,
      cur: { ...REST, curl: [...REST.curl] },
    };
  };
  const arms = [arm(-1), arm(1)];

  const face = { open: 0.1, brow: 0 };
  let blinkAt = performance.now() + 2500;
  let raf = 0;
  let last = performance.now();

  const frame = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    const cue = options.cue();
    const pose = cue ? poseFor(cue.word) : null;
    const p = cue ? Math.min(1, Math.max(0, (now - cue.start) / cue.dur)) : 0;
    const k = 1 - Math.exp(-dt * (reduce ? 40 : 11));

    body.position.y = reduce ? 0 : Math.sin(t * 1.6) * 0.012;
    torso.scale.x = reduce ? 1 : 1 + Math.sin(t * 1.6) * 0.006; // breathing
    head.rotation.y = reduce
      ? 0
      : pose
        ? Math.sin(t * 2.1) * 0.1
        : Math.sin(t * 0.7) * 0.07;
    head.rotation.x = pose && !reduce ? Math.sin(Math.PI * p) * 0.07 : 0;
    head.rotation.z = reduce ? 0 : Math.sin(t * 0.5) * 0.02;

    for (const a of arms) {
      const gesturing = pose && (a.side > 0 || pose.two);
      const target: ArmPose = pose
        ? a.side > 0
          ? pose.r
          : pose.l
        : options.waving() && a.side > 0 && !reduce
          ? WAVE
          : REST;
      let msx = 0;
      let msz = 0;
      let mex = 0;
      let mez = 0;
      if (pose && cue && gesturing && !reduce) {
        const envelope = Math.sin(Math.PI * p);
        if (pose.spell) {
          // a small tap per character
          mex = -Math.abs(Math.sin(p * Math.PI * Math.max(2, cue.word.length))) * 0.18;
        } else if (pose.move < 0.34) {
          msx = Math.sin(p * Math.PI * 4) * 0.13 * envelope; // small circles
          msz = Math.cos(p * Math.PI * 4) * 0.1 * envelope;
        } else if (pose.move < 0.67) {
          mex = -Math.abs(Math.sin(p * Math.PI * 3)) * 0.3; // repeated taps
        } else {
          msz = (p - 0.5) * 0.55; // a sweep across the body
        }
      } else if (target === WAVE) {
        mez = Math.sin(t * 6) * 0.35;
      }
      const cur = a.cur;
      cur.sx += (target.sx + msx - cur.sx) * k;
      cur.sz += (target.sz + msz - cur.sz) * k;
      cur.ex += (target.ex + mex - cur.ex) * k;
      cur.ez += (target.ez + mez - cur.ez) * k;
      cur.wy += (target.wy - cur.wy) * k;
      for (let i = 0; i < 5; i++) cur.curl[i] += (target.curl[i] - cur.curl[i]) * k;
      a.shoulder.rotation.set(cur.sx, 0, a.side * cur.sz);
      a.elbow.rotation.set(cur.ex, 0, cur.ez);
      a.hand.rotation.set(-0.25, a.side * cur.wy, 0);
      a.fingers.forEach(([knuckle, mid], i) => {
        knuckle.rotation.x = -cur.curl[i] * 0.95;
        mid.rotation.x = -cur.curl[i] * 1.15;
      });
      a.thumb.rotation.set(-cur.curl[4] * 1.1, 0, -a.side * (0.5 + cur.curl[4] * 0.4));
    }

    // Blinking: a quick 140 ms close-and-open every few seconds.
    let lid = 1;
    if (!reduce) {
      const since = now - blinkAt;
      if (since >= 140) blinkAt = now + 2600 + Math.random() * 2600;
      else if (since >= 0) lid = Math.max(0.08, Math.abs(since - 70) / 70);
    }
    for (const eye of eyes) eye.scale.y = lid;

    // The mouth moves with the word, and the brows lift for a question.
    const syllables = cue ? Math.max(1, Math.round(cue.word.length / 3)) : 1;
    const openTarget =
      pose && !reduce ? 0.25 + 0.75 * Math.abs(Math.sin(p * Math.PI * syllables)) : 0.05;
    face.open += (openTarget - face.open) * k;
    face.brow += ((pose?.brow ?? 0) - face.brow) * k;
    inner.scale.set(0.045, 0.006 + face.open * 0.034, 0.02);
    smile.scale.set(1 - face.open * 0.25, 0.55 - face.open * 0.25, 0.6);
    for (const brow of brows) brow.position.y = 0.118 + face.brow * 0.032;

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  frame();

  return {
    resize(width, height) {
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    dispose() {
      cancelAnimationFrame(raf);
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      curls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
