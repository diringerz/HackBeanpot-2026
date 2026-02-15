import { useRef, useEffect } from 'react';
import vertexShaderSource from './shaders/curved_mirror_vertex.glsl?raw';
import fragmentShaderSource from './shaders/square_mirror_fragment_asym.glsl?raw';

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
  const canvasRef = useRef(null);
  const glRef = useRef(null);
  const textureRef = useRef(null);
  const shaderProgramRef = useRef(null);

  // Initialize WebGL and shaders
  useEffect(() => {
    const canvas = canvasRef.current;
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

    console.log('WebGL initialized for ray-traced mirror');
  }, []);

  // Render loop
  useEffect(() => {
    const video = videoRef?.current;
    const gl = glRef.current;
    const canvas = canvasRef.current;
    const texture = textureRef.current;
    const program = shaderProgramRef.current;

    if (!video || !gl || !canvas || !texture || !program) return;

    // Convert Bézier control points to polynomial coefficients for piecewise curve
    const createSegmentsFromControlPoints = () => {
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
      return curveSegments.map(seg => 
        bezierToPolynomial(seg.yMin, seg.yMax, seg.z0, seg.z1, seg.z2)
      );
    };

    let animationFrameId;
    
    const render = () => {
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      // Only resize canvas if dimensions changed
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, canvas.width, canvas.height);
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
      
      // Set uniforms
      const resolutionLoc = gl.getUniformLocation(program, 'u_resolution');
      if (resolutionLoc) {
        gl.uniform2f(resolutionLoc, canvas.width, canvas.height);
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
      
      gl.uniform1i(gl.getUniformLocation(program, 'u_numSegments'), segments.length);
      gl.uniform1f(gl.getUniformLocation(program, 'u_mirrorDist'), mirrorDist);
      gl.uniform1f(gl.getUniformLocation(program, 'u_mirrorHalfWidth'), mirrorHalfWidth);
      gl.uniform1f(gl.getUniformLocation(program, 'u_mirrorHalfHeight'), mirrorHalfHeight);
      gl.uniform1f(gl.getUniformLocation(program, 'u_imagePlaneDist'), imagePlaneDist);
      gl.uniform2f(gl.getUniformLocation(program, 'u_imageSize'), imageSizeX, imageSizeY);
      gl.uniform1f(gl.getUniformLocation(program, 'u_fov'), fov);
      
      // Bind webcam texture
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(gl.getUniformLocation(program, 'u_webcamTex'), 0);
      
      // Clear and draw
      gl.clearColor(0.0, 0.0, 0.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      animationFrameId = requestAnimationFrame(render);
    };
    
    render();
    
    return () => {
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
      style={{ border: '2px solid #ccc', borderRadius: '8px' }}
    />
  );
}
