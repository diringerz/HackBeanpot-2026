import React, { useRef, useState, useEffect } from 'react';
import { splineToQuadraticBezier } from './splineToQuadraticBezier.js';

/**
 * Hybrid Bezier Designer
 * - First click: Direct bezier calculation (control point positioned so curve passes through at t=0.5)
 * - Second+ clicks: Anchor points with spline interpolation and bezier conversion
 */
export default function HybridMirrorBezier({ onCurveChange }) {
  const canvasRef = useRef(null);
  const [points, setPoints] = useState([]);
  const [draggingPointId, setDraggingPointId] = useState(null);
  const nextIdRef = useRef(0);

  const WIDTH = 800;
  const HEIGHT = 600;
  const LINE_X = 400;
  const LINE_TOP = 50;
  const LINE_BOTTOM = 550;

  const MAX_POINTS = 5;
  const MIN_VERTICAL_SPACING = 50;
  const MIN_DISTANCE_FROM_VERTICAL = 30;
  const MAX_Y_POSITION = LINE_TOP + 50;
  const MAX_LEFT_DISTANCE = 200;
  const MAX_RIGHT_DISTANCE = 200;

  // Helper function to get scaled coordinates
  const getCanvasCoordinates = (e) => {
    const canvas = canvasRef.current;
    const r = canvas.getBoundingClientRect();
    
    const canvasAspect = WIDTH / HEIGHT;
    const containerAspect = r.width / r.height;
    
    let renderWidth, renderHeight, offsetX, offsetY;
    
    if (containerAspect > canvasAspect) {
      renderHeight = r.height;
      renderWidth = renderHeight * canvasAspect;
      offsetX = (r.width - renderWidth) / 2;
      offsetY = 0;
    } else {
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

  // Catmull-Rom spline interpolation
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

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Vertical line - chrome gradient
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

    ctx.shadowBlur = 10;
    ctx.shadowColor = '#cbd5e1';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(LINE_X, LINE_TOP);
    ctx.lineTo(LINE_X, LINE_BOTTOM);
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (points.length === 0) {
      // Default mirror - straight line
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
    } else if (points.length === 1) {
      // FIRST POINT: Direct bezier - curve passes through point at t=0.5
      const userPt = points[0];
      const cpx = 2 * userPt.x - 0.5 * (LINE_X + LINE_X);
      const cpy = 2 * userPt.y - 0.5 * (LINE_TOP + LINE_BOTTOM);
      
      // Draw the bezier curve
      const curveGradient = ctx.createLinearGradient(0, LINE_TOP, 0, LINE_BOTTOM);
      curveGradient.addColorStop(0, '#475569');
      curveGradient.addColorStop(0.5, '#64748b');
      curveGradient.addColorStop(1, '#475569');
      ctx.strokeStyle = curveGradient;
      ctx.lineWidth = 6;
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(LINE_X, LINE_TOP);
      ctx.quadraticCurveTo(cpx, cpy, LINE_X, LINE_BOTTOM);
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else {
      // MULTIPLE POINTS: Spline interpolation
      const anchorPoints = [
        { x: LINE_X, y: LINE_TOP },
        ...points,
        { x: LINE_X, y: LINE_BOTTOM }
      ];
      
      // Draw curve with chrome gradient
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
        const p = spline(anchorPoints, t);
        if (i === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }
      
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Draw user points (blue)
    points.forEach((p) => {
      const gradient = ctx.createRadialGradient(p.x - 3, p.y - 3, 2, p.x, p.y, 10);
      gradient.addColorStop(0, '#dbeafe');
      gradient.addColorStop(0.5, '#60a5fa');
      gradient.addColorStop(1, '#2563eb');
      ctx.fillStyle = gradient;
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#60a5fa';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(p.x - 3, p.y - 3, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  const exportData = () => {
    let quadraticBeziers = [];
    const samples = [];
    
    if (points.length === 0) {
      // Straight line
      for (let i = 0; i <= 30; i++) {
        const t = i / 30;
        samples.push({ x: LINE_X, y: LINE_TOP + t * (LINE_BOTTOM - LINE_TOP) });
      }
    } else if (points.length === 1) {
      // FIRST POINT: Direct bezier
      const userPt = points[0];
      const cpx = 2 * userPt.x - 0.5 * (LINE_X + LINE_X);
      const cpy = 2 * userPt.y - 0.5 * (LINE_TOP + LINE_BOTTOM);
      
      quadraticBeziers = [{
        start: { x: LINE_X, y: LINE_TOP },
        cp: { x: cpx, y: cpy },
        end: { x: LINE_X, y: LINE_BOTTOM }
      }];
      
      // Sample the bezier
      for (let i = 0; i <= 30; i++) {
        const t = i / 30;
        const mt = 1 - t;
        const x = mt * mt * LINE_X + 2 * mt * t * cpx + t * t * LINE_X;
        const y = mt * mt * LINE_TOP + 2 * mt * t * cpy + t * t * LINE_BOTTOM;
        samples.push({ x, y });
      }
    } else {
      // MULTIPLE POINTS: Spline interpolation
      const anchorPoints = [
        { x: LINE_X, y: LINE_TOP },
        ...points,
        { x: LINE_X, y: LINE_BOTTOM }
      ];
      
      // Convert spline to quadratic beziers
      quadraticBeziers = splineToQuadraticBezier(anchorPoints, 1.0);
      
      // Sample the spline
      for (let i = 0; i <= 30; i++) {
        const t = i / 30;
        samples.push(spline(anchorPoints, t));
      }
    }
    
    const segs = [];
    for (let i = 0; i < samples.length - 1; i++) {
      segs.push({ 
        x1: samples[i].x, 
        y1: samples[i].y, 
        x2: samples[i + 1].x, 
        y2: samples[i + 1].y 
      });
    }

    if (onCurveChange) {
      onCurveChange({
        points,
        lineSegments: segs,
        quadraticBeziers,
        bounds: { x: LINE_X, yTop: LINE_TOP, yBottom: LINE_BOTTOM }
      });
    }
  };

  useEffect(() => {
    draw();
    exportData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  const handleClick = (e) => {
    if (points.length >= MAX_POINTS) return;
    
    const { x, y } = getCanvasCoordinates(e);
    
    if (y < LINE_TOP || y > LINE_BOTTOM) return;
    
    // Allow points on both sides of the vertical line
    if (x < LINE_X - MAX_LEFT_DISTANCE) return;
    if (x > LINE_X + MAX_RIGHT_DISTANCE) return;
    if (Math.abs(x - LINE_X) < MIN_DISTANCE_FROM_VERTICAL) return;
    if (y < MAX_Y_POSITION) return;
    
    const hasVerticalConflict = points.some(p => Math.abs(p.y - y) < MIN_VERTICAL_SPACING);
    if (hasVerticalConflict) return;
    
    if (points.some(p => Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2) < 20)) return;
    
    const newPoint = { x, y, id: nextIdRef.current++ };
    setPoints([...points, newPoint].sort((a, b) => a.y - b.y));
  };

  const handleMouseDown = (e) => {
    const { x, y } = getCanvasCoordinates(e);
    
    const point = points.find(p => Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2) < 12);
    if (point) {
      e.preventDefault();
      e.stopPropagation();
      setDraggingPointId(point.id);
    }
  };

  const handleMouseMove = (e) => {
    if (draggingPointId === null) return;
    
    const { x: rawX, y: rawY } = getCanvasCoordinates(e);
    let x = rawX;
    let y = rawY;
    
    // Clamp to canvas bounds
    x = Math.max(LINE_X - MAX_LEFT_DISTANCE, Math.min(LINE_X + MAX_RIGHT_DISTANCE, x));
    y = Math.max(LINE_TOP, Math.min(LINE_BOTTOM, y));
    
    // Enforce minimum distance from vertical line
    if (Math.abs(x - LINE_X) < MIN_DISTANCE_FROM_VERTICAL) {
      x = x < LINE_X ? LINE_X - MIN_DISTANCE_FROM_VERTICAL : LINE_X + MIN_DISTANCE_FROM_VERTICAL;
    }
    if (y < MAX_Y_POSITION) y = MAX_Y_POSITION;
    
    const newPoints = points.map(p => 
      p.id === draggingPointId ? { ...p, x, y } : p
    );
    const sorted = newPoints.sort((a, b) => a.y - b.y);
    
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
  };

  const handleMouseUp = () => {
    setDraggingPointId(null);
  };

  const handleRightClick = (e) => {
    e.preventDefault();
    const { x, y } = getCanvasCoordinates(e);
    const point = points.find(p => Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2) < 12);
    if (point) {
      setPoints(points.filter(p => p.id !== point.id));
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center relative overflow-hidden rounded-2xl" style={{
      background: 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 50%, #94a3b8 100%)'
    }}>
      {/* Static sparkle dots */}
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
