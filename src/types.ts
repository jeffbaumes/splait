
export type NArray<A extends T[], T, N extends number> = A["length"] extends N ? A : NArray<[T, ...A], T, N>;

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

