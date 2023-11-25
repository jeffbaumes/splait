import { vec3 } from "gl-matrix";

import { Renderer } from "./Renderer";
import { PlayMode, RenderMode, Vec3 } from "./types";

const vecToString = (x: number[] | Float32Array | null, digits: number = 0) => {
  if (!x) {
    return 'null';
  }
  return [...x].map(d => d.toLocaleString(undefined, {minimumFractionDigits: digits, maximumFractionDigits: digits})).join(', ');
};

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
  playerSpeed = 1000.0;
  playerDampen = 0.5;
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
  renderer: Renderer;

  constructor(private canvas: HTMLCanvasElement) {
    if (!this.canvas) {
      throw 'Could not find canvas!';
    }
    this.renderer = new Renderer(this.canvas);
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

      // while (deltaTime > 1.1/60.0) {
      //   this.movePlayer(1.1/60.0);
      //   deltaTime -= 1.1/60.0;
      // }
      // this.movePlayer(deltaTime);

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

  // movePlayer(dt: number) {
  //   const dv = dt * this.playerAcceleration;
  //   if (this.keys.KeyD) {
  //     this.rightVelocity = Math.min(this.rightVelocity + dv, this.playerSpeed);
  //   }
  //   if (this.keys.KeyA) {
  //     this.rightVelocity = Math.max(this.rightVelocity - dv, -this.playerSpeed);
  //   }
  //   if (!this.keys.KeyD && !this.keys.KeyA) {
  //     this.rightVelocity = Math.sign(this.rightVelocity)*Math.max(Math.abs(this.rightVelocity) - dv, 0.0);
  //   }

  //   if (this.keys.KeyW) {
  //     this.forwardVelocity = Math.min(this.forwardVelocity + dv, this.playerSpeed);
  //   }
  //   if (this.keys.KeyS) {
  //     this.forwardVelocity = Math.max(this.forwardVelocity - dv, -this.playerSpeed);
  //   }
  //   if (!this.keys.KeyW && !this.keys.KeyS) {
  //     this.forwardVelocity = Math.sign(this.forwardVelocity)*Math.max(Math.abs(this.forwardVelocity) - dv, 0.0);
  //   }

  //   if (this.playMode === PlayMode.Fly) {
  //     if (this.keys.Space) {
  //       this.upVelocity = Math.min(this.upVelocity + dv, this.playerSpeed);
  //     }
  //     if (this.keys.ShiftLeft) {
  //       this.upVelocity = Math.max(this.upVelocity - dv, -this.playerSpeed);
  //     }
  //     if (!this.keys.Space && !this.keys.ShiftLeft) {
  //       this.upVelocity = Math.sign(this.upVelocity)*Math.max(Math.abs(this.upVelocity) - dv, 0.0);
  //     }
  //   } else if (this.playMode === PlayMode.Normal) {
  //     if (!this.onGround) {
  //       this.upVelocity = Math.max(this.upVelocity + dt * this.gravity, -this.fallSpeed);
  //     }
  //     if (this.keys.Space) {
  //       if (this.onGround) {
  //         this.upVelocity = this.jumpVelocity;
  //         this.onGround = false;
  //       }
  //     }
  //   }

  //   const distanceEstimate = dt*Math.max(Math.abs(this.rightVelocity), Math.abs(this.forwardVelocity), Math.abs(this.upVelocity));
  //   const steps = Math.floor(distanceEstimate / (0.5*this.playerCorner)) + 1;
  //   const ddt = dt / steps;
  //   for (let step = 0; step < steps; step += 1) {
  //     const rightMovement = vec3.clone(this.right);
  //     vec3.scale(rightMovement, rightMovement, ddt*this.rightVelocity);

  //     const forwardMovement = vec3.clone(this.forward);
  //     vec3.scale(forwardMovement, forwardMovement, ddt*this.forwardVelocity);

  //     const upMovement = vec3.clone(this.up);
  //     vec3.scale(upMovement, upMovement, ddt*this.upVelocity);

  //     vec3.zero(this.movement);
  //     vec3.add(this.movement, this.movement, rightMovement);
  //     vec3.add(this.movement, this.movement, forwardMovement);
  //     vec3.add(this.movement, this.movement, upMovement);
  //     vec3.add(this.eye, this.eye, this.movement);
  //   }
  // }
};
