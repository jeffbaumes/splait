struct Gaussian {
  color: vec4f,
  centerAndDistance: vec4f,
  scaleAndState: vec4f,
  covA: vec3f,
  id: f32,
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
  inverse: mat4x4f,
  focal: vec2f,
  viewport: vec2f,
  build: f32,
  collect: f32,
  renderMode: f32,
  playMode: f32,
  skyGradient: array<vec4f, 2>,
  sun: vec3f,
  selectMode: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage> gaussians: array<Gaussian>;
@group(0) @binding(2) var<storage> selected: array<Gaussian>;

const Immovable = 0.;
const Movable = 1.;
const Permeable = 2.;
const Star = 3.;

const StateUsed = 0.;
const StateFree = 1.;

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
  var gaussian = gaussians[vertex.instance];
  // var gaussian = selected[vertex.instance];
  if (uniforms.selectMode == 1.) {
    gaussian = selected[vertex.instance];
  }

  // Don't draw objects that are free slots
  if (gaussian.scaleAndState.w == StateFree) {
    output.viewportPos = vec4(0.0, 0.0, 2.0, 1.0);
    return output;
  }

  output.viewportPos = viewportPosition(gaussian, vertex.pos);

  output.pos = vertex.pos;
  if (uniforms.selectMode == 1.) {
    output.color = vec4f(1.0, 1.0, 0.0, 0.25 * gaussian.color.a);
    return output;
  // } else if (abs(gaussian.centerAndDistance.w - MaxSimulationDistance) <= 1.0) {
  } else if (gaussian.centerAndDistance.w > MaxSimulationDistance) {
    var gray = vec3(0.299*gaussian.color.r + 0.587*gaussian.color.g + 0.114*gaussian.color.b);
    // var yellow = vec3(1.0, 1.0, 0.0);
    // output.color = vec4f(0.5*gaussian.color.rgb + 0.5*yellow, gaussian.color.a);
    output.color = vec4f(0.7*gaussian.color.rgb + 0.3*gray, gaussian.color.a);
  // } else if (uniforms.targetIndex >= 0. && length(gaussians[vertex.instance].centerAndDistance.xyz - gaussians[u32(uniforms.targetIndex)].centerAndDistance.xyz) <= uniforms.selectDistance) {
  //   output.color = vec4(1., 1., 1., 1.);
  } else {
    output.color = gaussian.color;
  }
  var fogColor = uniforms.skyGradient[1];
  if (gaussian.velocityAndMaterial.w == Star) {
    output.color.a = gaussian.color.a * (1. - fogColor.a);
  } else {
    // Fog
    var fog = 1. - exp(-gaussian.centerAndDistance.w / 10000.);
    output.color = vec4(output.color.rgb * (1. - fog) + fogColor.rgb * fog, gaussian.color.a);
    // Darkness
    output.color = vec4(output.color.rgb * max(fogColor.a, 0.1), gaussian.color.a);
    // output.color *= max(fogColor.a, 0.1);
  }
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  var a = -dot(input.pos, input.pos);

  var threshold = -4.0;

  if (uniforms.renderMode == RenderModeGaussian) {
    if (a < threshold) {
      discard;
    }
    var b = exp(a) * input.color.a;
    return vec4(b * input.color.rgb, b);
  }

  if (a < threshold) {
    discard;
  }
  return vec4(input.color.a * input.color.rgb, input.color.a);
}

struct SkyInput {
  @location(0) pos: vec2f,
};

struct SkyOutput {
  @builtin(position) pos: vec4f,
};


@vertex
fn skyVertex(vertex: SkyInput) -> SkyOutput  {
  var output: SkyOutput;
  var pos = uniforms.inverse * vec4(vertex.pos, 0., 1.);
  pos = pos / pos.w;
  var dir = normalize(pos.xyz - uniforms.eye);
  output.pos = vec4(vertex.pos, 0.5, 1.);
  return output;
}

@fragment
fn skyFragment(input: SkyOutput) -> @location(0) vec4f {
  var pos = vec4(2. * input.pos.x / uniforms.viewport.x - 1., 2. * (1. - input.pos.y / uniforms.viewport.y) - 1., 0.5, 1.);
  pos = uniforms.inverse * pos;
  pos = pos / pos.w;
  var dir = normalize(pos.xyz - uniforms.eye);
  var angle = acos(dot(dir, vec3(0., 1., 0.)));
  var sunAngle = acos(dot(dir, uniforms.sun));

  var pi = radians(180.0);
  var up0horizon1 = clamp(abs(angle)/(pi / 2.), 0., 1.);
  var color = mix(uniforms.skyGradient[0], uniforms.skyGradient[1], pow(up0horizon1, 4.));
  if (sunAngle < radians(1.)) {
    var sunLevel = 1. - sunAngle / radians(1.);
    var e = 3.;
    var t = sunLevel * 2.;
    var polyInOut = 0.;
    if (t <= 1.) {
      polyInOut = pow(t, e);
    } else {
      polyInOut = 2. - pow(2. - t, e) / 2.;
    }
    color = mix(color, vec4(1., 1., 1., 1.), polyInOut);
  }
  return vec4(color.rgb * color.a, color.a);
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
