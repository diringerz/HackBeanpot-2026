import React, { useRef, useState, useEffect } from 'react';

export default function AssymMirrorDesigner({ onCurveChange }) {
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

  useEffect(() => {
    draw();
    exportData();
  }, [points]);

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
    } else {
      const all = [
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
        const p = spline(all, t);
        if (i === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }
      
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw control points
      points.forEach((p) => {
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
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(p.x - 3, p.y - 3, 3, 0, Math.PI * 2);
        ctx.fill();
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
    const all = points.length > 0 ?
      [{ x: LINE_X, y: LINE_TOP }, ...points, { x: LINE_X, y: LINE_BOTTOM }] :
      [{ x: LINE_X, y: LINE_TOP }, { x: LINE_X, y: LINE_BOTTOM }];
    
    const samples = [];
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      if (points.length === 0) {
        samples.push({ x: LINE_X, y: LINE_TOP + t * (LINE_BOTTOM - LINE_TOP) });
      } else {
        samples.push(spline(all, t));
      }
    }
    
    const segs = [];
    for (let i = 0; i < samples.length - 1; i++) {
      segs.push({ x1: samples[i].x, y1: samples[i].y, x2: samples[i + 1].x, y2: samples[i + 1].y });
    }

    if (onCurveChange) {
      onCurveChange({
        points,
        lineSegments: segs,
        bounds: { x: LINE_X, yTop: LINE_TOP, yBottom: LINE_BOTTOM }
      });
    }
  };

  const handleClick = (e) => {
    if (points.length >= MAX_POINTS) return;
    
    const r = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    
    if (x >= LINE_X) return;
    if (y < LINE_TOP || y > LINE_BOTTOM) return;
    
    if (LINE_X - x > MAX_LEFT_DISTANCE) return;
    if (LINE_X - x < MIN_DISTANCE_FROM_VERTICAL) return;
    if (y < MAX_Y_POSITION) return;
    
    const hasVerticalConflict = points.some(p => Math.abs(p.y - y) < MIN_VERTICAL_SPACING);
    if (hasVerticalConflict) return;
    
    if (points.some(p => Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2) < 20)) return;
    
    const newPoint = { x, y, id: nextIdRef.current++ };
    setPoints([...points, newPoint].sort((a, b) => a.y - b.y));
  };

  const handleMouseDown = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    
    const point = points.find(p => Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2) < 12);
    if (point) {
      e.preventDefault();
      e.stopPropagation();
      setDraggingPointId(point.id);
      console.log('Started dragging point id', point.id);
    }
  };

  const handleMouseMove = (e) => {
    if (draggingPointId === null) return;
    
    const r = canvasRef.current.getBoundingClientRect();
    let x = e.clientX - r.left;
    let y = e.clientY - r.top;
    
    x = Math.max(0, Math.min(LINE_X - 1, x));
    y = Math.max(LINE_TOP, Math.min(LINE_BOTTOM, y));
    
    if (LINE_X - x > MAX_LEFT_DISTANCE) x = LINE_X - MAX_LEFT_DISTANCE;
    if (LINE_X - x < MIN_DISTANCE_FROM_VERTICAL) x = LINE_X - MIN_DISTANCE_FROM_VERTICAL;
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
    if (draggingPointId !== null) {
      console.log('Stopped dragging');
    }
    setDraggingPointId(null);
  };

  const handleRightClick = (e) => {
    e.preventDefault();
    const r = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const point = points.find(p => Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2) < 12);
    if (point) {
      console.log('Deleting point id', point.id);
      setPoints(points.filter(p => p.id !== point.id));
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="p-4">
        <h2 className="text-xl font-bold mb-2">Mirror Designer</h2>
        <button onClick={() => setPoints([])} className="px-4 py-2 bg-slate-500 text-white rounded">Clear</button>
        <p className="mt-2">Points: {points.length}/{MAX_POINTS}</p>
      </div>
      <div className="flex-1 flex items-center justify-center relative overflow-hidden rounded-2xl" style={{
        background: 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 50%, #94a3b8 100%)'
      }}>
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
    </div>
  );
}