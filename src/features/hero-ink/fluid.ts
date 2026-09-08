/*! Copyright (c) 2017 Pavel Dobryakov. MIT; see /licenses/webgl-fluid.txt. */
import * as shaders from "./shaders";
import { heroInkConfig, type InkConfig } from "./config";

type Target = { texture: WebGLTexture; framebuffer: WebGLFramebuffer; width: number; height: number };
type Pair = { read: Target; write: Target };
type Program = { handle: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null> };
export type InkFluid = ReturnType<typeof createInkFluid>;

const display = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uDye;
uniform vec3 inkColor;
uniform float opacity;
void main() {
  float density = clamp(texture2D(uDye, vUv).r, 0.0, 1.0);
  float edge = smoothstep(0.0, 0.045, vUv.x) * smoothstep(0.0, 0.045, 1.0-vUv.x)
             * smoothstep(0.0, 0.045, vUv.y) * smoothstep(0.0, 0.045, 1.0-vUv.y);
  float alpha = density * opacity * edge;
  gl_FragColor = vec4(inkColor * alpha, alpha);
}`;

export function createInkFluid(canvas: HTMLCanvasElement, config: InkConfig = heroInkConfig) {
  const context = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: "low-power" });
  if (!context) throw new Error("WebGL2 unavailable");
  const gl = context;
  const textures = new Set<WebGLTexture>(), framebuffers = new Set<WebGLFramebuffer>();
  const programs = new Set<WebGLProgram>(), shaderObjects = new Set<WebGLShader>(), buffers = new Set<WebGLBuffer>();
  let disposed = false;
  function dispose(loseContext = true) {
    if (!disposed) {
    disposed = true;
    for (const value of textures) gl.deleteTexture(value);
    for (const value of framebuffers) gl.deleteFramebuffer(value);
    for (const value of programs) gl.deleteProgram(value);
    for (const value of shaderObjects) gl.deleteShader(value);
    for (const value of buffers) gl.deleteBuffer(value);
    textures.clear(); framebuffers.clear(); programs.clear(); shaderObjects.clear(); buffers.clear();
    }
    if (loseContext) gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
  function shader(type: number, source: string) {
    const value = gl.createShader(type);
    if (!value) throw new Error("Shader allocation failed");
    shaderObjects.add(value); gl.shaderSource(value, source); gl.compileShader(value);
    if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw new Error("Shader compilation failed");
    return value;
  }
  function program(vertex: WebGLShader, fragment: string): Program {
    const handle = gl.createProgram();
    if (!handle) throw new Error("Program allocation failed");
    programs.add(handle);
    gl.attachShader(handle, vertex); gl.attachShader(handle, shader(gl.FRAGMENT_SHADER, fragment));
    gl.bindAttribLocation(handle, 0, "aPosition"); gl.linkProgram(handle);
    if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) throw new Error("Shader linking failed");
    const uniforms: Program["uniforms"] = {};
    for (let i = 0; i < gl.getProgramParameter(handle, gl.ACTIVE_UNIFORMS); i++) {
      const name = gl.getActiveUniform(handle, i)!.name;
      uniforms[name] = gl.getUniformLocation(handle, name);
    }
    return { handle, uniforms };
  }
  function target(width: number, height: number): Target {
    const texture = gl.createTexture(), framebuffer = gl.createFramebuffer();
    if (texture) textures.add(texture);
    if (framebuffer) framebuffers.add(framebuffer);
    if (!texture || !framebuffer) throw new Error("Framebuffer allocation failed");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Float framebuffer unavailable");
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    return { texture, framebuffer, width, height };
  }
  function releaseTargets() {
    for (const value of textures) gl.deleteTexture(value);
    for (const value of framebuffers) gl.deleteFramebuffer(value);
    textures.clear(); framebuffers.clear();
  }
  function swap(pair: Pair) { [pair.read, pair.write] = [pair.write, pair.read]; }
  function bindProgram(p: Program) { gl.useProgram(p.handle); return p.uniforms; }
  function sample(p: Program, name: string, t: Target, unit: number) {
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t.texture);
    gl.uniform1i(p.uniforms[name], unit);
  }
  function draw(t: Target | null) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t?.framebuffer ?? null);
    gl.viewport(0, 0, t?.width ?? canvas.width, t?.height ?? canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  try {
    if (!gl.getExtension("EXT_color_buffer_float")) throw new Error("Float textures unavailable");
    const vertex = shader(gl.VERTEX_SHADER, shaders.baseVertex);
    const splat = program(vertex, shaders.splat), advect = program(vertex, shaders.advection);
    const curlProgram = program(vertex, shaders.curl), vorticity = program(vertex, shaders.vorticity);
    const divergenceProgram = program(vertex, shaders.divergence), pressureProgram = program(vertex, shaders.pressure);
    const gradient = program(vertex, shaders.gradientSubtract), render = program(vertex, display);
    for (const value of shaderObjects) gl.deleteShader(value);
    shaderObjects.clear();
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error("Buffer allocation failed");
    buffers.add(buffer); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(0);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    let velocity: Pair, dye: Pair, pressure: Pair, divergence: Target, curl: Target;
    function resize() {
      if (disposed) return;
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, config.maxDevicePixelRatio, config.maxCanvasEdge / Math.max(bounds.width, bounds.height, 1));
      const width = Math.max(1, Math.round(bounds.width * ratio)), height = Math.max(1, Math.round(bounds.height * ratio));
      if (velocity && canvas.width === width && canvas.height === height) return;
      canvas.width = width; canvas.height = height;
      releaseTargets();
      const dimensions = (resolution: number) => {
        const aspect = width / height;
        return aspect >= 1 ? [resolution, Math.max(2, Math.round(resolution / aspect))] : [Math.max(2, Math.round(resolution * aspect)), resolution];
      };
      const [w, h] = dimensions(config.simulationResolution), [dw, dh] = dimensions(config.dyeResolution);
      const pair = (x: number, y: number) => ({ read: target(x, y), write: target(x, y) });
      velocity = pair(w, h); dye = pair(dw, dh); pressure = pair(w, h);
      divergence = target(w, h); curl = target(w, h);
      clear();
    }
    function clear() {
      if (disposed) return;
      gl.clearColor(0, 0, 0, 0);
      for (const framebuffer of framebuffers) { gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer); gl.clear(gl.COLOR_BUFFER_BIT); }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.clear(gl.COLOR_BUFFER_BIT);
    }
    function inject(x: number, y: number, dx: number, dy: number, amount: number) {
      if (disposed) return;
      const u = bindProgram(splat);
      gl.uniform1f(u.aspectRatio, canvas.width / canvas.height); gl.uniform2f(u.point, x, y);
      const radius = config.radius * Math.min(1, canvas.width / canvas.height);
      gl.uniform1f(u.radius, radius * radius);
      sample(splat, "uTarget", velocity.read, 0);
      gl.uniform3f(u.color, dx, dy, 0); gl.uniform1f(u.ceiling, config.maxForce * 2);
      draw(velocity.write); swap(velocity);
      sample(splat, "uTarget", dye.read, 0);
      gl.uniform3f(u.color, amount, 0, 0); gl.uniform1f(u.ceiling, 1);
      draw(dye.write); swap(dye);
    }
    function step(dt: number) {
      if (disposed) return;
      const texels = (p: Program) => gl.uniform2f(p.uniforms.texelSize, 1 / velocity.read.width, 1 / velocity.read.height);
      bindProgram(curlProgram); texels(curlProgram); sample(curlProgram, "uVelocity", velocity.read, 0); draw(curl);
      bindProgram(vorticity); texels(vorticity); sample(vorticity, "uVelocity", velocity.read, 0); sample(vorticity, "uCurl", curl, 1);
      gl.uniform1f(vorticity.uniforms.curl, config.curl); gl.uniform1f(vorticity.uniforms.dt, dt);
      draw(velocity.write); swap(velocity);
      bindProgram(divergenceProgram); texels(divergenceProgram); sample(divergenceProgram, "uVelocity", velocity.read, 0); draw(divergence);
      gl.bindFramebuffer(gl.FRAMEBUFFER, pressure.read.framebuffer); gl.clear(gl.COLOR_BUFFER_BIT);
      bindProgram(pressureProgram); texels(pressureProgram); sample(pressureProgram, "uDivergence", divergence, 0);
      for (let i = 0; i < config.pressureIterations; i++) { sample(pressureProgram, "uPressure", pressure.read, 1); draw(pressure.write); swap(pressure); }
      bindProgram(gradient); texels(gradient); sample(gradient, "uPressure", pressure.read, 0); sample(gradient, "uVelocity", velocity.read, 1);
      draw(velocity.write); swap(velocity);
      bindProgram(advect); texels(advect); gl.uniform1f(advect.uniforms.dt, dt);
      sample(advect, "uVelocity", velocity.read, 0); sample(advect, "uSource", velocity.read, 0);
      gl.uniform2f(advect.uniforms.dyeTexelSize, 1 / velocity.read.width, 1 / velocity.read.height);
      gl.uniform1f(advect.uniforms.dissipation, config.velocityDissipation); draw(velocity.write); swap(velocity);
      sample(advect, "uVelocity", velocity.read, 0); sample(advect, "uSource", dye.read, 1);
      gl.uniform2f(advect.uniforms.dyeTexelSize, 1 / dye.read.width, 1 / dye.read.height);
      gl.uniform1f(advect.uniforms.dissipation, config.dyeDissipation); draw(dye.write); swap(dye);
      bindProgram(render); sample(render, "uDye", dye.read, 0);
      gl.uniform3f(render.uniforms.inkColor, ...config.color); gl.uniform1f(render.uniforms.opacity, config.opacity); draw(null);
    }
    resize();
    return { resize, clear, inject, step, dispose };
  } catch (error) { dispose(); throw error; }
}
