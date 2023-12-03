import { vec3 } from "gl-matrix";
import { G, Material, PlayMode, State, Vec3 } from "./types";
import { MaxSimulationDistance, collide } from "./sim";

let gaussianList: number[][] = [];
let eye: vec3 = [0., 0., 0.];

const collideAll = () => {
  for (let idx = 0; idx < gaussianList.length; idx += 1) {
    collide(gaussianList[idx], gaussianList);
  }
}

const simulate = ({desiredVelocity, playMode, deltaTime}: {desiredVelocity: Vec3, playMode: PlayMode, deltaTime: number}) => {
  let idx = 0;
  for (; idx < gaussianList.length; idx += 1) {
    const gaussian = gaussianList[idx];
    const material = gaussian[G.Material] as Material;
    const center = [gaussian[G.PosX], gaussian[G.PosY], gaussian[G.PosZ]] as Vec3;
    const distance = gaussian[G.Distance];
    const state = gaussian[G.State];

    if (distance > MaxSimulationDistance) {
      // break;
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
    gaussian[G.PosX] = center[0] + deltaTime*gaussian[G.VelX];
    gaussian[G.PosY] = center[1] + deltaTime*gaussian[G.VelY];
    gaussian[G.PosZ] = center[2] + deltaTime*gaussian[G.VelZ];

    // Gravity
    if (idx !== 0 || playMode !== PlayMode.Fly) {
      gaussian[G.VelY] -= deltaTime * 25.0;
    }

    // Update player based on desired velocity
    if (idx === 0) {
      gaussian[G.VelX] = 0.8*desiredVelocity[0] + 0.2*gaussian[G.VelX];
      gaussian[G.VelZ] = 0.8*desiredVelocity[2] + 0.2*gaussian[G.VelZ];

      // Detect desire to jump or fly
      if (playMode == PlayMode.Fly) {
        gaussian[G.VelY] = 0.8*desiredVelocity[1] + 0.2*gaussian[G.VelY];
      } else if (desiredVelocity[1] !== 0.) {
        gaussian[G.VelY] = desiredVelocity[1];
      }
    }
  }
  const gaussians = new Float32Array(gaussianList.flat());
  postMessage({type: 'simulate', gaussians, gaussianList});
}

onmessage = (e) => {
  if (e.data.type === 'merge') {
    const previousMap: {[id: number]: number[]} = {};
    gaussianList.forEach((g: number[]) => {
      previousMap[g[G.ID]] = g;
    });
    for (let i = 0; i < e.data.gaussianList.length; i += 1) {
      const prev = previousMap[e.data.gaussianList[i][G.ID]];
      if (prev) {
        // // Make sure to get new distance from sorting
        // prev[G.Distance] = e.data.gaussianList[i][G.Distance];
        e.data.gaussianList[i] = prev;
      }
    }
    gaussianList = e.data.gaussianList;
    eye = e.data.eye;
    postMessage({type: 'merge'});
  } else if (e.data.type === 'simulate') {
    gaussianList.forEach((d) => {
      d[G.Distance] = vec3.dist(eye, [d[G.PosX], d[G.PosY], d[G.PosZ]]);
    });
    collideAll();
    simulate(e.data);
  }
};
