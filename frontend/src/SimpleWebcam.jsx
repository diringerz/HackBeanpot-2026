import React, { useRef, useState, useEffect } from 'react';
import vertexShaderSource from './shaders/curved_mirror_vertex.glsl?raw';
import fragmentShaderSource from './shaders/analytical_mirror_fragment.glsl?raw';

export default function SimpleWebcam() {
  const videoRef = useRef(null);
  const glCanvasRef = useRef(null);
  const rayTracedCanvasRef = useRef(null);
  const diagramCanvasRef = useRef(null);
  const [isActive, setIsActive] = useState(false);
  const glRef = useRef(null);
  const rayTracedGlRef = useRef(null);
  const textureRef = useRef(null);
  const rayTracedTextureRef = useRef(null);
  const shaderProgramRef = useRef(null);

  // Mirror parameters (state)
  const [profileA2, setProfileA2] = useState(0.0);    // r⁴ coefficient
  const [profileA1, setProfileA1] = useState(-0.3);   // r² coefficient  
  const [profileA0, setProfileA0] = useState(0.0);    // constant offset
  const [mirrorDist, setMirrorDist] = useState(2.0);  // distance from camera
  const [mirrorRadius, setMirrorRadius] = useState(1.5); // mirror radius
  const [imagePlaneDist, setImagePlaneDist] = useState(0.5); // image plane distance
  const [imageSizeX, setImageSizeX] = useState(1.6);  // image size X
  const [imageSizeY, setImageSizeY] = useState(1.2);  // image size Y
  const [fov, setFov] = useState(Math.PI / 3.0);      // field of view (60 degrees)

  useEffect(() => {
    const canvas = glCanvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', { 
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    });
    
    if (!gl) {
      console.error('WebGL not supported');
      return;
    }
    
    glRef.current = gl;
    
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    textureRef.current = texture;

    // Create simple passthrough shader for original feed
    const vertexShaderSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    const fragmentShaderSource = `
      precision mediump float;
      uniform sampler2D u_texture;
      varying vec2 v_texCoord;
      void main() {
        gl_FragColor = texture2D(u_texture, v_texCoord);
      }
    `;

    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexShaderSource);
    gl.compileShader(vertexShader);

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentShaderSource);
    gl.compileShader(fragmentShader);

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    // Create buffer for fullscreen quad
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = new Float32Array([
      -1, -1,  1, 1,  // flip u coordinate (0->1)
       1, -1,  0, 1,  // flip u coordinate (1->0)
      -1,  1,  1, 0,  // flip u coordinate (0->1)
       1,  1,  0, 0,  // flip u coordinate (1->0)
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    // Store program and buffer references
    gl.program = program;
    gl.positionBuffer = positionBuffer;

    console.log('WebGL initialized for original feed');
  }, []);

  // Initialize ray-traced canvas
  useEffect(() => {
    const canvas = rayTracedCanvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    });

    if (!gl) {
      console.error('WebGL not supported for ray-traced output');
      return;
    }

    rayTracedGlRef.current = gl;

    // Create texture to hold the webcam input for ray tracing
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    rayTracedTextureRef.current = texture;

    // Compile shaders
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexShaderSource);
    gl.compileShader(vertexShader);
    
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      console.error('Vertex shader compilation error:', gl.getShaderInfoLog(vertexShader));
      return;
    }

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentShaderSource);
    gl.compileShader(fragmentShader);
    
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      console.error('Fragment shader compilation error:', gl.getShaderInfoLog(fragmentShader));
      return;
    }

    // Create program
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Shader program link error:', gl.getProgramInfoLog(program));
      return;
    }

    shaderProgramRef.current = program;

    // Create fullscreen quad buffer
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    gl.positionBuffer = positionBuffer;

    console.log('WebGL initialized for ray-traced feed');
  }, []);

  // Draw cross-section diagram
  useEffect(() => {
    const canvas = diagramCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);
    
    // Set up coordinate system
    // Camera is at origin, looking +Z (right on diagram)
    // We'll draw a side view: horizontal = Z axis, vertical = Y/R axis
    const scale = 60; // pixels per unit
    const originX = 150; // camera position
    const originY = height / 2;
    
    // Helper function to convert world coords to canvas coords
    const toCanvasX = (z) => originX + z * scale;
    const toCanvasY = (r) => originY - r * scale; // flip Y
    
    // Draw axes
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    
    // Z axis (horizontal)
    ctx.beginPath();
    ctx.moveTo(0, originY);
    ctx.lineTo(width, originY);
    ctx.stroke();
    
    // R axis (vertical)
    ctx.beginPath();
    ctx.moveTo(originX, 0);
    ctx.lineTo(originX, height);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw camera at origin
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.arc(toCanvasX(0), toCanvasY(0), 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#00ff00';
    ctx.font = '12px monospace';
    ctx.fillText('Camera', toCanvasX(0) - 30, toCanvasY(0) - 15);
    
    // Draw image plane (behind camera)
    const imgPlaneZ = -imagePlaneDist;
    const imgPlaneHalfHeight = imageSizeY / 2;
    
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(toCanvasX(imgPlaneZ), toCanvasY(-imgPlaneHalfHeight));
    ctx.lineTo(toCanvasX(imgPlaneZ), toCanvasY(imgPlaneHalfHeight));
    ctx.stroke();
    
    ctx.fillStyle = '#ff00ff';
    ctx.fillText('Image Plane', toCanvasX(imgPlaneZ) - 45, toCanvasY(imgPlaneHalfHeight) + 20);
    
    // Draw mirror curve
    // Profile: z(r) = a2*r^4 + a1*r^2 + a0 + mirrorDist
    ctx.strokeStyle = '#00aaff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    const numPoints = 100;
    let firstPoint = true;
    
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const r = -mirrorRadius + t * (2 * mirrorRadius);
      const r2 = r * r;
      const r4 = r2 * r2;
      const z = profileA2 * r4 + profileA1 * r2 + profileA0 + mirrorDist;
      
      const canvasX = toCanvasX(z);
      const canvasY = toCanvasY(r);
      
      if (firstPoint) {
        ctx.moveTo(canvasX, canvasY);
        firstPoint = false;
      } else {
        ctx.lineTo(canvasX, canvasY);
      }
    }
    ctx.stroke();
    
    // Draw mirror endpoints
    const r = mirrorRadius;
    const r2 = r * r;
    const r4 = r2 * r2;
    const zEdge = profileA2 * r4 + profileA1 * r2 + profileA0 + mirrorDist;
    
    ctx.fillStyle = '#00aaff';
    ctx.beginPath();
    ctx.arc(toCanvasX(zEdge), toCanvasY(r), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(toCanvasX(zEdge), toCanvasY(-r), 5, 0, Math.PI * 2);
    ctx.fill();
    
    // Label mirror
    const zCenter = profileA0 + mirrorDist;
    ctx.fillStyle = '#00aaff';
    ctx.fillText('Mirror', toCanvasX(zCenter) - 20, toCanvasY(mirrorRadius) + 20);
    
    // Helper function to calculate surface normal at a point
    const surfaceNormal = (r) => {
      const r2 = r * r;
      const dCoeff = 4.0 * profileA2 * r2 + 2.0 * profileA1;
      
      // For 2D cross-section: normal in (z, r) plane
      // dz/dr = r * dCoeff
      const dzdr = r * dCoeff;
      
      // Normal is perpendicular to tangent
      // Tangent direction: (1, dzdr) in (z, r) coords
      // Normal direction: (-dzdr, 1) pointing toward camera
      const nz = -dzdr;
      const nr = 1.0;
      const len = Math.sqrt(nz * nz + nr * nr);
      
      return { nz: nz / len, nr: nr / len };
    };
    
    // Helper function to reflect a ray direction around a normal
    const reflect = (incidentZ, incidentR, normalZ, normalR) => {
      // R = I - 2(N·I)N
      const dot = incidentZ * normalZ + incidentR * normalR;
      return {
        z: incidentZ - 2.0 * dot * normalZ,
        r: incidentR - 2.0 * dot * normalR
      };
    };
    
    // Draw multiple sample rays
    const numRays = 7;
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    
    for (let i = 0; i < numRays; i++) {
      // Distribute rays across the field of view
      const rayR = (i / (numRays - 1) - 0.5) * mirrorRadius * 1.6;
      
      // Ray from camera (0, 0) toward mirror
      // Direction to hit approximately at r=rayR on mirror base plane
      const approxZ = mirrorDist;
      const rayDirZ = approxZ;
      const rayDirR = rayR;
      const rayLen = Math.sqrt(rayDirZ * rayDirZ + rayDirR * rayDirR);
      const rayDirNormZ = rayDirZ / rayLen;
      const rayDirNormR = rayDirR / rayLen;
      
      // Find actual intersection with mirror surface
      // For simplicity, iterate to find intersection point
      let hitR = rayR;
      for (let iter = 0; iter < 5; iter++) {
        const hitR2 = hitR * hitR;
        const hitR4 = hitR2 * hitR2;
        const hitZ = profileA2 * hitR4 + profileA1 * hitR2 + profileA0 + mirrorDist;
        
        // Ray: (0,0) + t * (rayDirNormZ, rayDirNormR)
        // We want: t * rayDirNormR = hitR and t * rayDirNormZ = hitZ
        const t = hitZ / rayDirNormZ;
        const computedR = t * rayDirNormR;
        
        // Update hitR for next iteration
        hitR = computedR;
      }
      
      const hitR2 = hitR * hitR;
      const hitR4 = hitR2 * hitR2;
      const hitZ = profileA2 * hitR4 + profileA1 * hitR2 + profileA0 + mirrorDist;
      
      // Check if ray hits within mirror bounds
      if (Math.abs(hitR) > mirrorRadius) continue;
      
      // Draw incident ray
      ctx.beginPath();
      ctx.moveTo(toCanvasX(0), toCanvasY(0));
      ctx.lineTo(toCanvasX(hitZ), toCanvasY(hitR));
      ctx.stroke();
      
      // Calculate surface normal at hit point
      const normal = surfaceNormal(hitR);
      
      // Ensure normal points toward camera (negative Z)
      let nz = normal.nz;
      let nr = normal.nr;
      if (nz > 0) {
        nz = -nz;
        nr = -nr;
      }
      
      // Calculate reflected ray direction
      const reflected = reflect(rayDirNormZ, rayDirNormR, nz, nr);
      
      // Trace reflected ray to image plane
      // Image plane is at z = -imagePlaneDist
      // Ray: (hitZ, hitR) + t * (reflected.z, reflected.r)
      // Solve: hitZ + t * reflected.z = -imagePlaneDist
      if (reflected.z < 0) { // Ray heading back toward camera
        const t = (-imagePlaneDist - hitZ) / reflected.z;
        const imgHitZ = -imagePlaneDist;
        const imgHitR = hitR + t * reflected.r;
        
        // Draw reflected ray
        ctx.beginPath();
        ctx.moveTo(toCanvasX(hitZ), toCanvasY(hitR));
        ctx.lineTo(toCanvasX(imgHitZ), toCanvasY(imgHitR));
        ctx.stroke();
      }
    }
    
    ctx.setLineDash([]);
    
    // Add legend/scale
    ctx.fillStyle = '#aaa';
    ctx.font = '11px monospace';
    ctx.fillText(`Scale: ${scale}px = 1 unit`, 10, height - 10);
    
  }, [profileA2, profileA1, profileA0, mirrorDist, mirrorRadius, imagePlaneDist, imageSizeX, imageSizeY]);


  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 640 }, 
          height: { ideal: 480 },
          frameRate: { ideal: 30 }
        } 
      });
      videoRef.current.srcObject = stream;
      setIsActive(true);
    } catch (err) {
      alert('Camera access denied: ' + err.message);
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsActive(false);
    }
  };

  useEffect(() => {
    if (!isActive) return;

    const video = videoRef.current;
    const gl = glRef.current;
    const texture = textureRef.current;
    const glCanvas = glCanvasRef.current;
    const rayTracedGl = rayTracedGlRef.current;
    const rayTracedCanvas = rayTracedCanvasRef.current;
    
    if (!gl || !texture || !video || !rayTracedGl || !rayTracedCanvas) return;

    let frameCount = 0;
    let lastTime = performance.now();
    let animationFrameId;
    
    const render = () => {
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      // Only resize if dimensions changed
      if (glCanvas.width !== video.videoWidth || glCanvas.height !== video.videoHeight) {
        glCanvas.width = video.videoWidth;
        glCanvas.height = video.videoHeight;
        gl.viewport(0, 0, glCanvas.width, glCanvas.height);
      }

      // Only resize ray-traced canvas if dimensions changed
      if (rayTracedCanvas.width !== video.videoWidth || rayTracedCanvas.height !== video.videoHeight) {
        rayTracedCanvas.width = video.videoWidth;
        rayTracedCanvas.height = video.videoHeight;
        rayTracedGl.viewport(0, 0, rayTracedCanvas.width, rayTracedCanvas.height);
      }

      // Upload frame to original texture
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

      // Render original feed
      gl.useProgram(gl.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.positionBuffer);
      
      const positionLoc = gl.getAttribLocation(gl.program, 'a_position');
      const texCoordLoc = gl.getAttribLocation(gl.program, 'a_texCoord');
      
      gl.enableVertexAttribArray(positionLoc);
      gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 16, 0);
      
      gl.enableVertexAttribArray(texCoordLoc);
      gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 16, 8);
      
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(gl.getUniformLocation(gl.program, 'u_texture'), 0);
      
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Render ray-traced output
      const rayTracedTexture = rayTracedTextureRef.current;
      const program = shaderProgramRef.current;
      
      if (program && rayTracedTexture) {
        // Upload webcam frame to ray-traced texture
        rayTracedGl.bindTexture(rayTracedGl.TEXTURE_2D, rayTracedTexture);
        rayTracedGl.texImage2D(rayTracedGl.TEXTURE_2D, 0, rayTracedGl.RGBA, rayTracedGl.RGBA, rayTracedGl.UNSIGNED_BYTE, video);

        rayTracedGl.useProgram(program);
        
        // Set up vertex attributes
        rayTracedGl.bindBuffer(rayTracedGl.ARRAY_BUFFER, rayTracedGl.positionBuffer);
        const aPosition = rayTracedGl.getAttribLocation(program, 'a_position');
        rayTracedGl.enableVertexAttribArray(aPosition);
        rayTracedGl.vertexAttribPointer(aPosition, 2, rayTracedGl.FLOAT, false, 0, 0);
        
        // Set uniforms
        rayTracedGl.uniform2f(rayTracedGl.getUniformLocation(program, 'u_resolution'), 
          rayTracedCanvas.width, rayTracedCanvas.height);
        
        // Mirror parameters from state
        rayTracedGl.uniform3f(rayTracedGl.getUniformLocation(program, 'u_profileCoeffs'), 
          profileA2, profileA1, profileA0);
        
        rayTracedGl.uniform1f(rayTracedGl.getUniformLocation(program, 'u_mirrorDist'), mirrorDist);
        rayTracedGl.uniform1f(rayTracedGl.getUniformLocation(program, 'u_mirrorRadius'), mirrorRadius);
        rayTracedGl.uniform1f(rayTracedGl.getUniformLocation(program, 'u_imagePlaneDist'), imagePlaneDist);
        rayTracedGl.uniform2f(rayTracedGl.getUniformLocation(program, 'u_imageSize'), imageSizeX, imageSizeY);
        rayTracedGl.uniform1f(rayTracedGl.getUniformLocation(program, 'u_fov'), fov);
        
        // Bind webcam texture
        rayTracedGl.activeTexture(rayTracedGl.TEXTURE0);
        rayTracedGl.bindTexture(rayTracedGl.TEXTURE_2D, rayTracedTexture);
        rayTracedGl.uniform1i(rayTracedGl.getUniformLocation(program, 'u_webcamTex'), 0);
        
        // Clear and draw
        rayTracedGl.clearColor(0.0, 0.0, 0.0, 1.0);
        rayTracedGl.clear(rayTracedGl.COLOR_BUFFER_BIT);
        rayTracedGl.drawArrays(rayTracedGl.TRIANGLE_STRIP, 0, 4);
      }

      // FPS counter
      frameCount++;
      const currentTime = performance.now();
      if (currentTime - lastTime >= 1000) {
        console.log('FPS:', frameCount);
        frameCount = 0;
        lastTime = currentTime;
      }

      animationFrameId = requestAnimationFrame(render);
    };
    
    render();
    
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isActive, profileA2, profileA1, profileA0, mirrorDist, mirrorRadius, imagePlaneDist, imageSizeX, imageSizeY, fov]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '20px' }}>
      <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h3>Original Feed</h3>
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            width="640" 
            height="480"
            style={{ display: 'none' }}
          />
          <canvas 
            ref={glCanvasRef} 
            width="640" 
            height="480"
            style={{ border: '2px solid #ccc', borderRadius: '8px' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h3>Ray-Traced Output</h3>
          <canvas 
            ref={rayTracedCanvasRef} 
            width="640" 
            height="480"
            style={{ border: '2px solid #ccc', borderRadius: '8px' }}
          />
        </div>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
        <h3>Scene Cross-Section (Side View)</h3>
        <canvas 
          ref={diagramCanvasRef} 
          width="800" 
          height="400"
          style={{ border: '2px solid #555', borderRadius: '8px', backgroundColor: '#1a1a1a' }}
        />
        <div style={{ fontSize: '12px', color: '#aaa', textAlign: 'center' }}>
          <span style={{ color: '#00ff00' }}>● Camera</span> | 
          <span style={{ color: '#ff00ff' }}> ─ Image Plane</span> | 
          <span style={{ color: '#00aaff' }}> ─ Mirror</span> | 
          <span style={{ color: '#ffff00' }}> ┄ Sample Ray</span>
        </div>
      </div>
      
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
        <button onClick={startCamera} disabled={isActive}>Start</button>
        <button onClick={stopCamera} disabled={!isActive}>Stop</button>
      </div>
      
      <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        <h3>Mirror Parameters</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Profile a₂ (r⁴): {profileA2.toFixed(3)}
            </label>
            <input 
              type="range" 
              min="-0.5" 
              max="0.5" 
              step="0.01" 
              value={profileA2} 
              onChange={(e) => setProfileA2(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Profile a₁ (r²): {profileA1.toFixed(3)}
            </label>
            <input 
              type="range" 
              min="-1.0" 
              max="1.0" 
              step="0.05" 
              value={profileA1} 
              onChange={(e) => setProfileA1(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Profile a₀ (offset): {profileA0.toFixed(3)}
            </label>
            <input 
              type="range" 
              min="-1.0" 
              max="1.0" 
              step="0.05" 
              value={profileA0} 
              onChange={(e) => setProfileA0(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Mirror Distance: {mirrorDist.toFixed(2)}
            </label>
            <input 
              type="range" 
              min="0.5" 
              max="5.0" 
              step="0.1" 
              value={mirrorDist} 
              onChange={(e) => setMirrorDist(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Mirror Radius: {mirrorRadius.toFixed(2)}
            </label>
            <input 
              type="range" 
              min="0.5" 
              max="3.0" 
              step="0.1" 
              value={mirrorRadius} 
              onChange={(e) => setMirrorRadius(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Image Plane Distance: {imagePlaneDist.toFixed(2)}
            </label>
            <input 
              type="range" 
              min="0.1" 
              max="2.0" 
              step="0.05" 
              value={imagePlaneDist} 
              onChange={(e) => setImagePlaneDist(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Image Size X: {imageSizeX.toFixed(2)}
            </label>
            <input 
              type="range" 
              min="0.5" 
              max="3.0" 
              step="0.1" 
              value={imageSizeX} 
              onChange={(e) => setImageSizeX(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Image Size Y: {imageSizeY.toFixed(2)}
            </label>
            <input 
              type="range" 
              min="0.5" 
              max="3.0" 
              step="0.1" 
              value={imageSizeY} 
              onChange={(e) => setImageSizeY(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              FOV: {(fov * 180 / Math.PI).toFixed(1)}°
            </label>
            <input 
              type="range" 
              min={Math.PI / 6} 
              max={Math.PI * 2 / 3} 
              step="0.01" 
              value={fov} 
              onChange={(e) => setFov(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
          
        </div>
      </div>
    </div>
  );
}