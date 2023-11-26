import { vec3 } from "gl-matrix";
import { Material, PlayMode, Vec3 } from "./types";

let gaussianList: number[][] = [];

// // Color rgba
// ...(color as number[]),
// // Position xyz and distance to camera
// ...(position as number[]), 0,
// // Size xyz and padding
// ...(scale as number[]), 0,
// // Covariance matrix
// // 0  1  2  padding
// //    3  4
// //       5
// ...covA, 0,
// ...covB, 0,
// // Velocity and material
// 0, 0, 0, material,

enum G {
  ColorR = 0,
  ColorG = 1,
  ColorB = 2,
  ColorA = 3,
  PosX = 4,
  PosY = 5,
  PosZ = 6,
  Distance = 7,
  ScaleX = 8,
  ScaleY = 9,
  ScaleZ = 10,
  State = 11,
  Covariance00 = 12,
  Covariance01 = 13,
  Covariance02 = 14,
  Padding2 = 15,
  Covariance11 = 16,
  Covariance12 = 17,
  Covariance22 = 18,
  Padding3 = 19,
  VelX = 20,
  VelY = 21,
  VelZ = 22,
  Material = 23,
};

enum State {
  Normal = 0.,
  Selected = 1.,
  Inventory = 2.,
};

const MaxSimulationDistance = 25.;
const MaxObjectSize = 1.;

