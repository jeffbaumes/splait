import { vec3 } from "gl-matrix";
import { G, State } from "./types";
import { flattenArrays } from "./sim";

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

  // We need to update gaussians and sortedGaussians, since sortedGaussians will be transferred to the main thread
  let maxUsedIndex = -1;
  for (let i = 0; i < gaussians.length; i += G.Stride) {
    const updateIndex = updateMap[gaussians[i + G.ID]];
    if (updateIndex !== undefined) {
      const distance = vec3.dist(eye, [gaussians[i + G.PosX], gaussians[i + G.PosY], gaussians[i + G.PosZ]]);
      for (let j = 0; j < G.Stride; j += 1) {
        gaussians[i + j] = updates[updateIndex + j];
        sortedGaussians[i + j] = updates[updateIndex + j];
      }
      gaussians[i + G.Distance] = distance;
      sortedGaussians[i + G.Distance] = distance;
    }
    if (gaussians[i + G.State] === State.Used && i > maxUsedIndex * G.Stride) {
      maxUsedIndex = i / G.Stride;
    }
  }

  postMessage({
    type: 'merge',
    gaussians: sortedGaussians,
    maxDistanceIndex,
    freeIndex: maxUsedIndex + 1,
  }, {
    transfer: [sortedGaussians.buffer],
  });
};

const sort = () => {
  for (let i = 0; i < gaussians.length; i += G.Stride) {
    if (gaussians[i + G.State] === State.Used) {
      gaussians[i + G.Distance] = vec3.dist(eye, [gaussians[i + G.PosX], gaussians[i + G.PosY], gaussians[i + G.PosZ]]);
    } else {
      gaussians[i + G.Distance] = 1e99;
    }
  }

  const maxIndex = Math.pow(2, 32);
  const quantizeScale = 1e5;
  let indices = new Float64Array(gaussians.length/G.Stride);
  for (let i = 0; i < indices.length; i += 1) {
    indices[i] = Math.floor(Math.min(Math.log(gaussians[i*G.Stride + G.Distance]), 100)*quantizeScale) * maxIndex + i;
  }
  indices.sort();
  // Need to recreate sortedGaussians since it was transferred to the main thread in merge()
  sortedGaussians = new Float32Array(gaussians.length);
  for (let i = 0; i < indices.length; i += 1) {
    let index = (indices[i] % maxIndex)*G.Stride;
    const endIndex = index + G.Stride;
    let outIndex = i*G.Stride;
    for (; index < endIndex; index += 1, outIndex += 1) {
      sortedGaussians[outIndex] = gaussians[index];
    }
  }

  // We want two copies so we can transfer one to the main thread
  gaussians = sortedGaussians.slice();
  postMessage({type: 'sort', eye});
};

onmessage = (e) => {
  if (e.data.type === 'gaussians') {
    gaussians = e.data.gaussians;
  } else if (e.data.type === 'sort') {
    eye = e.data.eye;
    sort();
  } else if (e.data.type === 'merge') {
    merge(flattenArrays([...e.data.edits, e.data.gaussians]));
  }
};
