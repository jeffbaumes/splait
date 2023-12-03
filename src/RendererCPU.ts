import { Recorder, RecorderStatus } from "canvas-record";
import { AVC } from "media-codecs";
import { mat4, vec3 } from 'gl-matrix';

import gaussianShaderCode from "./gaussiancpu.wgsl?raw";
import { G, Mat4, PlayMode, RenderMode } from "./types";
import { World } from "./World";

const GaussiansToGPUPerFrame = 50000;

const polyInOut = (t: number, e: number) => {
  t *= 2;
  let value = 0.;
  if (t <= 1.) {
    value = Math.pow(t, e);
  } else {
    value = 2. - Math.pow(2. - t, e);
  }
  return value / 2;
};

// Function that computes a gradient of sky colors from overhead to the horizon
const skyGradient = (hour: number) => {
  hour = hour % 24;
  const brightness = hour < 12 ? polyInOut(hour/12, 10) : polyInOut((24 - hour)/12, 10);
  // const brightness = -0.5*(Math.cos(hour / 24 * 2 * Math.PI)) + 0.5;
  return [5/255,86/255,152/255, brightness, 181/255,210/255,219/255, brightness];
};

const sun = (hour: number) => {
  return [Math.sin(hour / 24 * 2 * Math.PI), -Math.cos(hour / 24 * 2 * Math.PI), 0];
};

export class RendererCPU {
  context: GPUCanvasContext | null = null;
  device: GPUDevice | null = null;
  uniformBuffer: GPUBuffer | null = null;
  vertexBuffer: GPUBuffer | null = null;
  crosshairBuffer: GPUBuffer | null = null;
  skyBuffer: GPUBuffer | null = null;
  gaussianBuffer: GPUBuffer | null = null;
  gaussianPipeline: GPURenderPipeline | null = null;
  crosshairPipeline: GPURenderPipeline | null = null;
  skyPipeline: GPURenderPipeline | null = null;
  skyMeshSize = 1;
  gaussianBindGroup: GPUBindGroup | null = null;
  canvasRecorder: any;
  world: World;
  sortWorker: Worker;
  sorting = false;
  sortEye: vec3 = [0., 0., 0.];
  simWorker: Worker;
  simulating = false;
  simulationDeltaTime = 0;
  latestSimulateGaussianList: number[][] = [];
  merging = false;
  gaussiansToSend: Float32Array | null = null;
  gaussiansSent = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.world = new World();
    this.sortWorker = new Worker(new URL("./sortWorker.ts", import.meta.url), {
      type: 'module',
    });
    this.sortWorker.onmessage = (e) => {
      if (!this.device || !this.gaussianBuffer) {
        return;
      }
      if (e.data.type === 'sort') {
        this.sorting = false;
        this.merging = true;
        this.sortEye = e.data.eye; // We want to simulate with the same eye as we sorted with
        if (!this.simulating) {
          this.sortWorker.postMessage({
            type: "merge",
            gaussianList: this.latestSimulateGaussianList,
          });
        }
      } else if (e.data.type === 'merge') {
        // this.device.queue.writeBuffer(this.gaussianBuffer, 0, e.data.gaussians);
        this.gaussiansToSend = e.data.gaussians;
        this.gaussiansSent = 0;
        this.simWorker.postMessage({
          type: "merge",
          gaussianList: e.data.gaussianList,
          eye: this.sortEye,
        });
      }
    };

