
export type NArray<A extends T[], T, N extends number> = A["length"] extends N ? A : NArray<[T, ...A], T, N>;

export type Vec2 = NArray<[], number, 2>;
export type Vec3 = NArray<[], number, 3>;
export type Vec4 = NArray<[], number, 4>;
export type Mat3 = NArray<[], number, 9>;
export type Mat4 = NArray<[], number, 16>;

export enum RenderMode {
  Gaussian = 0,
  Flat = 1,
};

export enum PlayMode {
  Normal = 0,
  Fly = 1,
};

export enum Material {
  Immovable = 0,
  Movable = 1,
  Permeable = 2,
  Star = 3,
  Player = 4,
};

export enum State {
  Normal = 0.,
  Selected = 1.,
  Inventory = 2.,
};

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

export enum G {
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
  ID = 15,
  Covariance11 = 16,
  Covariance12 = 17,
  Covariance22 = 18,
  Padding3 = 19,
  VelX = 20,
  VelY = 21,
  VelZ = 22,
  Material = 23,
  Stride = 24,
};
