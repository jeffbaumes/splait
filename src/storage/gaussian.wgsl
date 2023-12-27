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
@group(0) @binding(2) var<storage, read_write> gaussiansOut: array<Gaussian>;
@group(0) @binding(3) var<uniform> sortOffset: u32;

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

@compute
@workgroup_size(64)
fn distanceToEye(@builtin(global_invocation_id) id: vec3<u32>) {
  // First object is the player
  if (id.x == 0u) {
    return;
  }
  var eye = gaussiansOut[0].centerAndDistance.xyz;
  eye[1] += EyeHeight;
  var gaussian = gaussiansOut[id.x];
  var center = gaussian.centerAndDistance.xyz;
  gaussiansOut[id.x].centerAndDistance.w = length(center - eye);
  if (gaussiansOut[id.x].scaleAndState.w == StateSelected) {
    gaussiansOut[id.x].scaleAndState.w = StateNormal;
  }
}

@compute
@workgroup_size(64)
fn bubblesort(@builtin(global_invocation_id) id: vec3<u32>) {
  // Don't sort the first element, it's the player
  var index = 2u*id.x + sortOffset + 1u;
  if (index >= arrayLength(&gaussiansOut) - 1u) {
    return;
  }
  var temp = gaussiansOut[index];
  if (temp.centerAndDistance.w > gaussiansOut[index + 1u].centerAndDistance.w) {
    gaussiansOut[index] = gaussiansOut[index + 1u];
    gaussiansOut[index + 1u] = temp;
  }
}

@compute
@workgroup_size(64)
fn simulate(@builtin(global_invocation_id) id: vec3<u32>) {
  var deltaTime = uniforms.desiredVelocityAndDeltaTime.w;

  var gaussian = gaussiansOut[id.x];
  var material = gaussian.velocityAndMaterial.w;
  var center = gaussian.centerAndDistance.xyz;
  var distance = gaussian.centerAndDistance.w;
  var state = gaussian.scaleAndState.w;

  if (material != Movable || distance > MaxSimulationDistance || state == StateInventory) {
    return;
  }

  // Enforce max velocity
  // if (length(gaussiansOut[id.x].velocityAndMaterial.xyz) > 25.0) {
  //   gaussiansOut[id.x].velocityAndMaterial = vec4(normalize(gaussiansOut[id.x].velocityAndMaterial.xyz) * 25.0, material);
  // }

  // Update position
  gaussiansOut[id.x].centerAndDistance = vec4f(center + deltaTime*gaussian.velocityAndMaterial.xyz, distance);

  // Gravity
  if (id.x != 0u || uniforms.playMode != PlayModeFly) {
    gaussiansOut[id.x].velocityAndMaterial.y -= deltaTime * 25.0;
  }

  // Update player based on desired velocity
  if (id.x == 0u) {
    gaussiansOut[0].velocityAndMaterial.x = 0.8*uniforms.desiredVelocityAndDeltaTime.x + 0.2*gaussian.velocityAndMaterial.x;
    gaussiansOut[0].velocityAndMaterial.z = 0.8*uniforms.desiredVelocityAndDeltaTime.z + 0.2*gaussian.velocityAndMaterial.z;

    // Detect desire to jump or fly
    if (uniforms.playMode == PlayModeFly) {
      gaussiansOut[0].velocityAndMaterial.y = 0.8*uniforms.desiredVelocityAndDeltaTime.y + 0.2*gaussian.velocityAndMaterial.y;
    } else if (uniforms.desiredVelocityAndDeltaTime.y != 0.) {
      gaussiansOut[0].velocityAndMaterial.y = uniforms.desiredVelocityAndDeltaTime.y;
    }
  }
}