    this.simWorker = new Worker(new URL("./simWorker.ts", import.meta.url), {
      type: 'module',
    });
    this.simWorker.onmessage = (e) => {
      if (!this.device || !this.gaussianBuffer) {
        return;
      }
      if (e.data.type === 'simulate') {
        this.latestSimulateGaussianList = e.data.gaussianList;
        this.device.queue.writeBuffer(this.gaussianBuffer, 0, e.data.gaussians);
        if (this.merging) {
          this.sortWorker.postMessage({
            type: "merge",
            gaussianList: e.data.gaussianList,
          });
        }
        this.simulating = false;
      } else if (e.data.type === 'merge') {
        this.merging = false;
      }
    };
    this.setup();
  }

  async setup() {
    if (!navigator.gpu) {
      throw new Error("WebGPU not supported on this browser.");
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No appropriate GPUAdapter found.");
    }
    this.device = await adapter.requestDevice();
    this.context = this.canvas.getContext("webgpu");
    if (!this.context) {
      throw new Error("WebGPU not supported on this canvas.");
    }
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: canvasFormat,
    });

    this.canvasRecorder = new Recorder(this.context, {
      name: "canvas-record-example",
      target: "in-browser",
      duration: Infinity,
      encoderOptions: {
        codec: AVC.getCodec({ profile: "Main", level: "5.2" }),
      },
    });
    const recordButton = document.querySelector<HTMLButtonElement>("#record");
    if (!recordButton) {
      throw new Error("No record button found.");
    }
    recordButton.addEventListener("click", () => {
      if (this.canvasRecorder.status === RecorderStatus.Recording) {
        this.canvasRecorder.stop();
        recordButton.innerText = "Start recording";
      } else {
        this.canvasRecorder.start();
        recordButton.innerText = "Stop recording";
      }
    });

    const pixelSize = 1;
    const resizeCanvas = () => {
      const scale = window.devicePixelRatio;
      this.canvas.width = this.canvas.clientWidth * scale / pixelSize;
      this.canvas.height = this.canvas.clientHeight * scale / pixelSize;
    }
    addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const gaussianSize = 2;
    const vertices = new Float32Array([
      -gaussianSize, -gaussianSize,
      gaussianSize, -gaussianSize,
      gaussianSize,  gaussianSize,

      -gaussianSize, -gaussianSize,
      gaussianSize,  gaussianSize,
      -gaussianSize,  gaussianSize,
    ]);
    this.vertexBuffer = this.device.createBuffer({
      label: "Gaussian vertices",
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.vertexBuffer, 0, vertices);
    const vertexBufferLayout = {
      arrayStride: 8,
      attributes: [{
        format: "float32x2" as GPUVertexFormat,
        offset: 0,
        shaderLocation: 0, // Position, see vertex shader
      }],
    };

    const skyMesh: number[] = [];
    for (let x = 0; x < this.skyMeshSize; x += 1) {
      for (let y = 0; y < this.skyMeshSize; y += 1) {
        const x0 = 2 * x / this.skyMeshSize - 1;
        const y0 = 2 * y / this.skyMeshSize - 1;
        const x1 = 2 * (x + 1) / this.skyMeshSize - 1;
        const y1 = 2 * (y + 1) / this.skyMeshSize - 1;
        skyMesh.push(
          x0, y0,
          x1, y0,
          x1, y1,

          x0, y0,
          x1, y1,
          x0, y1,
        );
      }
    }

    const skyVertices = new Float32Array(skyMesh);
    this.skyBuffer = this.device.createBuffer({
      label: "Sky vertices",
      size: skyVertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.skyBuffer, 0, skyVertices);

    const crosshairSize = 0.05;
    const crosshairWidth = 0.001;
    const crosshairVertices = new Float32Array([
      -crosshairSize, -crosshairWidth,
      crosshairSize, -crosshairWidth,
      crosshairSize, crosshairWidth,

      -crosshairSize, -crosshairWidth,
      crosshairSize, crosshairWidth,
      -crosshairSize, crosshairWidth,

      -crosshairWidth, -crosshairSize,
      -crosshairWidth, crosshairSize,
      crosshairWidth, crosshairSize,

      -crosshairWidth, -crosshairSize,
      crosshairWidth, crosshairSize,
      crosshairWidth, -crosshairSize,
    ]);
    this.crosshairBuffer = this.device.createBuffer({
      label: "Crosshair vertices",
      size: crosshairVertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.crosshairBuffer, 0, crosshairVertices);

    this.world.generateWorldGaussians();
    this.sortWorker.postMessage({
      type: "gaussians",
      gaussianList: this.world.gaussianList,
    });

    const gaussians = new Float32Array(this.world.gaussianList.flat());
    this.gaussianBuffer = this.device.createBuffer({
      label: "Gaussian buffer",
      size: gaussians.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    this.device.queue.writeBuffer(this.gaussianBuffer, 0, gaussians);
    let uniformArray = new Float32Array([
      // force and deltaTime
      0, 0, 0, 0,
      // eye
      0, 0, 0, 0,
      // view matrix
      ...(mat4.lookAt(new Array(16) as Mat4, [0, 0, 0.5], [0, 0, 0], [0, 1, 0]) as number[]),
      // inverted view matrix
      ...(new Array(16)),
      // projection matrix
      ...(mat4.perspectiveZO(new Array(16) as Mat4, Math.PI / 2, 1, 0.1, 1000) as number[]),
      1, 1,
      this.canvas.width, this.canvas.height,
      0, 0,
      0, 0,
      0, 0, 0, 0, // sky color up
      0, 0, 0, 0, // sky color horizon
      0, 0, 0, 0, // sun
    ]);

    this.uniformBuffer = this.device.createBuffer({
      label: "Gaussian uniforms",
      size: uniformArray.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformArray);

    const gaussianShaderModule = this.device.createShaderModule({
      label: "Gaussian shader",
      code: gaussianShaderCode,
    });

    const gaussianBindGroupLayout = this.device.createBindGroupLayout({
      label: "Gaussian bind group layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: {},
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX,
          buffer: { type: "read-only-storage" as GPUBufferBindingType },
        },
      ],
    });
  this.gaussianBindGroup = this.device.createBindGroup({
      label: "Gaussian bind group",
      layout: gaussianBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.uniformBuffer },
        },
        {
          binding: 1,
          resource: { buffer: this.gaussianBuffer },
        },
      ],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      label: "Cell Pipeline Layout",
      bindGroupLayouts: [ gaussianBindGroupLayout ],
    });

    this.gaussianPipeline = this.device.createRenderPipeline({
      label: "Gaussian pipeline",
      layout: pipelineLayout,
      vertex: {
        module: gaussianShaderModule,
        entryPoint: "vertexMain",
        buffers: [vertexBufferLayout],
      },
      fragment: {
        module: gaussianShaderModule,
        entryPoint: "fragmentMain",
        targets: [{
          format: canvasFormat,
          blend: {
            color: {
              operation: "add" as GPUBlendOperation,
              srcFactor: "one-minus-dst-alpha" as GPUBlendFactor,
              dstFactor: "one" as GPUBlendFactor,
            },
            alpha: {
              operation: "add" as GPUBlendOperation,
              srcFactor: "one-minus-dst-alpha" as GPUBlendFactor,
              dstFactor: "one" as GPUBlendFactor,
            },
          },
        }],
      },
    });

    this.skyPipeline = this.device.createRenderPipeline({
      label: "Sky pipeline",
      layout: pipelineLayout,
      vertex: {
        module: gaussianShaderModule,
        entryPoint: "skyVertex",
        buffers: [vertexBufferLayout],
      },
      fragment: {
        module: gaussianShaderModule,
        entryPoint: "skyFragment",
        targets: [{
          format: canvasFormat,
          blend: {
            color: {
              operation: "add" as GPUBlendOperation,
              srcFactor: "one-minus-dst-alpha" as GPUBlendFactor,
              dstFactor: "one" as GPUBlendFactor,
            },
            alpha: {
              operation: "add" as GPUBlendOperation,
              srcFactor: "one-minus-dst-alpha" as GPUBlendFactor,
              dstFactor: "one" as GPUBlendFactor,
            },
          },
        }],
      },
    });

    this.crosshairPipeline = this.device.createRenderPipeline({
      label: "Crosshair pipeline",
      layout: pipelineLayout,
      vertex: {
        module: gaussianShaderModule,
        entryPoint: "crosshairVertex",
        buffers: [vertexBufferLayout],
      },
      fragment: {
        module: gaussianShaderModule,
        entryPoint: "crosshairFragment",
        targets: [{
          format: canvasFormat,
          blend: {
            color: {
              operation: "add" as GPUBlendOperation,
              srcFactor: "one-minus-dst" as GPUBlendFactor,
              dstFactor: "zero" as GPUBlendFactor,
            },
            alpha: {
              operation: "add" as GPUBlendOperation,
              srcFactor: "one-minus-dst" as GPUBlendFactor,
              dstFactor: "zero" as GPUBlendFactor,
            },
          },
        }],
      },
    });
  }

  async render(options: {
    look: vec3,
    up: vec3,
    eye: vec3,
    desiredVelocity: vec3,
    deltaTime: number,
    collect: boolean,
    build: boolean,
    renderMode: RenderMode,
    playMode: PlayMode,
    hour: number,
  }){
    const {look, up, eye, desiredVelocity, deltaTime, collect, build, renderMode, playMode, hour} = options;

    if (
      !this.context ||
      !this.device ||
      !this.gaussianPipeline ||
      !this.crosshairPipeline ||
      !this.skyPipeline ||
      !this.gaussianBindGroup ||
      !this.uniformBuffer ||
      !this.gaussianBuffer ||
      !this.vertexBuffer
    ) {
      return;
    }
    // Compute distance to camera
    // const eye: [number, number, number] = [20*Math.cos(frame / 1000), 25, 20*(Math.sin(frame / 1000))];
    // const fovy = Math.PI / 4 + Math.PI / 8 * Math.cos(frame / 150);
    const fovy = Math.PI / 2;
    const tanFovy = 1 / Math.tan(fovy / 2);
    const lookAt: [number, number, number] = [eye[0] + look[0], eye[1] + look[1], eye[2] + look[2]];
    const viewMatrix = mat4.lookAt(new Array(16) as Mat4, eye, lookAt, up) as Mat4;
    const projectionMatrix = mat4.perspectiveZO(new Array(16) as Mat4, fovy, this.canvas.width / this.canvas.height, 0.1, 1e8) as Mat4;
    const inverseMatrix = mat4.multiply(new Array(16) as Mat4, projectionMatrix, viewMatrix) as Mat4;
    mat4.invert(inverseMatrix, inverseMatrix);
    const uniformArray = new Float32Array([
      // Force on player for this frame and delta time
      ...desiredVelocity, deltaTime,
      // Eye position
      ...eye, 0,
      // View matrix
      ...viewMatrix,
      // Projection matrix
      ...projectionMatrix,
      // Inverse matrix
      ...inverseMatrix,
      // These should whatever is in the first two diagonals of the perspective matrix, times w and h respectively
      tanFovy * this.canvas.height / 2, tanFovy * this.canvas.height / 2,
      // Canvas size
      this.canvas.width, this.canvas.height,
      build ? 1 : 0,
      collect ? 1 : 0,
      renderMode,
      playMode,
      ...skyGradient(hour),
      ...sun(hour), 0,
    ]);

    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformArray);

    // If there are gaussians to send, send them
    if (this.gaussiansToSend && this.gaussiansSent < this.gaussiansToSend.length / G.Stride) {
      const offset = this.gaussiansSent * G.Stride;
      const size = Math.min(GaussiansToGPUPerFrame, this.gaussiansToSend.length / G.Stride - this.gaussiansSent) * G.Stride;
      this.device.queue.writeBuffer(this.gaussianBuffer, offset*4, this.gaussiansToSend, offset, size);
      this.gaussiansSent += GaussiansToGPUPerFrame;
    }

    if (!this.sorting && !this.merging) {
      this.sortWorker.postMessage({
        type: "sort",
        eye,
      });
      this.sorting = true;
    }
    this.simulationDeltaTime += deltaTime;
    if (!this.simulating && !this.merging) {
      this.simWorker.postMessage({
        type: "simulate",
        deltaTime: Math.min(this.simulationDeltaTime, 0.1),
        desiredVelocity,
        eye,
      });
      this.simulating = true;
      this.simulationDeltaTime = 0;
    }

    const encoder = this.device.createCommandEncoder();

    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: "clear" as GPULoadOp,
        storeOp: "store" as GPUStoreOp,
      }],
    });
    pass.setPipeline(this.gaussianPipeline);
    pass.setBindGroup(0, this.gaussianBindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(6, this.world.gaussianList.length);
    pass.end();

    const skyPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        loadOp: "load" as GPULoadOp,
        storeOp: "store" as GPUStoreOp,
      }],
    });
    skyPass.setPipeline(this.skyPipeline);
    skyPass.setBindGroup(0, this.gaussianBindGroup);
    skyPass.setVertexBuffer(0, this.skyBuffer);
    skyPass.draw(6*(this.skyMeshSize**2));
    skyPass.end();

    const crosshairPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        loadOp: "load" as GPULoadOp,
        storeOp: "store" as GPUStoreOp,
      }],
    });
    crosshairPass.setPipeline(this.crosshairPipeline);
    crosshairPass.setBindGroup(0, this.gaussianBindGroup);
    crosshairPass.setVertexBuffer(0, this.crosshairBuffer);
    crosshairPass.draw(12);
    crosshairPass.end();

    this.device.queue.submit([encoder.finish()]);

    if (this.canvasRecorder.status === RecorderStatus.Recording) {
      await this.canvasRecorder.step();
    }
  }
}
