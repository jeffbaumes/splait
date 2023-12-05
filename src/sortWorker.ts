import { vec3 } from "gl-matrix";
import { G } from "./types";

let eye: vec3 = [0., 0., 0.];
let gaussians: Float32Array = new Float32Array();
let sortedGaussians: Float32Array = new Float32Array();

const MaxSimulationDistance = 25.;
const MaxObjectSize = 1.;

const merge = (updates: Float32Array) => {
  let maxDistanceIndex = 0;
  while (gaussians[maxDistanceIndex*G.Stride + G.Distance] < MaxSimulationDistance + 2.*MaxObjectSize) {
    maxDistanceIndex += 1;
  }

  const updateMap: {[id: number]: number} = {};
  for (let i = 0; i < updates.length; i += G.Stride) {
    updateMap[updates[i + G.ID]] = i;
  }

  for (let i = 0; i < gaussians.length; i += G.Stride) {
    const updateIndex = updateMap[gaussians[i + G.ID]];
    if (updateIndex !== undefined) {
      const distance = vec3.dist(eye, [gaussians[i + G.PosX], gaussians[i + G.PosY], gaussians[i + G.PosZ]]);
      gaussians[i + G.PosX] = updates[updateIndex + G.PosX];
      gaussians[i + G.PosY] = updates[updateIndex + G.PosY];
      gaussians[i + G.PosZ] = updates[updateIndex + G.PosZ];
      gaussians[i + G.VelX] = updates[updateIndex + G.VelX];
      gaussians[i + G.VelY] = updates[updateIndex + G.VelY];
      gaussians[i + G.VelZ] = updates[updateIndex + G.VelZ];
      gaussians[i + G.Distance] = distance;
    }
  }

  // postMessage({type: 'merge', gaussians}, {transfer: [gaussians.buffer]});
  postMessage({type: 'merge', gaussians, maxDistanceIndex});
};

const sort = () => {
  for (let i = 0; i < gaussians.length; i += G.Stride) {
    gaussians[i + G.Distance] = vec3.dist(eye, [gaussians[i + G.PosX], gaussians[i + G.PosY], gaussians[i + G.PosZ]]);
  }
  let indices = new Uint32Array(gaussians.length/G.Stride);
  for (let i = 0; i < indices.length; i += 1) {
    indices[i] = i*G.Stride;
  }
  indices.sort((a, b) => gaussians[a + G.Distance] - gaussians[b + G.Distance]);
  sortedGaussians = new Float32Array(gaussians.length);
  for (let i = 0; i < indices.length; i += 1) {
    const index = indices[i];
    const outIndex = i*G.Stride;
    for (let j = 0; j < G.Stride; j += 1) {
      sortedGaussians[outIndex + j] = gaussians[index + j];
    }
  }

  gaussians = sortedGaussians;
  postMessage({type: 'sort', eye});
};

onmessage = (e) => {
  if (e.data.type === 'gaussians') {
    gaussians = e.data.gaussians;
  } else if (e.data.type === 'sort') {
    eye = e.data.eye;
    sort();
  } else if (e.data.type === 'merge') {
    merge(e.data.gaussians);
  }
};
