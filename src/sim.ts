import { vec3 } from "gl-matrix";
import { G, Material, State, Vec3 } from "./types";

export const MaxSimulationDistance = 25.;
export const MaxObjectSize = 1.;

export const collide = (obj1arr: Float32Array, obj1ind: number, gaussians: Float32Array, limit: boolean) => {
  const obj1pos = [obj1arr[obj1ind + G.PosX], obj1arr[obj1ind + G.PosY], obj1arr[obj1ind + G.PosZ]] as Vec3;
  const obj1dist = obj1arr[obj1ind + G.Distance];
  if (obj1dist > MaxSimulationDistance) {
    return;
  }
  const obj1mat = obj1arr[obj1ind + G.Material] as Material;
  if (obj1mat !== Material.Movable && obj1mat !== Material.Player) {
    return;
  }
  const obj1vel = [obj1arr[obj1ind + G.VelX], obj1arr[obj1ind + G.VelY], obj1arr[obj1ind + G.VelZ]] as Vec3;
  const obj1scale = [obj1arr[obj1ind + G.ScaleX], obj1arr[obj1ind + G.ScaleY], obj1arr[obj1ind + G.ScaleZ]] as Vec3;
  const obj1r = 2.*Math.max(obj1scale[0], Math.max(obj1scale[0], obj1scale[0]));
  const obj1state = obj1arr[obj1ind + G.State];
  if (obj1state == State.Inventory) {
    return;
  }
  const obj2pos = [0., 0., 0.] as Vec3;
  const obj2vel = [0., 0., 0.] as Vec3;
  const obj2scale = [0., 0., 0.] as Vec3;
  const v = [0., 0., 0.] as Vec3;
  const vRelVelocity = [0., 0., 0.] as Vec3;
  for (var obj2ind = 0; obj2ind < gaussians.length; obj2ind += G.Stride) {
    if (obj1arr === gaussians && obj1ind === obj2ind) {
      continue;
    }
    var obj2dist = gaussians[obj2ind + G.Distance];
    if (limit && obj2dist > MaxSimulationDistance + 2.*MaxObjectSize) {
      continue;
    }
    // From https://stackoverflow.com/questions/73364881/finding-collision-between-two-balls
    obj2pos[0] = gaussians[obj2ind + G.PosX];
    obj2pos[1] = gaussians[obj2ind + G.PosY];
    obj2pos[2] = gaussians[obj2ind + G.PosZ];
    obj2vel[0] = gaussians[obj2ind + G.VelX];
    obj2vel[1] = gaussians[obj2ind + G.VelY];
    obj2vel[2] = gaussians[obj2ind + G.VelZ];
    obj2scale[0] = gaussians[obj2ind + G.ScaleX];
    obj2scale[1] = gaussians[obj2ind + G.ScaleY];
    obj2scale[2] = gaussians[obj2ind + G.ScaleZ];
    const obj2r = 2.*Math.max(obj2scale[0], Math.max(obj2scale[0], obj2scale[0]));
    const obj2state = gaussians[obj2ind + G.State];
    if (obj2state == State.Inventory) {
      continue;
    }
    const obj2mat = gaussians[obj2ind + G.Material] as Material;

    if (obj2mat === Material.Permeable) {
      continue;
    }
    let obj1mass = 0.01;
    let obj2mass = 0.01;
    if (obj2mat === Material.Immovable) {
      obj2mass = 1000000000.;
    }
    if (obj1mat === Material.Player) {
      obj1mass = 100.;
    }
    if (obj2mat === Material.Player) {
      obj2mass = 100.;
    }
    // So, Math.hypot (which vec3.dist uses) is slow. So we'll do it ourselves.
    const dist = Math.sqrt((obj1pos[0] - obj2pos[0])**2 + (obj1pos[1] - obj2pos[1])**2 + (obj1pos[2] - obj2pos[2])**2);
    if (dist <= obj1r + obj2r) {
      //get the vector of the angle the balls collided and normalize it
      v[0] = obj2pos[0] - obj1pos[0];
      v[1] = obj2pos[1] - obj1pos[1];
      v[2] = obj2pos[2] - obj1pos[2];
      const vNorm = vec3.normalize(v, v);
      //get the relative velocity between the balls
      vRelVelocity[0] = obj1vel[0] - obj2vel[0];
      vRelVelocity[1] = obj1vel[1] - obj2vel[1];
      vRelVelocity[2] = obj1vel[2] - obj2vel[2];
      //calc speed after hit
      const speed = vec3.dot(vRelVelocity, vNorm);
      if (speed < 0.) {
        continue;
      }
      const J = (2. * speed) / (obj1mass + obj2mass);
      obj1vel[0] = obj1vel[0] - J * obj2mass * vNorm[0];
      obj1vel[1] = obj1vel[1] - J * obj2mass * vNorm[1];
      obj1vel[2] = obj1vel[2] - J * obj2mass * vNorm[2];
      const dampen = obj1mat === Material.Player ? 0.5 : 0.75;
      obj1arr[obj1ind + G.VelX] = dampen * obj1vel[0];
      obj1arr[obj1ind + G.VelY] = dampen * obj1vel[1];
      obj1arr[obj1ind + G.VelZ] = dampen * obj1vel[2];
    }
  }
};
