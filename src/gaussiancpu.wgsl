struct Gaussian {
  color: vec4f,
  centerAndDistance: vec4f,
  scaleAndState: vec4f,
  covA: vec3f,
  covB: vec3f,
  velocityAndMaterial: vec4f,
};

struct VertexInput {
  @location(0) pos: vec2f,
  @builtin(instance_index) instance: u32,
};

struct VertexOutput {
  @builtin(position) viewportPos: vec4f,
  @location(0) pos: vec2f,
  @location(1) color: vec4f,
};

struct Uniforms {
  desiredVelocityAndDeltaTime: vec4f,
  eye: vec3f,
  view: mat4x4f,
  projection: mat4x4f,
  focal: vec2f,
  viewport: vec2f,
  build: f32,
  collect: f32,
  renderMode: f32,
  playMode: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage> gaussians: array<Gaussian>;

const Immovable = 0.;
const Movable = 1.;
const Permeable = 2.;

const StateNormal = 0.;
const StateSelected = 1.;
const StateInventory = 2.;

const RenderModeGaussian = 0.;
const RenderModeFlat = 1.;

const PlayModeNormal = 0.;
const PlayModeFly = 1.;

const MaxSimulationDistance = 25.;
const MaxObjectSize = 1.;
const EyeHeight = 2.;

fn transpose(m: mat3x3f) -> mat3x3f {
  return mat3x3f(
    m[0][0], m[1][0], m[2][0],
    m[0][1], m[1][1], m[2][1],
    m[0][2], m[1][2], m[2][2],
  );
}

fn viewportPosition(gaussian: Gaussian, pos: vec2f) -> vec4f {
  var camspace = uniforms.view * vec4f(gaussian.centerAndDistance.xyz, 1.0);
  var pos2d = uniforms.projection * camspace;
  var bounds = 1.2 * pos2d.w;
  if (pos2d.z < -pos2d.w || pos2d.x < -bounds || pos2d.x > bounds
		 || pos2d.y < -bounds || pos2d.y > bounds) {
    return vec4(0.0, 0.0, 2.0, 1.0);
  }
  var vrk = mat3x3f(
      gaussian.covA.x, gaussian.covA.y, gaussian.covA.z,
      gaussian.covA.y, gaussian.covB.x, gaussian.covB.y,
      gaussian.covA.z, gaussian.covB.y, gaussian.covB.z
  );
  var j = mat3x3f(
      uniforms.focal.x / camspace.z, 0., -(uniforms.focal.x * camspace.x) / (camspace.z * camspace.z),
      0., uniforms.focal.y / camspace.z, -(uniforms.focal.y * camspace.y) / (camspace.z * camspace.z),
      0., 0., 0.
  );
  var w = transpose(mat3x3(uniforms.view[0].xyz, uniforms.view[1].xyz, uniforms.view[2].xyz));
  var t = w * j;
  var cov = transpose(t) * vrk * t;
  var viewportCenter = vec2f(pos2d.xy) / pos2d.w;
  var diagonal1 = cov[0][0] + 0.3;
  var offDiagonal = cov[0][1];
  var diagonal2 = cov[1][1] + 0.3;
	var mid = 0.5 * (diagonal1 + diagonal2);
	var radius = length(vec2f((diagonal1 - diagonal2) / 2.0, offDiagonal));
	var lambda1 = mid + radius;
	var lambda2 = max(mid - radius, 0.1);
	var diagonalVector = normalize(vec2(offDiagonal, lambda1 - diagonal1));
	var v1 = min(sqrt(2.0 * lambda1), 1024.0) * diagonalVector;
	var v2 = min(sqrt(2.0 * lambda2), 1024.0) * vec2(diagonalVector.y, -diagonalVector.x);
  return vec4(
    viewportCenter
      + pos.x * v1 / uniforms.viewport * 2.0
      + pos.y * v2 / uniforms.viewport * 2.0, 0.5, 1.0,
  );
}

@vertex
fn vertexMain(vertex: VertexInput) -> VertexOutput  {
  var output: VertexOutput;

  // Don't draw player
  if (vertex.instance == 0u) {
    output.viewportPos = vec4(0.0, 0.0, 2.0, 1.0);
    return output;
  }

  var gaussian = gaussians[vertex.instance];

  // Don't draw objects that are in the inventory
  if (gaussian.scaleAndState.w == StateInventory) {
    output.viewportPos = vec4(0.0, 0.0, 2.0, 1.0);
    return output;
  }

  output.viewportPos = viewportPosition(gaussian, vertex.pos);

  output.pos = vertex.pos;
  if (gaussian.scaleAndState.w == StateSelected) {
    output.color = vec4f(1.0, 1.0, 0.0, gaussian.color.a);
  } else if (gaussian.centerAndDistance.w >= MaxSimulationDistance) {
    var gray = vec3(0.299*gaussian.color.r + 0.587*gaussian.color.g + 0.114*gaussian.color.b);
    output.color = vec4f(0.7*gaussian.color.rgb + 0.0*gray, gaussian.color.a);
    // output.color = vec4f(0.0*gaussian.color.rgb + 1.0*gray, gaussian.color.a);
  } else {
    output.color = gaussian.color;
  }
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  var a = -dot(input.pos, input.pos);

  if (uniforms.renderMode == RenderModeGaussian) {
    if (a < -4.0) {
      discard;
    }
    var b = exp(a) * input.color.a;
    return vec4(b * input.color.rgb, b);
  }

  if (a < -1.0) {
    discard;
  }
  return vec4(input.color);
}

struct CrosshairInput {
  @location(0) pos: vec2f,
};

struct CrosshairOutput {
  @builtin(position) pos: vec4f,
};

@vertex
fn crosshairVertex(vertex: CrosshairInput) -> CrosshairOutput  {
  var output: CrosshairOutput;
  output.pos = vec4f(vertex.pos.x*uniforms.viewport.y/uniforms.viewport.x, vertex.pos.y, 0.5, 1.);
  return output;
}

@fragment
fn crosshairFragment(input: CrosshairOutput) -> @location(0) vec4f {
  return vec4(1., 1., 1., 1.);
}
