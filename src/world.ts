import { mat3, quat, vec3, vec4 } from "gl-matrix";
import alea from 'alea';
import { createNoise2D } from 'simplex-noise';

import { Mat3, Vec3, Vec4 } from "./types";

enum Material {
  Immovable = 0,
  Movable = 1,
  Permeable = 2,
};

const createGaussian = ({position, color, scale, q, material}: {position: vec3, color: vec4, scale: vec3, q: quat, material: Material}) => {
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

  return [
    // Color rgba
    ...(color as number[]),
    // Position xyz and distance to camera
    ...(position as number[]), 0,
    // Size xyz and padding
    ...(scale as number[]), 0,
    // Covariance matrix
    // 0  1  2  padding
    //    3  4
    //       5
    ...covA, 0,
    ...covB, 0,
    // Velocity and material
    0, 0, 0, material,
  ];
};

// Function to return a realistic color based on altitude in meters


export const generateWorldGaussians = () => {
  const randomFunction = alea("0");
  const noise2D = createNoise2D(randomFunction);

  const gaussianList: number[][] = [];

  const generateDistance = 100;
  const groundSpacing = 1.5;
  const groundScale = 1.0;
  const groundHeight = (x: number, z: number) => {
    // return 0;
    // return noise2D(x / 1000, z / 1000) * 100;
    let f = 1/10000;
    var fbm = noise2D(x * f, z * f);
    f *= 2; x += 32;
    fbm += noise2D(x * f, z * f) * 0.5;
    f *= 2; x += 42;
    fbm += noise2D(x * f, z * f) * 0.25;
    f *= 2; x += 9973;
    fbm += noise2D(x * f, z * f) * 0.125;
    f *= 2; x += 824;
    fbm += noise2D(x * f, z * f) * 0.065;
    return fbm*300;
    // const hillFreqency = 10;
    // return 0.75*hillFreqency*Math.sin(x / hillFreqency) * Math.sin(z / hillFreqency);
  };

  const groundColor = (y: number) => {
    // return [0.1, 0.3, 0.1];
    // const shade = 0.9 + Math.random()*0.1;
    y = y / 150 + 2;
    const colorAltitudes = [
      {altitude: 0, color: [0.4, 0.8, 1.0]},
      {altitude: 1, color: [0.4, 0.8, 0.4]},
      {altitude: 2, color: [0.5, 0.7, 0.4]},
      {altitude: 3, color: [0.8, 0.8, 0.5]},
      {altitude: 4, color: [0.8, 0.8, 0.8]},
      {altitude: 5, color: [1.0, 1.0, 1.0]},
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
  gaussianList.push(createGaussian({
    position: [0, 50, 0],
    color: [0.2, 0.2, 0.2, 0],
    scale: [1, 1, 1],
    q: quat.fromEuler([0, 0, 0, 0], 0, 0, 0),
    material: Material.Movable,
  }));

  // Grass
  for (let i = 0; i < 1000; i++) {
    const color: Vec4 = [0.1*Math.random(), 0.3 + 0.6*Math.random(), 0.1*Math.random(), 1];
    const height = 0.2 + 0.2 * Math.random();
    const x = generateDistance*(2*Math.random() - 1);
    const z = generateDistance*(2*Math.random() - 1);
    const position: Vec3 = [
      x,
      1.5*height + groundHeight(x, z),
      z,
    ];
    const scale: Vec3 = [0.1, height, 0.1];
    const q = quat.fromEuler([0, 0, 0, 0], 20*(Math.random() - 0.5), 20*(Math.random() - 0.5), 0);
    gaussianList.push(createGaussian({position, color, scale, q, material: Material.Permeable}));
  }

  // Ground
  for (let x = -generateDistance; x <= generateDistance; x += groundSpacing) {
    for (let z = -generateDistance; z <= generateDistance; z += groundSpacing) {
      const q = quat.fromEuler([0, 0, 0, 0], 0, 0, 0);
      const height = groundHeight(x, z);
      const position: Vec3 = [
        x,
        height - 2*groundScale,
        z,
      ];
      const c = groundColor(height);
      const shade = Math.random();
      gaussianList.push(createGaussian({
        position,
        color: [0.3*shade + 0.7*c[0], 0.3*shade + 0.7*c[1], 0.3*shade + 0.7*c[2], c[3]],
        scale: [groundScale, groundScale, groundScale],
        q,
        material: Material.Immovable,
      }));
    }
  }

  const q = quat.fromEuler([0, 0, 0, 0], 0, 0, 0);

  // Trees
  for (var i = 0; i < 100; i += 2) {
    const x = generateDistance*(2*Math.random() - 1);
    const z = generateDistance*(2*Math.random() - 1);
    const p = [
      x,
      groundHeight(x, z),
      z,
    ];
    // Trunk
    for (let i = 0; i < 50; i += 2) {
      const shade = 0.2 + Math.random()*0.5;
      const width = .3 - 0.2*i/50;
      p[0] += (Math.random() - 0.5)*width;
      p[2] += (Math.random() - 0.5)*width;
      gaussianList.push(createGaussian({
        position: [p[0], p[1] + 0.25*i + 0.5, p[2]],
        color: [shade*1.0, shade*0.5, shade*0.1, 1],
        scale: [width, 0.3, width],
        q,
        material: Material.Movable,
      }));
    }

    // Leaves
    for (let i = 0; i < 50; i++) {
      const pos: Vec3 = [
        2*Math.random() - 1,
        2*Math.random() - 1,
        2*Math.random() - 1,
      ];
      while (vec3.squaredLength(pos) > 1) {
        pos[0] = 2*Math.random() - 1;
        pos[1] = 2*Math.random() - 1;
        pos[2] = 2*Math.random() - 1;
      }
      gaussianList.push(createGaussian({
        position: [p[0] + 5*pos[0], p[1] + 15 + 5*pos[1], p[2] + 5*pos[2]],
        color: [0.3 + 0.5*Math.random(), 0.2 + 0.6*Math.random(), 0.1*Math.random(), 1],
        scale: [.5, .5, .5],
        q,
        material: Material.Movable,
      }));
    }
  }
  // // Walls around world edge
  // for (let x = -groundSize/2; x <= groundSize/2; x += 1) {
  //   for (let y = 0; y <= 10; y += 1) {
  //     const q = quat.fromEuler([0, 0, 0, 0], 0, 0, 0);
  //     const shade = 0.3 + Math.random()*0.4;
  //     const position: Vec3 = [
  //       x*groundSpacing,
  //       y*groundSpacing,
  //       -groundSize*groundSpacing/2,
  //     ];
  //     gaussianList.push(createGaussian({
  //       position,
  //       color: [1.0*shade, 0.3*shade, 0.1*shade, 1],
  //       scale: [1, 1, 1],
  //       q,
  //       material: Material.Immovable,
  //     }));
  //     position[2] = groundSize*groundSpacing/2;
  //     gaussianList.push(createGaussian({
  //       position,
  //       color: [1.0*shade, 0.3*shade, 0.1*shade, 1],
  //       scale: [1, 1, 1],
  //       q,
  //       material: Material.Immovable,
  //     }));
  //   }
  // }
  // // Walls on other two sides of world
  // for (let y = 0; y <= 10; y += 1) {
  //   for (let z = -groundSize/2; z <= groundSize/2; z += 1) {
  //     const q = quat.fromEuler([0, 0, 0, 0], 0, 0, 0);
  //     const shade = 0.3 + Math.random()*0.4;
  //     const position: Vec3 = [
  //       -groundSize*groundSpacing/2,
  //       y*groundSpacing,
  //       z*groundSpacing,
  //     ];
  //     gaussianList.push(createGaussian({
  //       position,
  //       color: [1.0*shade, 0.3*shade, 0.1*shade, 1],
  //       scale: [1, 1, 1],
  //       q,
  //       material: Material.Immovable,
  //     }));
  //     position[0] = groundSize*groundSpacing/2;
  //     gaussianList.push(createGaussian({
  //       position,
  //       color: [1.0*shade, 0.3*shade, 0.1*shade, 1],
  //       scale: [1, 1, 1],
  //       q,
  //       material: Material.Immovable,
  //     }));
  //   }
  // }

  // Raindrops falling from the sky
  for (let i = 0; i < 0; i++) {
    const x = generateDistance*(2*Math.random() - 1);
    const z = generateDistance*(2*Math.random() - 1);
    const p = [
      x,
      20*Math.random(),
      z,
    ];
    gaussianList.push(createGaussian({
      position: [p[0], p[1], p[2]],
      color: [0.3, 0.6, 0.9, 0.3],
      scale: [0.2, 0.2, 0.2],
      q,
      material: Material.Movable,
    }));
  }

  // Wider world
  const deltaAngle = Math.PI/100;
  for (let d = 100; d < 10000; d *= 1.05) {
    const scale = d*Math.tan(deltaAngle);
    for (let ang = 0; ang < 2*Math.PI; ang += deltaAngle) {
      const x = d*Math.cos(ang);
      const z = d*Math.sin(ang);
      let y = groundHeight(x, z);
      let c = groundColor(y);
      gaussianList.push(createGaussian({
        position: [x, y - 2*scale, z],
        color: c,
        scale: [scale, scale, scale],
        q,
        material: Material.Immovable,
      }));
    }
  }

  return gaussianList;
};
