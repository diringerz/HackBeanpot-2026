import React, { useRef, useState, useEffect } from 'react';
import vertexShaderSource from './shaders/curved_mirror_vertex.glsl?raw';
import fragmentShaderSource from './shaders/square_mirror_fragment_asym.glsl?raw';
import MirrorVisualization from './MirrorVisualization';

export default function SimpleWebcam() {
  const videoRef = useRef(null);
  const glCanvasRef = useRef(null);
  const rayTracedCanvasRef = useRef(null);
  const [isActive, setIsActive] = useState(false);
  const glRef = useRef(null);
  const rayTracedGlRef = useRef(null);
  const textureRef = useRef(null);
  const rayTracedTextureRef = useRef(null);
  const shaderProgramRef = useRef(null);

  // Mirror parameters (state)
  // Quadratic Bézier control points in y-space (full cross-section)
  // P₀ = (yMin, z₀) - bottom edge at y=-mirrorHalfHeight
  // P₁ = (y₁, z₁) - middle control point
  // P₂ = (yMax, z₂) - top edge at y=+mirrorHalfHeight
  const [controlZ0, setControlZ0] = useState(-0.3);      // z-depth at bottom
  const [controlZ1, setControlZ1] = useState(-0.6);     // z-depth of middle control point
  const [controlZ2, setControlZ2] = useState(-0.3);      // z-depth at top
  const [controlY1Ratio, setControlY1Ratio] = useState(0.0); // y₁ position as ratio (-1 to 1, where 0 = center)
  
  const [mirrorDist, setMirrorDist] = useState(2.0);  // distance from camera
  const [mirrorRadius, setMirrorRadius] = useState(1.5); // mirror radius (used for display)
  const [mirrorHalfWidth, setMirrorHalfWidth] = useState(2.0); // rectangular mirror half-width
  const [mirrorHalfHeight, setMirrorHalfHeight] = useState(1.5); // rectangular mirror half-height
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
      console.error('Fragment shader source length:', fragmentShaderSource.length);
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

    // Convert Bézier control points to polynomial coefficients
    const createSegmentsFromControlPoints = () => {
      // For a single quadratic Bézier segment from yMin to yMax
      const yMin = -mirrorHalfHeight;
      const yMax = mirrorHalfHeight;
      const yRange = yMax - yMin;
      
      // Control points in y-space:
      // P₀ = (yMin, z₀) - bottom edge
      // P₁ = (center, z₁) - middle control point (at y=0 for center)
      // P₂ = (yMax, z₂) - top edge
      
      // Quadratic Bézier parametric form: B(t) = (1-t)²·P₀ + 2(1-t)t·P₁ + t²·P₂, t ∈ [0,1]
      // where t = (y - yMin) / yRange
      
      // Bézier coefficients in t-space:
      // z(t) = a_t·t² + b_t·t + c_t
      const z0 = controlZ0;
      const z1 = controlZ1;
      const z2 = controlZ2;
      
      const a_t = z0 - 2.0 * z1 + z2;
      const b_t = 2.0 * (z1 - z0);
      const c_t = z0;
      
      // Convert to polynomial in y-space: z(y) = a·y² + b·y + c
      // by substituting t = (y - yMin) / yRange and expanding
      if (yRange === 0.0) {
        return [{ a: 0, b: 0, c: z0, yMin }];
      }
      
      const a = a_t / (yRange * yRange);
      const b = b_t / yRange - 2.0 * a_t * yMin / (yRange * yRange);
      const c = c_t + a_t * yMin * yMin / (yRange * yRange) - b_t * yMin / yRange;
      
      return [
        { a, b, c, yMin }
      ];
    };

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
        const resolutionLoc = rayTracedGl.getUniformLocation(program, 'u_resolution');
        if (resolutionLoc) {
          rayTracedGl.uniform2f(resolutionLoc, rayTracedCanvas.width, rayTracedCanvas.height);
        }
        
        // Set up bezier curve segments from control points
        const segments = createSegmentsFromControlPoints();
        const segmentData = new Float32Array(16 * 4); // MAX_SEGMENTS = 16, vec4 per segment
        for (let i = 0; i < segments.length; i++) {
          segmentData[i * 4 + 0] = segments[i].a;
          segmentData[i * 4 + 1] = segments[i].b;
          segmentData[i * 4 + 2] = segments[i].c;
          segmentData[i * 4 + 3] = segments[i].yMin;
        }
        
        // Upload segments as uniform array
        // Note: segment.w is now yMin instead of sMin
        for (let i = 0; i < 16; i++) {
          const loc = rayTracedGl.getUniformLocation(program, `u_segments[${i}]`);
          if (loc !== null) {
            rayTracedGl.uniform4f(loc, 
              segmentData[i * 4 + 0],  // a
              segmentData[i * 4 + 1],  // b
              segmentData[i * 4 + 2],  // c
              segmentData[i * 4 + 3]   // yMin
            );
          }
        }
        
        rayTracedGl.uniform1i(rayTracedGl.getUniformLocation(program, 'u_numSegments'), segments.length);
        rayTracedGl.uniform1f(rayTracedGl.getUniformLocation(program, 'u_mirrorDist'), mirrorDist);
        rayTracedGl.uniform1f(rayTracedGl.getUniformLocation(program, 'u_mirrorHalfWidth'), mirrorHalfWidth);
        rayTracedGl.uniform1f(rayTracedGl.getUniformLocation(program, 'u_mirrorHalfHeight'), mirrorHalfHeight);
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
  }, [isActive, controlZ0, controlZ1, controlZ2, controlY1Ratio, mirrorDist, mirrorRadius, mirrorHalfWidth, mirrorHalfHeight, imagePlaneDist, imageSizeX, imageSizeY, fov]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '20px' }}>
      <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap' }}>
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
      
      <MirrorVisualization
        controlZ0={controlZ0}
        controlZ1={controlZ1}
        controlZ2={controlZ2}
        controlY1Ratio={controlY1Ratio}
        mirrorDist={mirrorDist}
        mirrorHalfHeight={mirrorHalfHeight}
        imagePlaneDist={imagePlaneDist}
        imageSizeY={imageSizeY}
        videoRef={videoRef}
      />
      
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
        <button onClick={startCamera} disabled={isActive}>Start</button>
        <button onClick={stopCamera} disabled={!isActive}>Stop</button>
      </div>

      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h3>Mirror Curve Controls</h3>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          Adjust the distance from camera (Z-axis) for each control point of the curved mirror
        </p>
        
        <div style={{ 
          backgroundColor: '#f5f5f5', 
          padding: '20px', 
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          <h4 style={{ marginTop: 0 }}>Control Point Distances from Camera</h4>
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Top Control Point (Distance from Camera): {controlZ2.toFixed(3)}
            </label>
            <input 
              type="range" 
              min="-1.0" 
              max="1.0" 
              step="0.01" 
              value={controlZ2}
              onChange={(e) => setControlZ2(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
            <small style={{ color: '#666' }}>Negative = closer to camera, Positive = further away</small>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Middle Control Point (Distance from Camera): {controlZ1.toFixed(3)}
            </label>
            <input 
              type="range" 
              min="-1.0" 
              max="1.0" 
              step="0.01" 
              value={controlZ1}
              onChange={(e) => setControlZ1(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
            <small style={{ color: '#666' }}>Negative = closer to camera, Positive = further away</small>
          </div>

          <div style={{ marginBottom: '0' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Bottom Control Point (Distance from Camera): {controlZ0.toFixed(3)}
            </label>
            <input 
              type="range" 
              min="-1.0" 
              max="1.0" 
              step="0.01" 
              value={controlZ0}
              onChange={(e) => setControlZ0(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
            <small style={{ color: '#666' }}>Negative = closer to camera, Positive = further away</small>
          </div>
        </div>

        <details style={{ marginBottom: '15px' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '10px' }}>
            Additional Mirror Settings
          </summary>
          
          <div style={{ marginTop: '15px', paddingLeft: '20px' }}>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>
                Middle Point Y Position: {controlY1Ratio.toFixed(2)} (−1=bottom, 0=center, +1=top)
              </label>
              <input 
                type="range" 
                min="-1.0" 
                max="1.0" 
                step="0.05" 
                value={controlY1Ratio}
                onChange={(e) => setControlY1Ratio(parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>
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

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>
                Mirror Half-Height: {mirrorHalfHeight.toFixed(2)}
              </label>
              <input 
                type="range" 
                min="0.5" 
                max="3.0" 
                step="0.1" 
                value={mirrorHalfHeight}
                onChange={(e) => setMirrorHalfHeight(parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}