import React, { useRef, useState, useEffect } from 'react';

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

  useEffect(() => {
    draw();
    exportData();
  }, [points, middlePoint]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, LINE_MIDDLE);
    ctx.lineTo(LINE_X, LINE_MIDDLE);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(LINE_X, LINE_TOP);
    ctx.lineTo(LINE_X, LINE_BOTTOM);
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(middlePoint.x, LINE_MIDDLE, 8, 0, Math.PI * 2);
    ctx.fill();

    if (points.length > 0) {
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
      
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 3;
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

      points.forEach(p => {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fill();
      });
      
      reflected.forEach(p => {
        ctx.fillStyle = '#94a3b8';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
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
    if (points.length === 0) {
      if (onCurveChange) onCurveChange(null);
      return;
    }

    const reflected = [...points].reverse().map(p => ({ x: p.x, y: LINE_MIDDLE + (LINE_MIDDLE - p.y) }));
    const all = [{ x: LINE_X, y: LINE_TOP }, ...points, middlePoint, ...reflected, { x: LINE_X, y: LINE_BOTTOM }];
    
    const samples = [];
    for (let i = 0; i <= 30; i++) {
      samples.push(spline(all, i / 30));
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
        bounds: { x: LINE_X, yTop: LINE_TOP, yMiddle: LINE_MIDDLE, yBottom: LINE_BOTTOM }
      });
    }
  };

  const handleClick = (e) => {
    if (points.length >= 2) return;
    const r = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (x >= LINE_X || y < LINE_TOP || y > LINE_MIDDLE) return;
    if (points.some(p => Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2) < 20)) return;
    setPoints([...points, { x, y }].sort((a, b) => a.y - b.y));
  };

  const handleMouseDown = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (Math.sqrt((middlePoint.x - x) ** 2 + (LINE_MIDDLE - y) ** 2) < 12) {
      setDraggingMiddle(true);
      return;
    }
    const i = points.findIndex(p => Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2) < 12);
    if (i !== -1) setDraggingPoint(i);
  };

  const handleMouseMove = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    if (draggingMiddle) {
      const x = Math.max(0, Math.min(LINE_X, e.clientX - r.left));
      setMiddlePoint({ x, y: LINE_MIDDLE });
    } else if (draggingPoint !== null) {
      const x = Math.max(0, Math.min(LINE_X - 1, e.clientX - r.left));
      const y = Math.max(LINE_TOP, Math.min(LINE_MIDDLE, e.clientY - r.top));
      const p = [...points];
      p[draggingPoint] = { x, y };
      setPoints(p.sort((a, b) => a.y - b.y));
    }
  };

  const handleMouseUp = () => {
    setDraggingMiddle(false);
    setDraggingPoint(null);
  };

  const handleRightClick = (e) => {
    e.preventDefault();
    const r = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const i = points.findIndex(p => Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2) < 12);
    if (i !== -1) setPoints(points.filter((_, j) => j !== i));
  };

  return (
    <div>
      <h2>Mirror Designer</h2>
      <button onClick={() => setPoints([])}>Clear</button>
      <canvas 
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleRightClick}
      />
      <p>Add 2 points in top half | Drag orange point left/right</p>
    </div>
  );
}