onmessage = (e) => {
  if (e.data.type === 'gaussians') {
    gaussianList = e.data.gaussianList;
  } else if (e.data.type === 'sort') {
    gaussianList.forEach((d) => {
      d[G.Distance] = vec3.dist(e.data.eye, [d[G.PosX], d[G.PosY], d[G.PosZ]]);
    });
    gaussianList.sort((a, b) => a[G.Distance] - b[G.Distance]);
    const gaussians = new Float32Array(gaussianList.flat());
    postMessage({type: 'sort', gaussians});
  } else if (e.data.type === 'simulate') {
    // console.time('simulate');
    // Collision detection
    // console.time('collision');
    for (let idx = 0; idx < gaussianList.length; idx += 1) {
      const obj1 = gaussianList[idx];
      var obj1pos = [obj1[G.PosX], obj1[G.PosY], obj1[G.PosZ]] as Vec3;
      var obj1dist = obj1[G.Distance];
      if (obj1dist > MaxSimulationDistance) {
        break;
      }
      var obj1mat = obj1[G.Material] as Material;
      if (obj1mat !== Material.Movable) {
        continue;
      }
      var obj1vel = [obj1[G.VelX], obj1[G.VelY], obj1[G.VelZ]] as Vec3;
      var obj1scale = [obj1[G.ScaleX], obj1[G.ScaleY], obj1[G.ScaleZ]] as Vec3;
      var obj1r = 2.*Math.max(obj1scale[0], Math.max(obj1scale[0], obj1scale[0]));
      var obj1state = obj1[G.State];
      if (obj1state == State.Inventory) {
        continue;
      }
      for (var idy = 0; idy < gaussianList.length; idy += 1) {
        if (idx == idy) {
          continue;
        }
        const obj2 = gaussianList[idy];
        // From https://stackoverflow.com/questions/73364881/finding-collision-between-two-balls
        var obj2pos = [obj2[G.PosX], obj2[G.PosY], obj2[G.PosZ]] as Vec3;
        var obj2dist = obj2[G.Distance];
        if (obj2dist > MaxSimulationDistance + 2.*MaxObjectSize) {
          break;
        }
        var obj2vel = [obj2[G.VelX], obj2[G.VelY], obj2[G.VelZ]] as Vec3;
        var obj2scale = [obj2[G.ScaleX], obj2[G.ScaleY], obj2[G.ScaleZ]] as Vec3;
        var obj2r = 2.*Math.max(obj2scale[0], Math.max(obj2scale[0], obj2scale[0]));
        var obj2state = obj2[G.State];
        if (obj2state == State.Inventory) {
          continue;
        }
        var obj2mat = obj2[G.Material] as Material;

        if (obj2mat === Material.Permeable) {
          continue;
        }
        var obj1mass = 0.01;
        var obj2mass = 0.01;
        if (obj2mat === Material.Immovable) {
          obj2mass = 1000000000.;
        }
        if (idx == 0) {
          obj1mass = 100.;
        }
        if (idy == 0) {
          obj2mass = 100.;
        }
        let dist = vec3.length([
          obj2pos[0] - obj1pos[0],
          obj2pos[1] - obj1pos[1],
          obj2pos[2] - obj1pos[2],
        ]);
        if (dist <= obj1r + obj2r) {
          //get the vector of the angle the balls collided and normalize it
          let v = [
            obj2pos[0] - obj1pos[0],
            obj2pos[1] - obj1pos[1],
            obj2pos[2] - obj1pos[2],
          ] as Vec3;
          let vNorm = vec3.normalize(v, v);
          //get the relative velocity between the balls
          let vRelVelocity = [
            obj1vel[0] - obj2vel[0],
            obj1vel[1] - obj2vel[1],
            obj1vel[2] - obj2vel[2],
          ] as Vec3;
          //calc speed after hit
          let speed = vec3.dot(vRelVelocity, vNorm);
          if (speed < 0.) {
            continue;
          }
          let J = (2. * speed) / (obj1mass + obj2mass);
          obj1vel = [
            obj1vel[0] - J * obj2mass * vNorm[0],
            obj1vel[1] - J * obj2mass * vNorm[1],
            obj1vel[2] - J * obj2mass * vNorm[2],
          ] as Vec3;
          obj2vel = [
            obj2vel[0] + J * obj1mass * vNorm[0],
            obj2vel[1] + J * obj1mass * vNorm[1],
            obj2vel[2] + J * obj1mass * vNorm[2],
          ] as Vec3;
          let dampen = 0.75;
          let playerDampen = 0.5;
          if (idx === 0) {
            dampen = playerDampen;
          }
          obj1[G.VelX] = dampen * obj1vel[0];
          obj1[G.VelY] = dampen * obj1vel[1];
          obj1[G.VelZ] = dampen * obj1vel[2];
        }
      }
    }
    // console.timeEnd('collision');
    // Gravity and update position
    // console.time('gravity');
    let idx = 0;
    for (; idx < gaussianList.length; idx += 1) {
      var deltaTime = e.data.deltaTime;

      var gaussian = gaussianList[idx];
      var material = gaussian[G.Material] as Material;
      var center = [gaussian[G.PosX], gaussian[G.PosY], gaussian[G.PosZ]] as Vec3;
      var distance = gaussian[G.Distance];
      var state = gaussian[G.State];

      if (distance > MaxSimulationDistance) {
        break;
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
      if (idx !== 0 || e.data.playMode !== PlayMode.Fly) {
        gaussian[G.VelY] -= deltaTime * 25.0;
      }

      // Update player based on desired velocity
      if (idx === 0) {
        gaussian[G.VelX] = 0.8*e.data.desiredVelocity[0] + 0.2*gaussian[G.VelX];
        gaussian[G.VelZ] = 0.8*e.data.desiredVelocity[2] + 0.2*gaussian[G.VelZ];

        // Detect desire to jump or fly
        if (e.data.playMode == PlayMode.Fly) {
          gaussian[G.VelY] = 0.8*e.data.desiredVelocity[1] + 0.2*gaussian[G.VelY];
        } else if (e.data.desiredVelocity[1] !== 0.) {
          gaussian[G.VelY] = e.data.desiredVelocity[1];
        }
      }
    }
    // console.timeEnd('gravity');
    const gaussians = new Float32Array(gaussianList.slice(0, idx).flat());
    postMessage({type: 'simulate', gaussians});
    // console.timeEnd('simulate');
  }
};
