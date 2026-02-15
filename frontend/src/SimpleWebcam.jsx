import React, { useRef, useState, useEffect } from 'react';
import MirrorVisualization from './MirrorVisualization';
import RayTracedMirror from './RayTracedMirror';

export default function SimpleWebcam() {
  const videoRef = useRef(null);
  const glCanvasRef = useRef(null);
  const [isActive, setIsActive] = useState(false);
  const glRef = useRef(null);
  const textureRef = useRef(null);

  // Mirror parameters (state)
  // Piecewise Quadratic Bézier control points in y-space
  
  // Bottom segment: y ∈ [-mirrorHalfHeight, 0]
  const [bottomZ0, setBottomZ0] = useState(-0.3);       // z-depth at bottom edge (y = -mirrorHalfHeight)
  const [bottomZ1, setBottomZ1] = useState(-0.6);       // z-depth of bottom segment control point
  const [bottomZ2, setBottomZ2] = useState(-0.3);       // z-depth at center (y = 0)
  
  // Top segment: y ∈ [0, +mirrorHalfHeight]
  const [topZ0, setTopZ0] = useState(-0.3);             // z-depth at center (y = 0)
  const [topZ1, setTopZ1] = useState(-0.6);             // z-depth of top segment control point
  const [topZ2, setTopZ2] = useState(-0.3);             // z-depth at top edge (y = +mirrorHalfHeight)
  
  const [mirrorDist, setMirrorDist] = useState(2.0);  // distance from camera
  const [mirrorRadius, setMirrorRadius] = useState(1.5); // mirror radius (used for display)
  const [mirrorHalfWidth, setMirrorHalfWidth] = useState(2.0); // rectangular mirror half-width
  const [mirrorHalfHeight, setMirrorHalfHeight] = useState(1.5); // rectangular mirror half-height
  const [imagePlaneDist, setImagePlaneDist] = useState(0.5); // image plane distance
  const [imageSizeX, setImageSizeX] = useState(8.0);  // image size X (5x larger)
  const [imageSizeY, setImageSizeY] = useState(6.0);  // image size Y (5x larger)
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
    
    if (!gl || !texture || !video) return;

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
  }, [isActive]);

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
          <RayTracedMirror
            videoRef={videoRef}
            curveSegments={[
              { yMin: -mirrorHalfHeight, yMax: 0, z0: bottomZ0, z1: bottomZ1, z2: bottomZ2 },
              { yMin: 0, yMax: mirrorHalfHeight, z0: topZ0, z1: topZ1, z2: topZ2 }
            ]}
            mirrorDist={mirrorDist}
            mirrorHalfWidth={mirrorHalfWidth}
            mirrorHalfHeight={mirrorHalfHeight}
            imagePlaneDist={imagePlaneDist}
            imageSizeX={imageSizeX}
            imageSizeY={imageSizeY}
            fov={fov}
            width={640}
            height={480}
          />
        </div>
      </div>
      
      <MirrorVisualization
        curveSegments={[
          { yMin: -mirrorHalfHeight, yMax: 0, z0: bottomZ0, z1: bottomZ1, z2: bottomZ2 },
          { yMin: 0, yMax: mirrorHalfHeight, z0: topZ0, z1: topZ1, z2: topZ2 }
        ]}
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
        <h3>Piecewise Mirror Curve Controls</h3>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          The mirror is split into two segments (bottom and top), each with its own quadratic Bezier curve
        </p>
        
        {/* Top Segment Controls */}
        <div style={{ 
          backgroundColor: '#e8f4f8', 
          padding: '20px', 
          borderRadius: '8px',
          marginBottom: '15px',
          border: '2px solid #4a90e2'
        }}>
          <h4 style={{ marginTop: 0, color: '#2c5aa0' }}>Top Segment (y = 0 to +{mirrorHalfHeight.toFixed(1)})</h4>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Top Edge Point (Distance from Camera): {topZ2.toFixed(3)}
            </label>
            <input 
              type="range" 
              min="-1.0" 
              max="1.0" 
              step="0.01" 
              value={topZ2}
              onChange={(e) => setTopZ2(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
            <small style={{ color: '#666' }}>Negative = closer to camera, Positive = further away</small>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Top Segment Control Point (Distance from Camera): {topZ1.toFixed(3)}
            </label>
            <input 
              type="range" 
              min="-1.0" 
              max="1.0" 
              step="0.01" 
              value={topZ1}
              onChange={(e) => setTopZ1(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
            <small style={{ color: '#666' }}>Controls the curvature of the top segment</small>
          </div>

          <div style={{ marginBottom: '0' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Center Point (Distance from Camera): {topZ0.toFixed(3)}
            </label>
            <input 
              type="range" 
              min="-1.0" 
              max="1.0" 
              step="0.01" 
              value={topZ0}
              onChange={(e) => {
                setTopZ0(parseFloat(e.target.value));
                setBottomZ2(parseFloat(e.target.value)); // Keep center continuous
              }}
              style={{ width: '100%' }}
            />
            <small style={{ color: '#666' }}>Shared between top and bottom segments (y = 0)</small>
          </div>
        </div>

        {/* Bottom Segment Controls */}
        <div style={{ 
          backgroundColor: '#f8e8e8', 
          padding: '20px', 
          borderRadius: '8px',
          marginBottom: '20px',
          border: '2px solid #e24a4a'
        }}>
          <h4 style={{ marginTop: 0, color: '#a02c2c' }}>Bottom Segment (y = -{mirrorHalfHeight.toFixed(1)} to 0)</h4>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Center Point (Distance from Camera): {bottomZ2.toFixed(3)}
            </label>
            <input 
              type="range" 
              min="-1.0" 
              max="1.0" 
              step="0.01" 
              value={bottomZ2}
              onChange={(e) => {
                setBottomZ2(parseFloat(e.target.value));
                setTopZ0(parseFloat(e.target.value)); // Keep center continuous
              }}
              style={{ width: '100%' }}
            />
            <small style={{ color: '#666' }}>Shared between top and bottom segments (y = 0)</small>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Bottom Segment Control Point (Distance from Camera): {bottomZ1.toFixed(3)}
            </label>
            <input 
              type="range" 
              min="-1.0" 
              max="1.0" 
              step="0.01" 
              value={bottomZ1}
              onChange={(e) => setBottomZ1(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
            <small style={{ color: '#666' }}>Controls the curvature of the bottom segment</small>
          </div>

          <div style={{ marginBottom: '0' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Bottom Edge Point (Distance from Camera): {bottomZ0.toFixed(3)}
            </label>
            <input 
              type="range" 
              min="-1.0" 
              max="1.0" 
              step="0.01" 
              value={bottomZ0}
              onChange={(e) => setBottomZ0(parseFloat(e.target.value))}
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

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>
                Field of View (FOV): {(fov * 180 / Math.PI).toFixed(1)}°
              </label>
              <input 
                type="range" 
                min={Math.PI / 6} 
                max={2 * Math.PI / 3} 
                step="0.01" 
                value={fov}
                onChange={(e) => setFov(parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
              <small style={{ color: '#666' }}>Range: 30° to 120°</small>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}