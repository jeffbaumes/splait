import { vec3 } from "gl-matrix";
import { G, Material, State, Vec3 } from "./types";
import { MaxSimulationDistance, collide, flattenArrays } from "./sim";

let gaussians = new Float32Array();
let eye: vec3 = [0., 0., 0.];

const collideAll = (playerGaussian: Float32Array) => {
  let collisions = 0;
  collisions += collide(gaussians, 0, gaussians.length, gaussians, true);
  collisions += collide(gaussians, 0, gaussians.length, playerGaussian, false);
  return collisions;
};

const simulate = ({deltaTime}: {deltaTime: number}) => {
  for (let idx = 0; idx < gaussians.length; idx += G.Stride) {
    const material = gaussians[idx + G.Material] as Material;
    const center = [gaussians[idx + G.PosX], gaussians[idx + G.PosY], gaussians[idx + G.PosZ]] as Vec3;
    const distance = gaussians[idx + G.Distance];
    const state = gaussians[idx + G.State];

    if (distance > MaxSimulationDistance) {
      continue;
    }

    if (material !== Material.Movable || state === State.Free) {
      continue;
    }

    // Enforce max velocity
    const speed = vec3.length([
      gaussians[idx + G.VelX],
      gaussians[idx + G.VelY],
      gaussians[idx + G.VelZ],
    ]);
    if (speed > 25.0) {
      gaussians[idx + G.VelX] *= 25.0 / speed;
      gaussians[idx + G.VelY] *= 25.0 / speed;
      gaussians[idx + G.VelZ] *= 25.0 / speed;
    }

    // Update position
    gaussians[idx + G.PosX] = center[0] + deltaTime*gaussians[idx + G.VelX];
    gaussians[idx + G.PosY] = center[1] + deltaTime*gaussians[idx + G.VelY];
    gaussians[idx + G.PosZ] = center[2] + deltaTime*gaussians[idx + G.VelZ];

    // Gravity
    gaussians[idx + G.VelY] -= deltaTime * 25.0;
  }
  postMessage({type: 'simulate', gaussians});
}

onmessage = (e) => {
  if (e.data.type === 'merge') {
    const previousMap: {[id: number]: number} = {};
    for (let i = 0; i < gaussians.length; i += G.Stride) {
      previousMap[gaussians[i + G.ID]] = i;
    }
    for (let i = 0; i < e.data.gaussians.length; i += G.Stride) {
      const prev = previousMap[e.data.gaussians[i + G.ID]];
      if (prev !== undefined) {
        for (let j = 0; j < G.Stride; j += 1) {
          e.data.gaussians[i + j] = gaussians[prev + j];
        }
      }
    }
    gaussians = e.data.gaussians;
    eye = e.data.eye;
    postMessage({type: 'merge'});
  } else if (e.data.type === 'simulate') {
    // console.time('simulate');
    // console.log(gaussians.length / G.Stride);
    const edits = flattenArrays(e.data.edits);
    const editsIdMap: {[id: number]: number} = {};
    for (let i = 0; i < edits.length; i += G.Stride) {
      editsIdMap[edits[i + G.ID]] = i;
    }
    for (let i = 0; i < gaussians.length; i += G.Stride) {
      gaussians[i + G.Distance] = vec3.dist(eye, [gaussians[i + G.PosX], gaussians[i + G.PosY], gaussians[i + G.PosZ]]);
      const editIndex = editsIdMap[gaussians[i + G.ID]];
      if (editIndex !== undefined) {
        for (let j = 0; j < G.Stride; j += 1) {
          gaussians[i + j] = edits[editIndex + j];
        }
      }
    }
    collideAll(e.data.playerGaussian);
    simulate(e.data);
    // console.timeEnd('simulate');
  }
};
