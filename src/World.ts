import { mat3, quat, vec2, vec3, vec4 } from "gl-matrix";
import alea from 'alea';
import { createNoise2D } from 'simplex-noise';
// https://github.com/frostoven/BSC5P-JSON-XYZ/tree/primary
import stars from './bsc5p_3d.json';

import { Mat3, Material, State, Vec2, Vec3, Vec4 } from "./types";
import { generateBranchStructure, getRandomTree } from "./tree";

const randomPointInCircle = (center: vec2, radius: number): Vec2 => {
  const r = radius * Math.sqrt(Math.random());
  const theta = 2 * Math.PI * Math.random();
  return [
    center[0] + r * Math.cos(theta),
    center[1] + r * Math.sin(theta),
  ];
};

const randomPointInSphere = (center: vec3, radius: number): Vec3 => {
  const r = radius * Math.pow(Math.random(), 1/3);
  const theta = 2 * Math.PI * Math.random();
  const phi = Math.acos(2 * Math.random() - 1);
  return [
    center[0] + r * Math.sin(phi) * Math.cos(theta),
    center[1] + r * Math.sin(phi) * Math.sin(theta),
    center[2] + r * Math.cos(phi),
  ];
};

export class World {

  gaussianList: number[][] = [];

  currentGaussianID = 0;

  noise2D: (x: number, y: number) => number;

  constructor() {
    const randomFunction = alea(Math.random());
    this.noise2D = createNoise2D(randomFunction);
  }

  groundHeight(x: number, z: number) {
    // return 0;
    // return noise2D(x / 1000, z / 1000) * 100;
    let f = 1/10000;
    var fbm = this.noise2D(x * f, z * f);
    f *= 2; x += 32;
    fbm += this.noise2D(x * f, z * f) * 0.5;
    f *= 2; x += 42;
    fbm += this.noise2D(x * f, z * f) * 0.25;
    f *= 2; x += 9973;
    fbm += this.noise2D(x * f, z * f) * 0.125;
    f *= 2; x += 824;
    fbm += this.noise2D(x * f, z * f) * 0.065;
    const height = 300 * fbm + 100;
    // if (height / 150 + 2 < 0) {
    //   return -300;
    // }
    return height;
  }

  createGaussian(options: {position: vec3, color: vec4, scale: vec3, q: quat, material: Material, state?: State}) {
    let { position, color, scale, q, material, state } = options;
    let R = mat3.fromQuat(new Array(9) as Mat3, q);
    const M = [
      scale[0] * R[0],
      scale[0] * R[1],
      scale[0] * R[2],
      scale[1] * R[3],
      scale[1] * R[4],
      scale[1] * R[5],
      scale[2] * R[6],
      scale[2] * R[7],
      scale[2] * R[8],
    ];

    const covA = new Array(3) as number[];
    covA[0] = M[0] * M[0] + M[3] * M[3] + M[6] * M[6];
    covA[1] = M[0] * M[1] + M[3] * M[4] + M[6] * M[7];
    covA[2] = M[0] * M[2] + M[3] * M[5] + M[6] * M[8];
    const covB = new Array(3) as number[];
    covB[0] = M[1] * M[1] + M[4] * M[4] + M[7] * M[7];
    covB[1] = M[1] * M[2] + M[4] * M[5] + M[7] * M[8];
    covB[2] = M[2] * M[2] + M[5] * M[5] + M[8] * M[8];

    const id = this.currentGaussianID;
    this.currentGaussianID += 1;

    return [
      // Color rgba
      ...(color as number[]),
      // Position xyz and distance to camera
      ...(position as number[]), 0,
      // Size xyz and padding
      ...(scale as number[]), state ?? State.Used,
      // Covariance matrix
      // 0  1  2  ID
      //    3  4
      //       5  padding
      ...covA, id,
      ...covB, 0,
      // Velocity and material
      0, 0, 0, material,
    ];
  }