@compute
@workgroup_size(64)
fn collideAll(@builtin(global_invocation_id) id: vec3u) {
  var obj1mat = gaussiansOut[id.x].velocityAndMaterial.w;
  if (obj1mat != Movable) {
    return;
  }
  var obj1pos = gaussiansOut[id.x].centerAndDistance.xyz;
  var obj1dist = gaussiansOut[id.x].centerAndDistance.w;
  if (obj1dist > MaxSimulationDistance) {
    return;
  }
  var obj1vel = gaussiansOut[id.x].velocityAndMaterial.xyz;
  var obj1scale = gaussiansOut[id.x].scaleAndState.xyz;
  var obj1r = 2.*max(obj1scale.x, max(obj1scale.y, obj1scale.z));
  var obj1state = gaussiansOut[id.x].scaleAndState.w;
  if (obj1state == StateInventory) {
    return;
  }
  for (var idy = 0u; idy < arrayLength(&gaussiansOut); idy += 1u) {
    if (id.x == idy) {
      continue;
    }
    // From https://stackoverflow.com/questions/73364881/finding-collision-between-two-balls
    var obj2pos = gaussiansOut[idy].centerAndDistance.xyz;
    var obj2dist = gaussiansOut[idy].centerAndDistance.w;
    if (obj2dist > MaxSimulationDistance + 2.*MaxObjectSize) {
      continue;
    }
    var obj2vel = gaussiansOut[idy].velocityAndMaterial.xyz;
    var obj2scale = gaussiansOut[idy].scaleAndState.xyz;
    var obj2r = 2.*max(obj2scale.x, max(obj2scale.y, obj2scale.z));
    var obj2state = gaussiansOut[idy].scaleAndState.w;
    if (obj2state == StateInventory) {
      continue;
    }
    var obj2mat = gaussiansOut[idy].velocityAndMaterial.w;

    if (obj1mat == Permeable || obj2mat == Permeable) {
      continue;
    }
    if (obj1mat != Movable && obj2mat != Movable) {
      continue;
    }
    var obj1mass = 0.01;
    if (obj1mat == Immovable) {
      obj1mass = 1000000000.;
    }
    var obj2mass = 0.01;
    if (obj2mat == Immovable) {
      obj2mass = 1000000000.;
    }
    if (id.x == 0u) {
      obj1mass = 100.;
    }
    if (idy == 0u) {
      obj2mass = 100.;
    }
    let dist = length(obj2pos - obj1pos);
    if (dist <= obj1r + obj2r) {
      //get the vector of the angle the balls collided and normalize it
      let v = obj2pos - obj1pos;
      let vNorm = normalize(v);
      //get the relative velocity between the balls
      let vRelVelocity = obj1vel - obj2vel;
      //calc speed after hit
      let speed = dot(vRelVelocity, vNorm);
      if (speed < 0.) {
        continue;
      }
      let J = (2. * speed) / (obj1mass + obj2mass);
      obj1vel -= J * obj2mass * vNorm;
      obj2vel += J * obj1mass * vNorm;
      let dampen = 0.75;
      let playerDampen = 0.5;
      var dampen1 = dampen;
      var dampen2 = dampen;
      if (id.x == 0u) {
        dampen1 = playerDampen;
      }
      if (idy == 0u) {
        dampen2 = playerDampen;
      }
      gaussiansOut[id.x].velocityAndMaterial = vec4(dampen1 * obj1vel, obj1mat);
    }
  }
}

fn viewportPosition(gaussian: Gaussian, pos: vec2f) -> vec4f {
  var eye = gaussians[0].centerAndDistance.xyz;
  eye[1] += EyeHeight;
  var camspace = uniforms.view * vec4f(gaussian.centerAndDistance.xyz - eye, 1.0);
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

@compute
@workgroup_size(1)
fn findTarget() {
  for (var idy = 1u; idy < arrayLength(&gaussiansOut); idy += 1u) {
    var gaussian = gaussiansOut[idy];
    if (gaussian.centerAndDistance.w > MaxSimulationDistance) {
      return;
    }
    if (gaussian.scaleAndState.w == StateInventory) {
      continue;
    }
    var p1 = viewportPosition(gaussian, vec2f(-2.0, -2.0)).xy * uniforms.viewport;
    var p2 = viewportPosition(gaussian, vec2f(2.0, 2.0)).xy * uniforms.viewport;
    var p3 = viewportPosition(gaussian, vec2f(-2.0, 2.0)).xy * uniforms.viewport;
    var center = (p1 + p2)/2.;
    var r1 = length(p3 - p1)/2.;
    var r2 = length(p3 - p2)/2.;
    var r = min(r1, r2);
    if (length(center) < r/2.) {
      if (uniforms.collect != 0.) {
        gaussiansOut[idy].scaleAndState.w = StateInventory;
      } else if (uniforms.build != 0.) {
        for (var idi = 1u; idi < arrayLength(&gaussiansOut); idi += 1u) {
          if (gaussiansOut[idi].scaleAndState.w == StateInventory) {
            var eye = gaussiansOut[0].centerAndDistance.xyz + vec3f(0., EyeHeight, 0.);
            var towardEye = normalize(eye - gaussiansOut[idy].centerAndDistance.xyz);
            var r1 = max(gaussiansOut[idi].scaleAndState.x, max(gaussiansOut[idi].scaleAndState.y, gaussiansOut[idi].scaleAndState.z));
            var r2 = max(gaussiansOut[idy].scaleAndState.x, max(gaussiansOut[idy].scaleAndState.y, gaussiansOut[idy].scaleAndState.z));
            gaussiansOut[idi].centerAndDistance = vec4f(gaussiansOut[idy].centerAndDistance.xyz + (r1 + r2)*towardEye, 0.0);
            gaussiansOut[idi].velocityAndMaterial = vec4f(0., 0., 0., gaussiansOut[idi].velocityAndMaterial.w);
            gaussiansOut[idi].scaleAndState.w = StateNormal;
            break;
          }
        }
        gaussiansOut[idy].scaleAndState.w = StateNormal;
      } else {
        gaussiansOut[idy].scaleAndState.w = StateSelected;
      }
      return;
    }
  }
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

  if (a < -0.5) {
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
