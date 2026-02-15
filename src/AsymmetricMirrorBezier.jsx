import React, { useRef, useState, useEffect } from 'react';

/**
 * Convert user pass-through points to smooth quadratic Bezier curves with C1 continuity
 * Each user point generates TWO bezier curves (S-curve) for smooth transitions
 * - 0 user points: 1 Bezier (straight line)
 * - 1 user point: 2 Beziers (S-curve through the point)
 * - 2+ user points: 2*n Beziers (each point gets an S-curve pair)
 */
function pointsToQuadraticBeziers(anchorPoints, userPoints) {
  const LINE_X = anchorPoints[0].x;
  const LINE_TOP = anchorPoints[0].y;
  const LINE_BOTTOM = anchorPoints[anchorPoints.length - 1].y;
  
  if (userPoints.length === 0) {
    // No user points - straight line
    return [{
      start: { x: LINE_X, y: LINE_TOP },
      cp: { x: LINE_X, y: (LINE_TOP + LINE_BOTTOM) / 2 },
      end: { x: LINE_X, y: LINE_BOTTOM }
    }];
  }
  
  if (userPoints.length === 1) {
    // Single user point: Just one curve passing through it at t=0.5
    const userPt = userPoints[0];
    const cpx = 2 * userPt.x - 0.5 * (LINE_X + LINE_X);
    const cpy = 2 * userPt.y - 0.5 * (LINE_TOP + LINE_BOTTOM);
    
    return [{
      start: { x: LINE_X, y: LINE_TOP },
      cp: { x: cpx, y: cpy },
      end: { x: LINE_X, y: LINE_BOTTOM }
    }];
  }
  
  // Multiple user points: First point gets 1 curve, middle points get S-curves
  const beziers = [];
  const n = userPoints.length;
  
  // First segment: top -> first user point (single curve through it at t=0.5)
  const firstPt = userPoints[0];
  const junctionAfterFirst = n > 1 ? {
    x: (firstPt.x + userPoints[1].x) / 2,
    y: (firstPt.y + userPoints[1].y) / 2
  } : { x: LINE_X, y: LINE_BOTTOM };
  
  const cp0x = 2 * firstPt.x - 0.5 * (LINE_X + junctionAfterFirst.x);
  const cp0y = 2 * firstPt.y - 0.5 * (LINE_TOP + junctionAfterFirst.y);
  
  beziers.push({
    start: { x: LINE_X, y: LINE_TOP },
    cp: { x: cp0x, y: cp0y },
    end: junctionAfterFirst
  });
  
  // Middle segments: S-curves for each point after the first
  for (let i = 1; i < n; i++) {
    const userPt = userPoints[i];
    const prevPt = userPoints[i - 1];
    const nextPt = i < n - 1 ? userPoints[i + 1] : null;
    
    // Junction before this point
    const junctionBefore = {
      x: (prevPt.x + userPt.x) / 2,
      y: (prevPt.y + userPt.y) / 2
    };
    
    // Junction after this point
    const junctionAfter = nextPt ? {
      x: (userPt.x + nextPt.x) / 2,
      y: (userPt.y + nextPt.y) / 2
    } : { x: LINE_X, y: LINE_BOTTOM };
    
    // First curve: junction -> user point (ends at user point, so user point is at t=1)
    // Create a natural curve by positioning control point
    // Use a bias towards the junction to create the first part of the S
    const dx1 = userPt.x - junctionBefore.x;
    const dy1 = userPt.y - junctionBefore.y;
    const cp1x = junctionBefore.x + dx1 * 0.67;
    const cp1y = junctionBefore.y + dy1 * 0.67;
    
    beziers.push({
      start: junctionBefore,
      cp: { x: cp1x, y: cp1y },
      end: { x: userPt.x, y: userPt.y }
    });
    
    // Second curve: user point -> junction (starts at user point, so user point is at t=0)
    // For C1 continuity: tangent at userPt must be continuous
    // Tangent at end of curve1 (t=1): 2(userPt - cp1)
    // Tangent at start of curve2 (t=0): 2(cp2 - userPt)
    // So: cp2 = 2*userPt - cp1 (reflection across userPt)
    const dx2 = junctionAfter.x - userPt.x;
    const dy2 = junctionAfter.y - userPt.y;
    const cp2x = userPt.x + dx2 * 0.67;
    const cp2y = userPt.y + dy2 * 0.67;
    
    beziers.push({
      start: { x: userPt.x, y: userPt.y },
      cp: { x: cp2x, y: cp2y },
      end: junctionAfter
    });
  }
  
  return beziers;
}

