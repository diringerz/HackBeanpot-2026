/**
 * Converts Catmull-Rom splines to quadratic Bezier curve approximations
 */

/**
 * Convert a Catmull-Rom spline segment to a cubic Bezier curve
 * @param {Object} p0 - Previous control point
 * @param {Object} p1 - Start point of segment
 * @param {Object} p2 - End point of segment
 * @param {Object} p3 - Next control point
 * @returns {Object} Cubic Bezier control points {start, cp1, cp2, end}
 */
function catmullRomToCubicBezier(p0, p1, p2, p3) {
  return {
    start: { x: p1.x, y: p1.y },
    cp1: { 
      x: p1.x + (p2.x - p0.x) / 6, 
      y: p1.y + (p2.y - p0.y) / 6 
    },
    cp2: { 
      x: p2.x - (p3.x - p1.x) / 6, 
      y: p2.y - (p3.y - p1.y) / 6 
    },
    end: { x: p2.x, y: p2.y }
  };
}

/**
 * Evaluate a cubic Bezier curve at parameter t
 * @param {Object} cubic - Cubic Bezier curve {start, cp1, cp2, end}
 * @param {number} t - Parameter (0 to 1)
 * @returns {Object} Point on curve {x, y}
 */
function evaluateCubicBezier(cubic, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  
  return {
    x: mt3 * cubic.start.x + 
       3 * mt2 * t * cubic.cp1.x + 
       3 * mt * t2 * cubic.cp2.x + 
       t3 * cubic.end.x,
    y: mt3 * cubic.start.y + 
       3 * mt2 * t * cubic.cp1.y + 
       3 * mt * t2 * cubic.cp2.y + 
       t3 * cubic.end.y
  };
}

/**
 * Calculate distance between two points
 */
function distance(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Approximate a cubic Bezier curve with a single quadratic Bezier
 * Uses least-squares fitting at the midpoint
 * @param {Object} cubic - Cubic Bezier curve {start, cp1, cp2, end}
 * @returns {Object} Quadratic Bezier {start, cp, end}
 */
function cubicToQuadraticSimple(cubic) {
  // The optimal control point for a quadratic that best fits the cubic
  // is approximately at (3*cp1 + 3*cp2 - start - end) / 4
  const cp = {
    x: (3 * cubic.cp1.x + 3 * cubic.cp2.x - cubic.start.x - cubic.end.x) / 4,
    y: (3 * cubic.cp1.y + 3 * cubic.cp2.y - cubic.start.y - cubic.end.y) / 4
  };
  
  return {
    start: cubic.start,
    cp: cp,
    end: cubic.end
  };
}

/**
 * Calculate the maximum error between a cubic and quadratic approximation
 * @param {Object} cubic - Cubic Bezier curve
 * @param {Object} quadratic - Quadratic Bezier curve
 * @param {number} samples - Number of sample points to check
 * @returns {number} Maximum error distance
 */
function calculateApproximationError(cubic, quadratic, samples = 20) {
  let maxError = 0;
  
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const cubicPoint = evaluateCubicBezier(cubic, t);
    const quadPoint = evaluateQuadraticBezier(quadratic, t);
    const error = distance(cubicPoint, quadPoint);
    maxError = Math.max(maxError, error);
  }
  
  return maxError;
}

/**
 * Evaluate a quadratic Bezier curve at parameter t
 */
function evaluateQuadraticBezier(quad, t) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  
  return {
    x: mt2 * quad.start.x + 2 * mt * t * quad.cp.x + t2 * quad.end.x,
    y: mt2 * quad.start.y + 2 * mt * t * quad.cp.y + t2 * quad.end.y
  };
}

/**
 * Subdivide a cubic Bezier curve at parameter t
 * @param {Object} cubic - Cubic Bezier curve
 * @param {number} t - Parameter to subdivide at (default 0.5)
 * @returns {Array} Two cubic Bezier curves [left, right]
 */
