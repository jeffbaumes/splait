import { vec3 } from "gl-matrix";
import { G, Material, State, Vec3 } from "./types";
import { MaxSimulationDistance, collide } from "./sim";

let gaussians = new Float32Array();
let eye: vec3 = [0., 0., 0.];

const collideAll = () => {
  for (let idx = 0; idx < gaussians.length; idx += G.Stride) {
    collide(gaussians, idx, gaussians, true);
  }
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

    if (material !== Material.Movable || state === State.Inventory) {
      continue;
    }

    // Enforce max velocity
    // if (length(gaussiansOut[id.x].velocityAndMaterial.xyz) > 25.0) {
    //   gaussiansOut[id.x].velocityAndMaterial = vec4(normalize(gaussiansOut[id.x].velocityAndMaterial.xyz) * 25.0, material);
    // }

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
    for (let i = 0; i < gaussians.length; i += G.Stride) {
      gaussians[i + G.Distance] = vec3.dist(eye, [gaussians[i + G.PosX], gaussians[i + G.PosY], gaussians[i + G.PosZ]]);
    }
    collideAll();
    simulate(e.data);
  }
};