/**
 * Evaluate a quadratic Bezier curve at parameter t
 */
function evaluateQuadraticBezier(bezier, t) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  
  return {
    x: mt2 * bezier.start.x + 2 * mt * t * bezier.cp.x + t2 * bezier.end.x,
    y: mt2 * bezier.start.y + 2 * mt * t * bezier.cp.y + t2 * bezier.end.y
  };
}

export default function AsymmetricMirrorBezier({ onCurveChange }) {
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

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Clear canvas to transparent
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
    } else {
      const anchorPoints = [
        { x: LINE_X, y: LINE_TOP },
        { x: LINE_X, y: LINE_BOTTOM }
      ];
      
      const beziers = pointsToQuadraticBeziers(anchorPoints, points);
      
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
      
      // Draw using the quadratic Beziers
      if (beziers.length > 0) {
        ctx.moveTo(beziers[0].start.x, beziers[0].start.y);
        for (const bez of beziers) {
          ctx.quadraticCurveTo(bez.cp.x, bez.cp.y, bez.end.x, bez.end.y);
        }
      }
      
      ctx.stroke();
      ctx.shadowBlur = 0;

      // DEBUG: Draw Bezier control points (calculated) in red
      ctx.fillStyle = 'rgba(255, 0, 0, 0.6)';
      ctx.strokeStyle = 'rgba(255, 100, 100, 0.4)';
      ctx.lineWidth = 1;
      for (const bez of beziers) {
        // Draw control point
        ctx.beginPath();
        ctx.arc(bez.cp.x, bez.cp.y, 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw control lines
        ctx.beginPath();
        ctx.moveTo(bez.start.x, bez.start.y);
        ctx.lineTo(bez.cp.x, bez.cp.y);
        ctx.lineTo(bez.end.x, bez.end.y);
        ctx.stroke();
      }

      // Draw junction points (where curves meet) in green - can float anywhere!
      if (beziers.length > 1) {
        ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
        ctx.strokeStyle = 'rgba(0, 200, 0, 0.9)';
        ctx.lineWidth = 2;
        for (let i = 1; i < beziers.length; i++) {
          const jx = beziers[i].start.x;
          const jy = beziers[i].start.y;
          
          ctx.beginPath();
          ctx.arc(jx, jy, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          
          // Draw collinearity line showing C1 continuity
          const prevCp = beziers[i - 1].cp;
          const nextCp = beziers[i].cp;
          ctx.strokeStyle = 'rgba(0, 255, 0, 0.2)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(prevCp.x, prevCp.y);
          ctx.lineTo(jx, jy);
          ctx.lineTo(nextCp.x, nextCp.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Draw user pass-through points (where user clicked) in blue
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
    }
  };

  const exportData = () => {
    const anchorPoints = [
      { x: LINE_X, y: LINE_TOP },
      { x: LINE_X, y: LINE_BOTTOM }
    ];
    
    // Generate native quadratic Bezier curves - no conversion needed!
    const quadraticBeziers = pointsToQuadraticBeziers(anchorPoints, points);
    
    // Also generate sample points for line segments (backwards compatibility)
    const samples = [];
    if (points.length === 0) {
      // Straight line
      for (let i = 0; i <= 30; i++) {
        const t = i / 30;
        samples.push({ x: LINE_X, y: LINE_TOP + t * (LINE_BOTTOM - LINE_TOP) });
      }
    } else {
      // Sample from the bezier curves
      const samplesPerBezier = Math.ceil(30 / quadraticBeziers.length);
      for (const bez of quadraticBeziers) {
        for (let i = 0; i < samplesPerBezier; i++) {
          const t = i / samplesPerBezier;
          samples.push(evaluateQuadraticBezier(bez, t));
        }
      }
      // Add final point
      if (quadraticBeziers.length > 0) {
        samples.push(quadraticBeziers[quadraticBeziers.length - 1].end);
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
        quadraticBeziers, // Native quadratic Beziers, no subdivision!
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
    
    // User points define pass-through locations - the bezier calculation handles the rest
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
    
    // Clamp to canvas bounds with extension on both sides
    x = Math.max(LINE_X - MAX_LEFT_DISTANCE, Math.min(LINE_X + MAX_RIGHT_DISTANCE, x));
    y = Math.max(LINE_TOP, Math.min(LINE_BOTTOM, y));
    
    // Enforce minimum distance from vertical line (dead zone)
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
