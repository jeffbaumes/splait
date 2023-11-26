import { vec3 } from "gl-matrix";

import { Renderer } from "./Renderer";
import { RendererCPU } from "./RendererCPU";
import { PlayMode, RenderMode, Vec3 } from "./types";

const vecToString = (x: number[] | Float32Array | null, digits: number = 0) => {
  if (!x) {
    return 'null';
  }
  return [...x].map(d => d.toLocaleString(undefined, {minimumFractionDigits: digits, maximumFractionDigits: digits})).join(', ');
};

const getURLParameter = (name: string) => {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

export class Game {
  keys = {
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false,
    Space: false,
    ShiftLeft: false,
  };
  playerHeight = 1.75;
  playerEyeHeight = 1.6;
  playerCorner = 0.1;
  nudgeDistance = 0.01;
  playerWidth = 0.5;
  playerSpeed = 15.0;
  playerDampen = 0.5;
  playerVelocity = vec3.fromValues(0, 0, 0);
  wantsToJump = false;
  wantsToCollect = false;
  wantsToBuild = false;
  fallSpeed = 20.0;
  turnSpeed = 0.002;
  azimuth = 0;
  elevation = 0;
  playerAcceleration = 30.0;
  forwardVelocity = 0.0;
  rightVelocity = 0.0;
  upVelocity = 0.0;
  jumpVelocity = 25.0;
  gravity = -25.0;
  onGround = false;
  playMode = PlayMode.Fly;
  renderMode = RenderMode.Gaussian;
  movement = vec3.fromValues(0, 0, 0);
  forward = vec3.fromValues(0, 0, -1);
  right = vec3.fromValues(1, 0, 0);
  eye = vec3.fromValues(0, 5, 20);
  look = vec3.fromValues(0, 0, -1);
  up = vec3.fromValues(0, 1, 0);
  pixelSize = 1;
  frame = '...............................................';
  renderer: Renderer | RendererCPU;

  constructor(private canvas: HTMLCanvasElement) {
    if (!this.canvas) {
      throw 'Could not find canvas!';
    }
    const sim = getURLParameter('sim');
    this.renderer = sim === 'gpu' ? new Renderer(this.canvas) : new RendererCPU(this.canvas);
    this.focus();

    const debugDiv = document.querySelector<HTMLDivElement>("#debug");
    const eyeDiv = document.querySelector<HTMLDivElement>('#eye');
    const velocityDiv = document.querySelector<HTMLDivElement>('#velocity');
    const lookDiv = document.querySelector<HTMLDivElement>('#look');
    const frameDiv = document.querySelector<HTMLDivElement>('#frame');
    if (!eyeDiv || !velocityDiv || !lookDiv || !frameDiv) {
      throw 'Could not find divs!';
    }

    const resizeCanvas = () => {
      const scale = window.devicePixelRatio;
      this.canvas.width = this.canvas.clientWidth * scale / this.pixelSize;
      this.canvas.height = this.canvas.clientHeight * scale / this.pixelSize;
    }
    addEventListener('resize', resizeCanvas);
    resizeCanvas();

    document.addEventListener('mousemove', e => {
      if (!this.canvas.requestPointerLock || document.pointerLockElement === this.canvas) {
        this.elevation -= e.movementY * this.turnSpeed;
        this.elevation = Math.min(
          Math.PI / 2 - 0.01,
          Math.max(-Math.PI / 2 + 0.01, this.elevation),
        );
        this.azimuth -= e.movementX * this.turnSpeed;
        this.updateOrientation();
      }
    });
    this.canvas.addEventListener('mousedown', (event) => {
      if (this.canvas.requestPointerLock && document.pointerLockElement !== this.canvas) {
        this.canvas.requestPointerLock();
        return;
      }
      if (event.button === 0) {
        this.wantsToCollect = true;
        return;
      }
      if (event.button === 2) {
        this.wantsToBuild = true;
      }
    });
    this.canvas.addEventListener('mouseup', (event) => {
      if (event.button === 0) {
        this.wantsToCollect = false;
        return;
      }
      if (event.button === 2) {
        this.wantsToBuild = false;
      }
    });

    window.addEventListener("keypress", (event) => {
      if (event.code === "KeyP") {
        if (this.playMode === PlayMode.Fly) {
          this.playMode = PlayMode.Normal;
        } else {
          this.playMode = PlayMode.Fly;
        }
      } else if (event.code === 'KeyM') {
        this.renderMode = this.renderMode === RenderMode.Gaussian ? RenderMode.Flat : RenderMode.Gaussian;
      } else if (event.code === 'KeyV') {
        this.playerSpeed = this.playerSpeed === 15 ? 1000 : 15;
      } else if (event.code === 'Minus') {
        this.pixelSize += 1;
        resizeCanvas();
      } else if (event.code === 'Equal') {
        this.pixelSize = Math.max(this.pixelSize - 1, 1);
        resizeCanvas();
      } else if (event.code === 'KeyU') {
        const visible = debugDiv?.classList.contains('flex') || false;
        debugDiv?.classList.remove(visible ? 'flex' : 'hidden');
        debugDiv?.classList.add(visible ? 'hidden' : 'flex')
      }
    });

    window.addEventListener("keydown", (event) => {
      // @ts-ignore
      this.keys[event.code] = true;
      if (event.code === 'Space' && !event.repeat) {
        this.wantsToJump = true;
      }
    });
    window.addEventListener("keyup", (event) => {
      // @ts-ignore
      this.keys[event.code] = false;
    });

    let then = 0.0;
    const render = (now: number) => {
      now *= 0.001;
      let deltaTime = Math.min(now - then, 0.1);
      then = now;

      this.frame += deltaTime < 0.02 ? '.' : (deltaTime < 0.03 ? 'o' : 'O');
      this.frame = this.frame.slice(1);
      frameDiv.innerText = this.frame;

      const desiredVelocity: Vec3 = [0, 0, 0];
      if (this.keys.KeyD) {
        desiredVelocity[0] += this.playerSpeed * this.right[0];
        desiredVelocity[1] += this.playerSpeed * this.right[1];
        desiredVelocity[2] += this.playerSpeed * this.right[2];
      }
      if (this.keys.KeyA) {
        desiredVelocity[0] -= this.playerSpeed * this.right[0];
        desiredVelocity[1] -= this.playerSpeed * this.right[1];
        desiredVelocity[2] -= this.playerSpeed * this.right[2];
      }
      if (this.keys.KeyW) {
        desiredVelocity[0] += this.playerSpeed * this.forward[0];
        desiredVelocity[1] += this.playerSpeed * this.forward[1];
        desiredVelocity[2] += this.playerSpeed * this.forward[2];
      }
      if (this.keys.KeyS) {
        desiredVelocity[0] -= this.playerSpeed * this.forward[0];
        desiredVelocity[1] -= this.playerSpeed * this.forward[1];
        desiredVelocity[2] -= this.playerSpeed * this.forward[2];
      }
      // if (this.playMode == PlayMode.Fly) {
      if (this.keys.Space) {
        desiredVelocity[0] += this.playerSpeed * this.up[0];
        desiredVelocity[1] += this.playerSpeed * this.up[1];
        desiredVelocity[2] += this.playerSpeed * this.up[2];
      }
      if (this.keys.ShiftLeft) {
        desiredVelocity[0] -= this.playerSpeed * this.up[0];
        desiredVelocity[1] -= this.playerSpeed * this.up[1];
        desiredVelocity[2] -= this.playerSpeed * this.up[2];
      }
      // } else {
      //   if (this.wantsToJump) {
      //     desiredVelocity[1] -= this.jumpVelocity / this.playerDampen;
      //     this.wantsToJump = false;
      //   }
      // }

      // Update velocity
      this.playerVelocity[0] = 0.8*desiredVelocity[0] + 0.2*this.playerVelocity[0];
      if (this.playMode == PlayMode.Fly || desiredVelocity[1] !== 0) {
        this.playerVelocity[1] = 0.8*desiredVelocity[1] + 0.2*this.playerVelocity[1];
      }
      this.playerVelocity[2] = 0.8*desiredVelocity[2] + 0.2*this.playerVelocity[2];

      // Update position
      this.eye[0] += this.playerVelocity[0] * deltaTime;
      this.eye[1] += this.playerVelocity[1] * deltaTime;
      this.eye[2] += this.playerVelocity[2] * deltaTime;

      // Gravity
      if (this.playMode === PlayMode.Normal) {
        this.playerVelocity[1] += this.gravity * deltaTime;
      }

      this.renderer.render({
        look: this.look,
        up: this.up,
        eye: this.eye,
        desiredVelocity,
        deltaTime,
        collect: this.wantsToCollect,
        build: this.wantsToBuild,
        renderMode: this.renderMode,
        playMode: this.playMode,
      });
      this.wantsToCollect = false;
      this.wantsToBuild = false;

      requestAnimationFrame(render);
      eyeDiv.innerText = `pos ${vecToString(this.eye, 2)}`;
      velocityDiv.innerText = `ground ${this.onGround ? 1 : 0} vel ${vecToString([this.rightVelocity, this.upVelocity, this.forwardVelocity], 2)}`;
      lookDiv.innerText = `loo  ${vecToString(this.look, 2)}`;
    }
    requestAnimationFrame(render);
  }

  private updateOrientation() {
    vec3.rotateX(this.look, [0, 0, -1], [0, 0, 0], this.elevation);
    vec3.rotateY(this.forward, [0, 0, -1], [0, 0, 0], this.azimuth);
    vec3.rotateY(this.look, this.look, [0, 0, 0], this.azimuth);
    vec3.cross(this.right, this.forward, this.up);
  }

  focus() {
    if (this.canvas.requestPointerLock) {
      this.canvas.requestPointerLock();
    }
  }
};
