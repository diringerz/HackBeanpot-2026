import { useRef, useEffect } from 'react';
import vertexShaderSource from './shaders/curved_mirror_vertex.glsl?raw';
import fragmentShaderSource from './shaders/square_mirror_fragment_asym.glsl?raw';

const BACKGROUND_COLOR = [1.0, 1.0, 1.0];

export default function RayTracedMirror({
  videoRef,
  curveSegments, // Array of { yMin, yMax, z0, z1, z2 }
  mirrorDist,
  mirrorHalfWidth,
  mirrorHalfHeight,
  imagePlaneDist,
  imageSizeX,
  imageSizeY,
  fov,
  width = 640,
  height = 480
}) {
  console.log('[RayTracedMirror] Component rendering/mounting with props:', {
    hasVideoRef: !!videoRef,
    numCurveSegments: curveSegments?.length,
    mirrorDist, mirrorHalfWidth, mirrorHalfHeight,
    width, height
  });
  
  const canvasRef = useRef(null);
  const glRef = useRef(null);
  const textureRef = useRef(null);
  const shaderProgramRef = useRef(null);

  // Initialize WebGL and shaders
  useEffect(() => {
    console.log('[RayTracedMirror] Starting WebGL initialization');
    const canvas = canvasRef.current;
    if (!canvas) {
      console.error('[RayTracedMirror] Canvas ref is null');
      return;
    }
    console.log('[RayTracedMirror] Canvas found:', canvas.width, 'x', canvas.height);

    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    });

    if (!gl) {
      console.error('[RayTracedMirror] WebGL2 not supported, trying WebGL1');
      const gl1 = canvas.getContext('webgl');
      if (!gl1) {
        console.error('[RayTracedMirror] WebGL not supported at all');
        return;
      }
    }

    console.log('[RayTracedMirror] WebGL context obtained');
    glRef.current = gl;

    // Create texture to hold the webcam input for ray tracing
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    textureRef.current = texture;

    // Compile shaders
    console.log('[RayTracedMirror] Compiling vertex shader, source length:', vertexShaderSource?.length);
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexShaderSource);
    gl.compileShader(vertexShader);
    
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      console.error('[RayTracedMirror] Vertex shader compilation error:', gl.getShaderInfoLog(vertexShader));
      return;
    }
    console.log('[RayTracedMirror] Vertex shader compiled successfully');

    console.log('[RayTracedMirror] Compiling fragment shader, source length:', fragmentShaderSource?.length);
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentShaderSource);
    gl.compileShader(fragmentShader);
    
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      console.error('[RayTracedMirror] Fragment shader compilation error:', gl.getShaderInfoLog(fragmentShader));
      return;
    }
    console.log('[RayTracedMirror] Fragment shader compiled successfully');

    // Create program
    console.log('[RayTracedMirror] Linking shader program');
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[RayTracedMirror] Shader program link error:', gl.getProgramInfoLog(program));
      return;
    }
    console.log('[RayTracedMirror] Shader program linked successfully');

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

    console.log('[RayTracedMirror] ✓ WebGL initialization complete');
  }, []);

  // Render loop
  useEffect(() => {
    console.log('[RayTracedMirror] Render loop effect triggered');
    const video = videoRef?.current;
    const gl = glRef.current;
    const canvas = canvasRef.current;
    const texture = textureRef.current;
    const program = shaderProgramRef.current;

    console.log('[RayTracedMirror] Render refs check:', {
      hasVideo: !!video,
      hasGL: !!gl,
      hasCanvas: !!canvas,
      hasTexture: !!texture,
      hasProgram: !!program,
      videoReady: video?.readyState,
      videoWidth: video?.videoWidth,
      videoHeight: video?.videoHeight
    });

    if (!video || !gl || !canvas || !texture || !program) {
      console.warn('[RayTracedMirror] Missing required refs, cannot start render loop');
      return;
    }

    // Convert Bézier control points to polynomial coefficients for piecewise curve
    const createSegmentsFromControlPoints = () => {
      console.log('[RayTracedMirror] Converting curve segments:', curveSegments);
      // Helper function to convert a single Bezier segment to polynomial coefficients
      const bezierToPolynomial = (yMin, yMax, z0, z1, z2) => {
        const yRange = yMax - yMin;
        
        if (yRange === 0.0) {
          return { a: 0, b: 0, c: z0, yMin };
        }
        
        // Quadratic Bézier parametric form: B(t) = (1-t)²·P₀ + 2(1-t)t·P₁ + t²·P₂, t ∈ [0,1]
        // where t = (y - yMin) / yRange
        
        // Bézier coefficients in t-space:
        // z(t) = a_t·t² + b_t·t + c_t
        const a_t = z0 - 2.0 * z1 + z2;
        const b_t = 2.0 * (z1 - z0);
        const c_t = z0;
        
        // Convert to polynomial in y-space: z(y) = a·y² + b·y + c
        // by substituting t = (y - yMin) / yRange and expanding
        const a = a_t / (yRange * yRange);
        const b = b_t / yRange - 2.0 * a_t * yMin / (yRange * yRange);
        const c = c_t + a_t * yMin * yMin / (yRange * yRange) - b_t * yMin / yRange;
        
        return { a, b, c, yMin };
      };
      
      // Convert all curve segments from Bezier to polynomial form
      const result = curveSegments.map(seg => 
        bezierToPolynomial(seg.yMin, seg.yMax, seg.z0, seg.z1, seg.z2)
      );
      console.log('[RayTracedMirror] Converted segments:', result);
      return result;
    };

    let animationFrameId;
    let frameCount = 0;
    
    const render = () => {
      frameCount++;
      if (frameCount === 1 || frameCount % 60 === 0) {
        console.log('[RayTracedMirror] Render frame', frameCount, 'video:', video.videoWidth, 'x', video.videoHeight);
      }
      
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        if (frameCount < 5) {
          console.log('[RayTracedMirror] Video not ready yet, waiting...');
        }
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      // Only resize canvas if dimensions changed
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, canvas.width, canvas.height);
        console.log('[RayTracedMirror] Canvas resized to', width, 'x', height);
      }

      // Upload webcam frame to texture
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

      gl.useProgram(program);
      
      // Set up vertex attributes
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.positionBuffer);
      const aPosition = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
      
      if (frameCount === 1) {
        console.log('[RayTracedMirror] Attribute location a_position:', aPosition);
      }
      
      // Set uniforms
      const resolutionLoc = gl.getUniformLocation(program, 'u_resolution');
      if (resolutionLoc) {
        gl.uniform2f(resolutionLoc, canvas.width, canvas.height);
      }
      
      if (frameCount === 1) {
        console.log('[RayTracedMirror] Setting uniforms - resolution:', canvas.width, canvas.height);
        console.log('[RayTracedMirror] Mirror parameters:', {
          mirrorDist, mirrorHalfWidth, mirrorHalfHeight,
          imagePlaneDist, imageSizeX, imageSizeY, fov
        });
      }
      
      // Set up bezier curve segments from control points
      const segments = createSegmentsFromControlPoints();
      
      if (frameCount === 1) {
        console.log('[RayTracedMirror] Polynomial segments for shader:', segments);
        console.log('[RayTracedMirror] Number of segments:', segments.length);
        if (segments.length > 16) {
          console.warn('[RayTracedMirror] WARNING: Too many segments! Shader supports max 16, got', segments.length, '- truncating');
        }
      }
      
      // Limit to 16 segments (shader MAX_SEGMENTS)
      const limitedSegments = segments.slice(0, 16);
      
      const segmentData = new Float32Array(16 * 4); // MAX_SEGMENTS = 16, vec4 per segment
      for (let i = 0; i < limitedSegments.length; i++) {
        segmentData[i * 4 + 0] = limitedSegments[i].a;
        segmentData[i * 4 + 1] = limitedSegments[i].b;
        segmentData[i * 4 + 2] = limitedSegments[i].c;
        segmentData[i * 4 + 3] = limitedSegments[i].yMin;
      }
      
      // Upload segments as uniform array
      for (let i = 0; i < 16; i++) {
        const loc = gl.getUniformLocation(program, `u_segments[${i}]`);
        if (loc !== null) {
          gl.uniform4f(loc, 
            segmentData[i * 4 + 0],  // a
            segmentData[i * 4 + 1],  // b
            segmentData[i * 4 + 2],  // c
            segmentData[i * 4 + 3]   // yMin
          );
        }
      }
      
      gl.uniform1i(gl.getUniformLocation(program, 'u_numSegments'), limitedSegments.length);
      gl.uniform1f(gl.getUniformLocation(program, 'u_mirrorDist'), mirrorDist);
      gl.uniform1f(gl.getUniformLocation(program, 'u_mirrorHalfWidth'), mirrorHalfWidth);
      gl.uniform1f(gl.getUniformLocation(program, 'u_mirrorHalfHeight'), mirrorHalfHeight);
      gl.uniform1f(gl.getUniformLocation(program, 'u_imagePlaneDist'), imagePlaneDist);
      gl.uniform2f(gl.getUniformLocation(program, 'u_imageSize'), imageSizeX, imageSizeY);
      gl.uniform1f(gl.getUniformLocation(program, 'u_fov'), fov * Math.PI / 180.0);
      gl.uniform3f(gl.getUniformLocation(program, 'u_backgroundColor'), ...BACKGROUND_COLOR);
      
      // Bind webcam texture
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(gl.getUniformLocation(program, 'u_webcamTex'), 0);
      
      // Clear and draw
      gl.clearColor(...BACKGROUND_COLOR, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      
      if (frameCount === 1) {
        console.log('[RayTracedMirror] \u2713 First frame drawn');
        // Check for any GL errors
        const err = gl.getError();
        if (err !== gl.NO_ERROR) {
          console.error('[RayTracedMirror] WebGL error after draw:', err);
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };
    
    console.log('[RayTracedMirror] Starting render loop...');
    render();
    
    return () => {
      console.log('[RayTracedMirror] Stopping render loop');
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [videoRef, curveSegments, mirrorDist, mirrorHalfWidth, mirrorHalfHeight, imagePlaneDist, imageSizeX, imageSizeY, fov, width, height]);

  return (
    <canvas 
      ref={canvasRef} 
      width={width} 
      height={height}
      className="w-full h-auto max-h-full object-contain rounded-lg"
      style={{ border: '2px solid #ccc' }}
    />
  );
}