  generateWorldGaussians() {

    const gaussianList: number[][] = [];

    // const generateDistance = 2;
    const generateDistance = 100;
    const groundSpacing = 1;
    // const groundScale = 0.1;
    const groundScale = 1;

    const groundColor = (y: number) => {
      const colorAltitudes = [
        {altitude: -50, color: [0.8, 0.8, 0.3]},
        {altitude: 0, color: [1.0, 0.9, 0.6]},
        {altitude: 20, color: [0.4, 0.8, 0.4]},
        {altitude: 300, color: [0.5, 0.7, 0.4]},
        {altitude: 450, color: [0.8, 0.8, 0.5]},
        {altitude: 600, color: [0.8, 0.8, 0.8]},
        {altitude: 750, color: [1.0, 1.0, 1.0]},
      ];
      for (let i = 0; i < colorAltitudes.length - 1; i++) {
        if (y < colorAltitudes[i].altitude) {
          if (i === 0) {
            return [...colorAltitudes[0].color, 1] as Vec4;
          }
          const a = colorAltitudes[i - 1].altitude;
          const b = colorAltitudes[i].altitude;
          const c = (y - a) / (b - a);
          const colorA = colorAltitudes[i - 1].color;
          const colorB = colorAltitudes[i].color;
          return [
            (1 - c) * colorA[0] + c * colorB[0],
            (1 - c) * colorA[1] + c * colorB[1],
            (1 - c) * colorA[2] + c * colorB[2],
            1,
          ] as Vec4;
        }
      }
      return [1, 1, 1, 1] as Vec4;
    }

    // Player
    gaussianList.push(this.createGaussian({
      position: [0, 50, 0],
      color: [0.2, 0.2, 0.2, 0],
      scale: [1, 1, 1],
      q: quat.fromEuler([0, 0, 0, 0], 0, 0, 0),
      material: Material.Movable,
    }));

    const q = quat.fromEuler([0, 0, 0, 0], 0, 0, 0);

    // Stars
    const parsec = 3.086e+16;
    const starDistScale = parsec / 10e8;
    let totalBrightness = 0;
    stars.forEach((star) => {
      if (!star.x || !star.y || !star.z || !star.K) {
        return;
      }
      const brightness = 500 * star.N / (star.p**2 * 4 * Math.PI);
      totalBrightness += brightness;
      gaussianList.push(this.createGaussian({
        position: [starDistScale * star.x, starDistScale * star.y, starDistScale * star.z],
        color: [star.K.r ?? 1, star.K.g ?? 1, star.K.b ?? 1, brightness],
        scale: [1, 1, 1],
        q,
        material: Material.Star,
      }));
    });
    // console.log('totalBrightness', totalBrightness / stars.length);

    // Grass
    for (let i = 0; i < 0; i++) {
      const color: Vec4 = [0.1*Math.random(), 0.3 + 0.6*Math.random(), 0.1*Math.random(), 1];
      const height = 0.2 + 0.2 * Math.random();
      const [x, z] = randomPointInCircle([0, 0], generateDistance);
      const position: Vec3 = [
        x,
        1.5*height + this.groundHeight(x, z),
        z,
      ];
      const scale: Vec3 = [0.05, height, 0.05];
      const q = quat.fromEuler([0, 0, 0, 0], 20*(Math.random() - 0.5), 20*(Math.random() - 0.5), 0);
      gaussianList.push(this.createGaussian({position, color, scale, q, material: Material.Permeable}));
    }

    // Ground
    for (let x = -generateDistance; x <= generateDistance; x += groundSpacing) {
      for (let z = -generateDistance; z <= generateDistance; z += groundSpacing) {
        if (x**2 + z**2 > generateDistance**2) {
          continue;
        }
        const height = this.groundHeight(x, z);
        const position: Vec3 = [
          x,
          height - 2*groundScale,
          z,
        ];
        const c = groundColor(height);
        const shade = Math.random();
        gaussianList.push(this.createGaussian({
          position,
          color: [0.1*shade + 0.9*c[0], 0.1*shade + 0.9*c[1], 0.1*shade + 0.9*c[2], c[3]],
          scale: [groundScale, groundScale, groundScale],
          q,
          material: Material.Immovable,
        }));
      }
    }


    // Trees
    for (var i = 0; i < 100; i += 2) {
      const [x, z] = randomPointInCircle([0, 0], generateDistance);
      const p = [
        x,
        this.groundHeight(x, z),
        z,
      ];
      const tree = getRandomTree();
      const branches = generateBranchStructure(tree);
      for (const branch of branches) {
        const branchSegmentSize = Math.max(Math.min(branch.radius * 4, 2), 1);
        const q = quat.rotationTo(quat.create(), [0, 1, 0], branch.direction);
        for (let d = 0; d < branch.length; d += branchSegmentSize) {
          const shade = 0.2 + Math.random()*0.5;
          const position: Vec3 = [
            p[0] + d * branch.direction[0] + branch.start[0],
            p[1] + d * branch.direction[1] + branch.start[1],
            p[2] + d * branch.direction[2] + branch.start[2],
          ];
          const color: Vec4 = [shade*1.0, shade*0.5, shade*0.1, 1];
          const curRadius = branch.radius;
          // const offsetPercent = d / branch.length;
          // const curRadius = (1 - offsetPercent) * branch.radius;
          const scale: Vec3 = [curRadius, branchSegmentSize / 2, curRadius];
          gaussianList.push(this.createGaussian({position, color, scale, q, material: Material.Immovable}));

          // Sometimes place a leaf
          if (curRadius < 0.3 && Math.random() < 0.4) {
            const pos = randomPointInSphere([0, 0, 0], 1.5)
            const color: Vec4 = [0.1*Math.random(), 0.3 + 0.6*Math.random(), 0.1*Math.random(), 0.75];
            // color: [0.3 + 0.5*Math.random(), 0.2 + 0.6*Math.random(), 0.1*Math.random(), 1],
            gaussianList.push(this.createGaussian({
              position: [position[0] + pos[0], position[1] + pos[1], position[2] + pos[2]],
              color,
              scale: [.5, .5, .5],
              q,
              material: Material.Immovable,
              // material: Material.Movable,
            }));
          }
        }
      }
    }

    // Wider world
    const deltaAngle = 2*Math.PI/800;
    let scale = generateDistance*Math.tan(deltaAngle);
    for (let d = generateDistance; d < 1000; d += 2*scale) {
      scale = d*Math.tan(deltaAngle)/2;
      for (let ang = 0; ang < 2*Math.PI - deltaAngle/2; ang += deltaAngle) {
        const x = d*Math.cos(ang);
        const z = d*Math.sin(ang);
        let y = this.groundHeight(x, z);
        let c = groundColor(y);
        gaussianList.push(this.createGaussian({
          position: [x, y - 2*scale, z],
          color: c,
          scale: [scale, scale, scale],
          q,
          material: Material.Immovable,
        }));
        if (y < 0) {
          gaussianList.push(this.createGaussian({
            position: [x, 0 - 2*scale, z],
            color: [0.2, 0.4, 0.8, 0.25],
            scale: [scale, scale, scale],
            q,
            material: Material.Permeable,
            // material: Material.Movable,
          }));
        }
      }
    }

    // Free slots
    for (let i = 0; i < 50000; i++) {
      const color: Vec4 = [0, 0, 0, 1];
      const position: Vec3 = [1e10, 1e10, 1e10];
      const scale: Vec3 = [0.5, 0.5, 0.5];
      const q = quat.fromEuler([0, 0, 0, 0], 0, 0, 0);
      gaussianList.push(this.createGaussian({position, color, scale, q, material: Material.Immovable, state: State.Free}));
    }

    this.gaussianList = gaussianList;
    console.log(gaussianList.length);
  }
}