function subdivideCubic(cubic, t = 0.5) {
  // De Casteljau's algorithm
  const p0 = cubic.start;
  const p1 = cubic.cp1;
  const p2 = cubic.cp2;
  const p3 = cubic.end;
  
  const p01 = { x: p0.x + t * (p1.x - p0.x), y: p0.y + t * (p1.y - p0.y) };
  const p12 = { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
  const p23 = { x: p2.x + t * (p3.x - p2.x), y: p2.y + t * (p3.y - p2.y) };
  
  const p012 = { x: p01.x + t * (p12.x - p01.x), y: p01.y + t * (p12.y - p01.y) };
  const p123 = { x: p12.x + t * (p23.x - p12.x), y: p12.y + t * (p23.y - p12.y) };
  
  const p0123 = { x: p012.x + t * (p123.x - p012.x), y: p012.y + t * (p123.y - p012.y) };
  
  return [
    { start: p0, cp1: p01, cp2: p012, end: p0123 },
    { start: p0123, cp1: p123, cp2: p23, end: p3 }
  ];
}

/**
 * Approximate a cubic Bezier with multiple quadratic Bezier curves
 * using adaptive subdivision based on error tolerance
 * @param {Object} cubic - Cubic Bezier curve
 * @param {number} tolerance - Maximum allowed error (default 1.0 pixel)
 * @returns {Array} Array of quadratic Bezier curves
 */
function cubicToQuadraticAdaptive(cubic, tolerance = 1.0) {
  const result = [];
  const stack = [cubic];
  
  while (stack.length > 0) {
    const currentCubic = stack.pop();
    const quad = cubicToQuadraticSimple(currentCubic);
    const error = calculateApproximationError(currentCubic, quad);
    
    if (error <= tolerance) {
      // Approximation is good enough
      result.push(quad);
    } else {
      // Subdivide and try again
      const [left, right] = subdivideCubic(currentCubic);
      // Push in reverse order so left is processed first
      stack.push(right);
      stack.push(left);
    }
  }
  
  return result;
}

/**
 * Convert an array of Catmull-Rom spline points to quadratic Bezier curves
 * @param {Array} points - Array of control points {x, y}
 * @param {number} tolerance - Maximum approximation error in pixels (default 1.0)
 * @returns {Array} Array of quadratic Bezier curves
 */
export function splineToQuadraticBezier(points, tolerance = 0.5) {
  if (points.length < 2) {
    return [];
  }
  
  const quadratics = [];
  
  // Process each Catmull-Rom segment
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    
    // Convert to cubic Bezier first
    const cubic = catmullRomToCubicBezier(p0, p1, p2, p3);
    
    // Then approximate with quadratic(s)
    const segmentQuads = cubicToQuadraticAdaptive(cubic, tolerance);
    quadratics.push(...segmentQuads);
  }
  
  return quadratics;
}

/**
 * Convert quadratic Bezier curves to SVG path string
 * @param {Array} quadratics - Array of quadratic Bezier curves
 * @returns {string} SVG path data
 */
export function quadraticBezierToSVGPath(quadratics) {
  if (quadratics.length === 0) {
    return '';
  }
  
  let path = `M ${quadratics[0].start.x} ${quadratics[0].start.y}`;
  
  for (const quad of quadratics) {
    path += ` Q ${quad.cp.x} ${quad.cp.y} ${quad.end.x} ${quad.end.y}`;
  }
  
  return path;
}

/**
 * Get statistics about the conversion
 * @param {Array} points - Original spline points
 * @param {Array} quadratics - Resulting quadratic curves
 * @returns {Object} Statistics
 */
export function getConversionStats(points, quadratics) {
  const originalSegments = points.length - 1;
  const quadraticSegments = quadratics.length;
  const ratio = quadraticSegments / Math.max(1, originalSegments);
  
  return {
    originalSegments,
    quadraticSegments,
    averageQuadsPerSegment: ratio.toFixed(2),
    compressionRatio: (100 / ratio).toFixed(1) + '%'
  };
}
