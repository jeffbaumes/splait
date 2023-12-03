import { vec3 } from "gl-matrix";
import { G, Material, State, Vec3 } from "./types";

export const MaxSimulationDistance = 25.;
export const MaxObjectSize = 1.;

export const collide = (obj1: number[], gaussianList: number[][]) => {
  var obj1pos = [obj1[G.PosX], obj1[G.PosY], obj1[G.PosZ]] as Vec3;
  var obj1dist = obj1[G.Distance];
  if (obj1dist > MaxSimulationDistance) {
    return;
  }
  var obj1mat = obj1[G.Material] as Material;
  if (obj1mat !== Material.Movable && obj1mat !== Material.Player) {
    return;
  }
  var obj1vel = [obj1[G.VelX], obj1[G.VelY], obj1[G.VelZ]] as Vec3;
  var obj1scale = [obj1[G.ScaleX], obj1[G.ScaleY], obj1[G.ScaleZ]] as Vec3;
  var obj1r = 2.*Math.max(obj1scale[0], Math.max(obj1scale[0], obj1scale[0]));
  var obj1state = obj1[G.State];
  if (obj1state == State.Inventory) {
    return;
  }
  for (var idy = 0; idy < gaussianList.length; idy += 1) {
    const obj2 = gaussianList[idy];
    if (obj1 === obj2) {
      continue;
    }
    var obj2dist = obj2[G.Distance];
    if (obj2dist > MaxSimulationDistance + 2.*MaxObjectSize) {
      continue;
    }
    // From https://stackoverflow.com/questions/73364881/finding-collision-between-two-balls
    var obj2pos = [obj2[G.PosX], obj2[G.PosY], obj2[G.PosZ]] as Vec3;
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
    if (obj1mat === Material.Player) {
      obj1mass = 100.;
    }
    if (obj2mat === Material.Player) {
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
      let dampen = obj1mat === Material.Player ? 0.5 : 0.75;
      obj1[G.VelX] = dampen * obj1vel[0];
      obj1[G.VelY] = dampen * obj1vel[1];
      obj1[G.VelZ] = dampen * obj1vel[2];
    }
  }
};
