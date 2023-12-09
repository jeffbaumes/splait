import { vec3 } from "gl-matrix";
import { G, Material, State, Vec3 } from "./types";

export const MaxSimulationDistance = 25.;
export const MaxObjectSize = 1.;
export const CollideSize = 3.;

export const collide = (obj1arr: Float32Array, obj1ind: number, gaussians: Float32Array, limit: boolean): number => {
  let collisions = 0;
  const obj1pos = [obj1arr[obj1ind + G.PosX], obj1arr[obj1ind + G.PosY], obj1arr[obj1ind + G.PosZ]] as Vec3;
  const obj1dist = obj1arr[obj1ind + G.Distance];
  if (obj1dist > MaxSimulationDistance) {
    return 0;
  }
  const obj1mat = obj1arr[obj1ind + G.Material] as Material;
  if (obj1mat !== Material.Movable && obj1mat !== Material.Player) {
    return 0;
  }
  const obj1vel = [obj1arr[obj1ind + G.VelX], obj1arr[obj1ind + G.VelY], obj1arr[obj1ind + G.VelZ]] as Vec3;
  const obj1scale = [obj1arr[obj1ind + G.ScaleX], obj1arr[obj1ind + G.ScaleY], obj1arr[obj1ind + G.ScaleZ]] as Vec3;
  const obj1r = CollideSize*Math.max(obj1scale[0], Math.max(obj1scale[0], obj1scale[0]));
  const obj1state = obj1arr[obj1ind + G.State];
  if (obj1state == State.Inventory) {
    return 0;
  }
  const obj2pos = [0., 0., 0.] as Vec3;
  const obj2vel = [0., 0., 0.] as Vec3;
  const obj2scale = [0., 0., 0.] as Vec3;
  const vNorm = [0., 0., 0.] as Vec3;
  // const vNorm = [0., 0., 0.] as Vec3;
  const vRelVelocity = [0., 0., 0.] as Vec3;
  for (var obj2ind = 0; obj2ind < gaussians.length; obj2ind += G.Stride) {
    if (obj1arr === gaussians && obj1ind === obj2ind) {
      continue;
    }
    const obj2mat = gaussians[obj2ind + G.Material] as Material;
    if (obj2mat === Material.Permeable) {
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
    const obj2r = CollideSize*Math.max(obj2scale[0], Math.max(obj2scale[0], obj2scale[0]));
    const obj2state = gaussians[obj2ind + G.State];
    if (obj2state == State.Inventory) {
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
    // const delta = [
    //   obj1pos[0] - obj2pos[0],
    //   obj1pos[1] - obj2pos[1],
    //   obj1pos[2] - obj2pos[2],
    // ];
    // const dist = Math.sqrt(delta[0]*delta[0] + delta[1]*delta[1] + delta[2]*delta[2]);
    // if (dist === 0) {
    //   console.log({delta, dist, obj1: [...obj1pos], obj2: [...obj2pos], id1: obj1arr[obj1ind + G.ID], id2: gaussians[obj2ind + G.ID]});
    // }
    let dist = Math.sqrt((obj1pos[0] - obj2pos[0])**2 + (obj1pos[1] - obj2pos[1])**2 + (obj1pos[2] - obj2pos[2])**2);
    if (dist <= obj1r + obj2r) {
      collisions += 1;
      //get the vector of the angle the balls collided and normalize it
      // vNorm[0] = obj2pos[0] - obj1pos[0];
      // vNorm[1] = obj2pos[1] - obj1pos[1];
      // vNorm[2] = obj2pos[2] - obj1pos[2];
      // vec3.normalize(vNorm, vNorm);
      if (dist === 0) {
        dist = 1;
      }
      vNorm[0] = (obj2pos[0] - obj1pos[0]) / dist;
      vNorm[1] = (obj2pos[1] - obj1pos[1]) / dist;
      vNorm[2] = (obj2pos[2] - obj1pos[2]) / dist;
      // vec3.normalize(vNorm, vNorm);

      //get the relative velocity between the balls
      vRelVelocity[0] = obj1vel[0] - obj2vel[0];
      vRelVelocity[1] = obj1vel[1] - obj2vel[1];
      vRelVelocity[2] = obj1vel[2] - obj2vel[2];
      //calc speed after hit
      // const speed = vec3.dot(vRelVelocity, vNorm);
      const speed = vRelVelocity[0] * vNorm[0] + vRelVelocity[1] * vNorm[1] + vRelVelocity[2] * vNorm[2];
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
  return collisions;
};

export const findTarget = (options: {eye: vec3, look: vec3, gaussians: Float32Array}) => {
  const {eye, look, gaussians} = options;
  let targetDist = Infinity;
  let target = null;
  const v = [0., 0., 0.] as Vec3;
  for (var g = 0; g < gaussians.length; g += G.Stride) {
    if (gaussians[g + G.Distance] > MaxSimulationDistance) {
      return target;
    }
    if (gaussians[g + G.State] == State.Inventory) {
      continue;
    }
    const pos = [gaussians[g + G.PosX], gaussians[g + G.PosY], gaussians[g + G.PosZ]] as Vec3;
    const size = [gaussians[g + G.ScaleX], gaussians[g + G.ScaleY], gaussians[g + G.ScaleZ]] as Vec3;
    // dist(x = a + t*n, p) = norm(cross(p - a, n))/norm(n)
    // a = eye, n = look, p = pos, norm(look) = 1, so
    // t = dot(pos - eye, look)
    // dist = norm(cross(pos - eye, look))
    const t = vec3.dot(vec3.sub(v, pos, eye), look);
    if (t < 0) {
      continue;
    }
    // dist(x = a + t*n, p) = norm(cross(p - a, n))/norm(n)
    // a = eye, n = look, p = pos, norm(look) = 1
    // dist = norm(cross(pos - eye, look))
    const dist = vec3.len(vec3.cross(v, vec3.sub(v, pos, eye), look));
    const eyeDist = vec3.len(vec3.sub(v, pos, eye));
    if (dist < 2*Math.max(size[0], size[1], size[2]) && eyeDist < targetDist) {
      targetDist = eyeDist;
      target = g;
    }
  }
  return target;
}
