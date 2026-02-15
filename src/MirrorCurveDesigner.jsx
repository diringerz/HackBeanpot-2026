import React, { useRef, useState, useEffect } from 'react';
import { splineToQuadraticBezier } from './splineToQuadraticBezier.js';

export default function MirrorDesigner({ onCurveChange }) {
  const canvasRef = useRef(null);
  const [points, setPoints] = useState([]);
  const [middlePoint, setMiddlePoint] = useState({ x: 400, y: 300 });
  const [draggingMiddle, setDraggingMiddle] = useState(false);
  const [draggingPoint, setDraggingPoint] = useState(null);

  const WIDTH = 800;
  const HEIGHT = 600;
  const LINE_X = 400;
  const LINE_TOP = 50;
  const LINE_BOTTOM = 550;
  const LINE_MIDDLE = 300;

  const MIN_DISTANCE_FROM_AXIS = 50;
  const MIN_VERTICAL_SPACING = 50;
  const MIN_DISTANCE_FROM_VERTICAL = 30;
  const MAX_Y_POSITION = LINE_TOP + 50;
  const MAX_LEFT_DISTANCE = 200;

  // Helper function to get scaled coordinates
  const getCanvasCoordinates = (e) => {
    const canvas = canvasRef.current;
    const r = canvas.getBoundingClientRect();
    
    // Calculate the actual rendered size accounting for object-contain
    const canvasAspect = WIDTH / HEIGHT;
    const containerAspect = r.width / r.height;
    
    let renderWidth, renderHeight, offsetX, offsetY;
    
    if (containerAspect > canvasAspect) {
      // Container is wider - canvas is limited by height
      renderHeight = r.height;
      renderWidth = renderHeight * canvasAspect;
      offsetX = (r.width - renderWidth) / 2;
      offsetY = 0;
    } else {
      // Container is taller - canvas is limited by width
      renderWidth = r.width;
      renderHeight = renderWidth / canvasAspect;
      offsetX = 0;
      offsetY = (r.height - renderHeight) / 2;
    }
    
    const scaleX = WIDTH / renderWidth;
    const scaleY = HEIGHT / renderHeight;
    
    return {
      x: (e.clientX - r.left - offsetX) * scaleX,
      y: (e.clientY - r.top - offsetY) * scaleY
    };
  };

  useEffect(() => {
    draw();
    exportData();
  }, [points, middlePoint]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Clear canvas to transparent
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Dashed horizontal axis - silver/mirror colors
    ctx.setLineDash([10, 10]);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, LINE_MIDDLE);
    ctx.lineTo(LINE_X, LINE_MIDDLE);
    ctx.stroke();
    ctx.setLineDash([]);

    // Main vertical line - chrome/silver gradient
    const verticalGradient = ctx.createLinearGradient(LINE_X - 5, 0, LINE_X + 5, 0);
    verticalGradient.addColorStop(0, '#475569');
    verticalGradient.addColorStop(0.5, '#cbd5e1');
    verticalGradient.addColorStop(1, '#475569');
    ctx.strokeStyle = verticalGradient;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(LINE_X, LINE_TOP);
    ctx.lineTo(LINE_X, LINE_BOTTOM);
    ctx.stroke();

    // Subtle glow effect on the vertical line
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#cbd5e1';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(LINE_X, LINE_TOP);
    ctx.lineTo(LINE_X, LINE_BOTTOM);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Middle point - chrome diamond
    ctx.save();
    ctx.translate(middlePoint.x, LINE_MIDDLE);
    
    // Diamond glow
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#94a3b8';
    
    // Draw diamond
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(8, 0);
    ctx.lineTo(0, 10);
    ctx.lineTo(-8, 0);
    ctx.closePath();
    ctx.fill();
    
    // Inner diamond highlight
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(4, 0);
    ctx.lineTo(0, 5);
    ctx.lineTo(-4, 0);
    ctx.closePath();
    ctx.fill();
    
    ctx.restore();
    ctx.shadowBlur = 0;

    if (points.length === 0) {
      // Default to regular mirror - silver gradient
      const mirrorGradient = ctx.createLinearGradient(LINE_X - 3, 0, LINE_X + 3, 0);
      mirrorGradient.addColorStop(0, '#64748b');
      mirrorGradient.addColorStop(0.5, '#94a3b8');
      mirrorGradient.addColorStop(1, '#64748b');
      ctx.strokeStyle = mirrorGradient;
      ctx.lineWidth = 6;
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(LINE_X, LINE_TOP);
      ctx.lineTo(LINE_X, LINE_BOTTOM);
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else {
      const reflected = [...points].reverse().map(p => ({ 
        x: p.x, 
        y: LINE_MIDDLE + (LINE_MIDDLE - p.y) 
      }));
      
      const all = [
        { x: LINE_X, y: LINE_TOP },
        ...points,
        middlePoint,
        ...reflected,
        { x: LINE_X, y: LINE_BOTTOM }
      ];
      
      // Draw the mirror curve with chrome/silver gradient and glow
      const curveGradient = ctx.createLinearGradient(0, LINE_TOP, 0, LINE_BOTTOM);
      curveGradient.addColorStop(0, '#475569');
      curveGradient.addColorStop(0.5, '#64748b');
      curveGradient.addColorStop(1, '#475569');
      ctx.strokeStyle = curveGradient;
      ctx.lineWidth = 6;
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#94a3b8';
      ctx.beginPath();
      
      for (let i = 0; i <= 100; i++) {
        const t = i / 100;
        const p = spline(all, t);
        if (i === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }
      
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw quadratic Bezier approximation overlay
      if (all.length > 1) {
        const quadratics = splineToQuadraticBezier(all, 0.25);
        
        // Draw the quadratic curves in semi-transparent orange/amber
        ctx.strokeStyle = 'rgba(251, 146, 60, 0.7)'; // Orange-400
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]);
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(251, 146, 60, 0.5)';
        ctx.beginPath();
        
        if (quadratics.length > 0) {
          ctx.moveTo(quadratics[0].start.x, quadratics[0].start.y);
          for (const quad of quadratics) {
            ctx.quadraticCurveTo(quad.cp.x, quad.cp.y, quad.end.x, quad.end.y);
          }
        }
        
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
        
        // Draw quadratic control points as small orange dots
        ctx.fillStyle = 'rgba(251, 146, 60, 0.6)';
        for (const quad of quadratics) {
          ctx.beginPath();
          ctx.arc(quad.cp.x, quad.cp.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw control points as chrome spheres
      points.forEach((p) => {
        // Subtle connection line
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, p.y + 15);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Chrome sphere
        const gradient = ctx.createRadialGradient(p.x - 3, p.y - 3, 2, p.x, p.y, 10);
        gradient.addColorStop(0, '#f8fafc');
        gradient.addColorStop(0.5, '#cbd5e1');
        gradient.addColorStop(1, '#64748b');
        ctx.fillStyle = gradient;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#94a3b8';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        ctx.fill();
        
        // Highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(p.x - 3, p.y - 3, 3, 0, Math.PI * 2);
        ctx.fill();
      });
      
      // Reflected points - ghost spheres
      reflected.forEach(p => {
        const gradient = ctx.createRadialGradient(p.x - 2, p.y - 2, 1, p.x, p.y, 8);
        gradient.addColorStop(0, 'rgba(226, 232, 240, 0.5)');
        gradient.addColorStop(1, 'rgba(148, 163, 184, 0.3)');
        ctx.fillStyle = gradient;
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }
  };

  const spline = (pts, t) => {
    const n = pts.length - 1;
    const scaled = t * n;
    const i = Math.floor(scaled);
    const lt = scaled - i;
    
    if (i >= n) return pts[n];
    
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[Math.min(n, i + 1)];
    const p3 = pts[Math.min(n, i + 2)];
    
    const t2 = lt * lt;
    const t3 = t2 * lt;
    
    return {
      x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * lt + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * lt + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
    };
  };

  const exportData = () => {
    const reflected = points.length > 0 ? 
      [...points].reverse().map(p => ({ x: p.x, y: LINE_MIDDLE + (LINE_MIDDLE - p.y) })) : 
      [];
    
    const all = points.length > 0 ?
      [{ x: LINE_X, y: LINE_TOP }, ...points, middlePoint, ...reflected, { x: LINE_X, y: LINE_BOTTOM }] :
      [{ x: LINE_X, y: LINE_TOP }, { x: LINE_X, y: LINE_BOTTOM }];
    
    // Generate quadratic Bezier curves from the spline
    const quadraticBeziers = all.length > 1 ? splineToQuadraticBezier(all, 1.0) : [];
    
    const samples = [];
    for (let i = 0; i <= 30; i++) {
      if (points.length === 0) {
        // Linear interpolation for default mirror
        const t = i / 30;
        samples.push({ x: LINE_X, y: LINE_TOP + t * (LINE_BOTTOM - LINE_TOP) });
      } else {
        samples.push(spline(all, i / 30));
      }
    }
    
    const segs = [];
    for (let i = 0; i < samples.length - 1; i++) {
      segs.push({ x1: samples[i].x, y1: samples[i].y, x2: samples[i + 1].x, y2: samples[i + 1].y });
    }

    if (onCurveChange) {
      onCurveChange({
        points,
        middlePoint,
        lineSegments: segs,
        quadraticBeziers, // Add the Bezier curves
        bounds: { x: LINE_X, yTop: LINE_TOP, yMiddle: LINE_MIDDLE, yBottom: LINE_BOTTOM }
      });
    }
  };

  const handleClick = (e) => {
    console.log('Click - points:', points.length);
    if (points.length >= 2) {
      console.log('Blocked - max points');
      return;
    }
    
    const { x, y } = getCanvasCoordinates(e);
    
    console.log('Click at:', x, y);
    
    if (x >= LINE_X) {
      console.log('Blocked - right of line');
      return;
    }
    
    // Enforce maximum left distance
    if (LINE_X - x > MAX_LEFT_DISTANCE) {
      console.log('BLOCKED - too far left');
      return;
    }
    
    if (y < LINE_TOP || y > LINE_MIDDLE) {
      console.log('Blocked - out of bounds');
      return;
    }
    
    // Must not be too close to vertical line
    const distFromVertical = LINE_X - x;
    if (distFromVertical < MIN_DISTANCE_FROM_VERTICAL) {
      console.log('BLOCKED - too close to vertical line');
      return;
    }
    
    // Must not be too high (prevents upward curve)
    if (y < MAX_Y_POSITION) {
      console.log('BLOCKED - too high, would cause upward curve');
      return;
    }
    
    // Must be far enough from axis of symmetry
    if (Math.abs(y - LINE_MIDDLE) < MIN_DISTANCE_FROM_AXIS) {
      console.log('BLOCKED - too close to horizontal axis');
      return;
    }
    
    // Check vertical spacing from existing points
    const hasVerticalConflict = points.some(p => Math.abs(p.y - y) < MIN_VERTICAL_SPACING);
    if (hasVerticalConflict) {
      console.log('BLOCKED - insufficient vertical spacing');
      return;
    }
    
    console.log('Adding point');
    setPoints([...points, { x, y }].sort((a, b) => a.y - b.y));
  };

  const handleMouseDown = (e) => {
    const { x, y } = getCanvasCoordinates(e);
    
    if (Math.sqrt((middlePoint.x - x) ** 2 + (LINE_MIDDLE - y) ** 2) < 12) {
      setDraggingMiddle(true);
      return;
    }
    const i = points.findIndex(p => Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2) < 12);
    if (i !== -1) setDraggingPoint(i);
  };

  const handleMouseMove = (e) => {
    if (draggingMiddle) {
      const { x } = getCanvasCoordinates(e);
      let clampedX = Math.max(0, Math.min(LINE_X, x));
      
      // Enforce maximum left distance for middle point
      if (LINE_X - clampedX > MAX_LEFT_DISTANCE) {
        clampedX = LINE_X - MAX_LEFT_DISTANCE;
      }
      
      // Enforce minimum distance from vertical line for middle point
      if (LINE_X - clampedX < MIN_DISTANCE_FROM_VERTICAL) {
        clampedX = LINE_X - MIN_DISTANCE_FROM_VERTICAL;
      }
      
      setMiddlePoint({ x: clampedX, y: LINE_MIDDLE });
    } else if (draggingPoint !== null) {
      const { x, y } = getCanvasCoordinates(e);
      
      let clampedX = Math.max(0, Math.min(LINE_X - 1, x));
      let clampedY = Math.max(LINE_TOP, Math.min(LINE_MIDDLE, y));
      
      // Enforce maximum left distance
      if (LINE_X - clampedX > MAX_LEFT_DISTANCE) {
        clampedX = LINE_X - MAX_LEFT_DISTANCE;
      }
      
      // Enforce minimum distance from vertical line
      if (LINE_X - clampedX < MIN_DISTANCE_FROM_VERTICAL) {
        clampedX = LINE_X - MIN_DISTANCE_FROM_VERTICAL;
      }
      
      // Enforce minimum distance from horizontal axis
      if (Math.abs(clampedY - LINE_MIDDLE) < MIN_DISTANCE_FROM_AXIS) {
        clampedY = LINE_MIDDLE - MIN_DISTANCE_FROM_AXIS;
      }
      
      // Enforce maximum height
      if (clampedY < MAX_Y_POSITION) {
        clampedY = MAX_Y_POSITION;
      }
      
      const newPoints = [...points];
      newPoints[draggingPoint] = { x: clampedX, y: clampedY };
      const sorted = newPoints.sort((a, b) => a.y - b.y);
      
      // Check vertical spacing constraint
      let valid = true;
      for (let i = 0; i < sorted.length - 1; i++) {
        if (Math.abs(sorted[i].y - sorted[i+1].y) < MIN_VERTICAL_SPACING) {
          valid = false;
          break;
        }
      }
      
      if (valid) {
        setPoints(sorted);
      }
    }
  };

  const handleMouseUp = () => {
    setDraggingMiddle(false);
    setDraggingPoint(null);
  };

  const handleRightClick = (e) => {
    e.preventDefault();
    const { x, y } = getCanvasCoordinates(e);
    const i = points.findIndex(p => Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2) < 12);
    if (i !== -1) setPoints(points.filter((_, j) => j !== i));
  };

  return (
    <div className="w-full h-full flex items-center justify-center relative overflow-hidden rounded-2xl" style={{
      background: 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 50%, #94a3b8 100%)'
    }}>
      {/* Static sparkle dots in the background */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(30)].map((_, i) => {
          const seed = 12345;
          const random = (idx) => {
            const x = Math.sin(idx * seed) * 10000;
            return x - Math.floor(x);
          };
          const x = random(i) * 100;
          const y = random(i + 100) * 100;
          const size = 1 + random(i + 200) * 2;
          const opacity = 0.2 + random(i + 300) * 0.3;
          return (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                width: `${size}px`,
                height: `${size}px`,
                backgroundColor: `rgba(248, 250, 252, ${opacity})`,
                boxShadow: `0 0 ${size * 2}px rgba(255, 255, 255, ${opacity * 0.5})`,
              }}
            />
          );
        })}
      </div>
      
      {/* Legend */}
      {points.length > 0 && (
        <div className="absolute top-4 left-4 z-20 bg-white/80 backdrop-blur-sm rounded-lg p-3 shadow-lg text-xs">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-0.5 bg-slate-600" style={{ boxShadow: '0 0 4px rgba(148, 163, 184, 0.8)' }}></div>
            <span className="text-slate-700 font-medium">Catmull-Rom Spline</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 bg-orange-400" style={{ 
              backgroundImage: 'repeating-linear-gradient(90deg, #fb923c 0px, #fb923c 4px, transparent 4px, transparent 6px)'
            }}></div>
            <span className="text-slate-700 font-medium">Quadratic Bézier</span>
          </div>
        </div>
      )}
      
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        className="relative z-10 w-full h-full object-contain cursor-crosshair"
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleRightClick}
      />
    </div>
  );
}