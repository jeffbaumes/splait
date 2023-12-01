import { vec3 } from "gl-matrix";
import { G } from "./types";

let gaussianList: number[][] = [];
let eye: vec3 = [0., 0., 0.];
let gaussians: Float32Array = new Float32Array();

const MaxSimulationDistance = 25.;
const MaxObjectSize = 1.;

const merge = (updates: number[][]) => {
  let maxDistanceIndex = 0;
  while (gaussians[maxDistanceIndex*G.Stride + G.Distance] < MaxSimulationDistance + 2.*MaxObjectSize) {
    maxDistanceIndex += 1;
  }

  const updateMap: {[id: number]: number[]} = {};
  updates.forEach((update) => {
    updateMap[update[G.ID]] = update;
  });
  for (let i = 0; i < gaussians.length; i += G.Stride) {
    const update = updateMap[gaussians[i + G.ID]];
    const g = gaussianList[i/G.Stride];
    if (update) {
      const distance = vec3.dist(eye, [gaussians[i + G.PosX], gaussians[i + G.PosY], gaussians[i + G.PosZ]]);
      gaussians[i + G.PosX] = update[G.PosX];
      gaussians[i + G.PosY] = update[G.PosY];
      gaussians[i + G.PosZ] = update[G.PosZ];
      gaussians[i + G.VelX] = update[G.VelX];
      gaussians[i + G.VelY] = update[G.VelY];
      gaussians[i + G.VelZ] = update[G.VelZ];
      gaussians[i + G.Distance] = distance;
      g[G.PosX] = update[G.PosX];
      g[G.PosY] = update[G.PosY];
      g[G.PosZ] = update[G.PosZ];
      g[G.VelX] = update[G.VelX];
      g[G.VelY] = update[G.VelY];
      g[G.VelZ] = update[G.VelZ];
      g[G.Distance] = distance;
    }
  }

  postMessage({type: 'merge', gaussians, gaussianList: gaussianList.slice(0, maxDistanceIndex)}, {transfer: [gaussians.buffer]});
};

const sort = () => {
  console.timeEnd('everything else');
  console.time('distance');
  gaussianList.forEach((d) => {
    d[G.Distance] = vec3.dist(eye, [d[G.PosX], d[G.PosY], d[G.PosZ]]);
  });
  console.timeEnd('distance');
  console.time('sort');
  gaussianList.sort((a, b) => a[G.Distance] - b[G.Distance]);
  console.timeEnd('sort');
  console.time('flatten');
  if (gaussians.length !== gaussianList.length*G.Stride) {
    gaussians = new Float32Array(gaussianList.length*G.Stride);
  }
  for (let i = 0; i < gaussianList.length; i += 1) {
    for (let j = 0; j < G.Stride; j += 1) {
      gaussians[i*G.Stride + j] = gaussianList[i][j];
    }
  }
  console.timeEnd('flatten');
  console.time('everything else');
  postMessage({type: 'sort', eye});
};

onmessage = (e) => {
  if (e.data.type === 'gaussians') {
    gaussianList = e.data.gaussianList;
  } else if (e.data.type === 'sort') {
    eye = e.data.eye;
    sort();
  } else if (e.data.type === 'merge') {
    merge(e.data.gaussianList);
  }
};
