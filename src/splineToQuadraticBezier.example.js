/**
 * Example usage of splineToQuadraticBezier converter
 */

import { 
  splineToQuadraticBezier, 
  quadraticBezierToSVGPath,
  getConversionStats 
} from './splineToQuadraticBezier.js';

// Example: Convert mirror curve points to quadratic Bezier curves

// Mirror control points (same format as MirrorCurveDesigner)
const mirrorPoints = [
  { x: 400, y: 50 },   // Top
  { x: 350, y: 150 },  // Control point 1
  { x: 380, y: 250 },  // Control point 2
  { x: 400, y: 300 },  // Middle point
  { x: 380, y: 350 },  // Reflected control point 2
  { x: 350, y: 450 },  // Reflected control point 1
  { x: 400, y: 550 }   // Bottom
];

// Convert with default tolerance (1 pixel)
console.log('=== Default Tolerance (1.0 pixel) ===');
const quadratics = splineToQuadraticBezier(mirrorPoints, 1.0);
console.log('Quadratic curves:', quadratics);
console.log('Stats:', getConversionStats(mirrorPoints, quadratics));

// Convert with tighter tolerance (0.5 pixels) - more curves, better accuracy
console.log('\n=== Tight Tolerance (0.5 pixels) ===');
const quadraticsTight = splineToQuadraticBezier(mirrorPoints, 0.5);
console.log('Stats:', getConversionStats(mirrorPoints, quadraticsTight));

// Convert with loose tolerance (2 pixels) - fewer curves, faster
console.log('\n=== Loose Tolerance (2.0 pixels) ===');
const quadraticsLoose = splineToQuadraticBezier(mirrorPoints, 2.0);
console.log('Stats:', getConversionStats(mirrorPoints, quadraticsLoose));

// Generate SVG path
const svgPath = quadraticBezierToSVGPath(quadratics);
console.log('\n=== SVG Path ===');
console.log(svgPath);

// Example: Draw to canvas
function drawQuadraticCurvesToCanvas(canvas, quadratics) {
  const ctx = canvas.getContext('2d');
  
  ctx.beginPath();
  if (quadratics.length > 0) {
    ctx.moveTo(quadratics[0].start.x, quadratics[0].start.y);
    
    for (const quad of quadratics) {
      ctx.quadraticCurveTo(
        quad.cp.x, quad.cp.y,
        quad.end.x, quad.end.y
      );
    }
  }
  
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Optional: Draw control points for visualization
  ctx.fillStyle = 'red';
  for (const quad of quadratics) {
    ctx.beginPath();
    ctx.arc(quad.cp.x, quad.cp.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Example integration with MirrorCurveDesigner
export function exportMirrorAsQuadraticBezier(designerPoints, middlePoint) {
  const LINE_MIDDLE = 300;
  
  // Build full mirror curve (same as MirrorCurveDesigner)
  const reflected = [...designerPoints].reverse().map(p => ({ 
    x: p.x, 
    y: LINE_MIDDLE + (LINE_MIDDLE - p.y) 
  }));
  
  const allPoints = [
    { x: 400, y: 50 },  // Top
    ...designerPoints,
    middlePoint,
    ...reflected,
    { x: 400, y: 550 }  // Bottom
  ];
  
  // Convert to quadratic Bezier
  const quadratics = splineToQuadraticBezier(allPoints, 1.0);
  
  return {
    curves: quadratics,
    svgPath: quadraticBezierToSVGPath(quadratics),
    stats: getConversionStats(allPoints, quadratics)
  };
}
