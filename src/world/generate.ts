import { vec2, vec3 } from "gl-matrix";
import { Vec2, Vec3 } from "../types";

export const randomPointInCircle = (center: vec2, radius: number): Vec2 => {
  const r = radius * Math.sqrt(Math.random());
  const theta = 2 * Math.PI * Math.random();
  return [
    center[0] + r * Math.cos(theta),
    center[1] + r * Math.sin(theta),
  ];
};

export const randomPointInSphere = (center: vec3, radius: number): Vec3 => {
  const r = radius * Math.pow(Math.random(), 1/3);
  const theta = 2 * Math.PI * Math.random();
  const phi = Math.acos(2 * Math.random() - 1);
  return [
    center[0] + r * Math.sin(phi) * Math.cos(theta),
    center[1] + r * Math.sin(phi) * Math.sin(theta),
    center[2] + r * Math.cos(phi),
  ];
};
