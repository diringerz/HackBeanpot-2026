import React, { useRef, useState, useEffect, useCallback } from 'react';

export default function MirrorCurveDesigner({ onCurveChange }) {
  const canvasRef = useRef(null);
  const [points, setPoints] = useState([]);
  const [lineSegments, setLineSegments] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedPointIndex, setDraggedPointIndex] = useState(null);
  const [history, setHistory] = useState([]);

  const MAX_POINTS = 5;
  const MAX_LINE_SEGMENTS = 30;

  const WIDTH = 800;
  const HEIGHT = 600;
  const LINE_X = 400;
  const LINE_MARGIN = 50;
  const LINE_TOP = LINE_MARGIN;
  const LINE_BOTTOM = HEIGHT - LINE_MARGIN;

  // Export curve data whenever it changes
  useEffect(() => {
    console.log('Export effect - points:', points.length, 'segments:', lineSegments.length);
    
    // Export if we have at least 1 point
    if (points.length >= 1 && lineSegments.length > 0) {
      const curveData = {
        points: points,
        lineSegments: lineSegments,
        bounds: {
          x: LINE_X,
          yTop: LINE_TOP,
          yBottom: LINE_BOTTOM
        }
      };
      
      console.log('Exporting curve data with', points.length, 'points');
      
      if (onCurveChange) {
        onCurveChange(curveData);
      }
    } else if (points.length === 0) {
      console.log('Zero points - exporting null');
      if (onCurveChange) {
        onCurveChange(null);
      }
    }
  }, [lineSegments, points, onCurveChange]);

  useEffect(() => {
    drawCanvas();
    
    // Only approximate if we have at least 1 point
    if (points.length >= 1) {
      approximateWithLines();
    } else {
      setLineSegments([]);
    }
  }, [points]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(LINE_X, LINE_TOP);
    ctx.lineTo(LINE_X, LINE_BOTTOM);
    ctx.stroke();

    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(LINE_X, LINE_TOP, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(LINE_X, LINE_BOTTOM, 6, 0, Math.PI * 2);
    ctx.fill();

    if (points.length > 0) {
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 3;
      ctx.beginPath();
      
      const allPoints = [
        { x: LINE_X, y: LINE_TOP },
        ...points,
        { x: LINE_X, y: LINE_BOTTOM }
      ];

      ctx.moveTo(allPoints[0].x, allPoints[0].y);

      for (let i = 0; i < allPoints.length - 1; i++) {
        const current = allPoints[i];
        const next = allPoints[i + 1];
        
        if (i < allPoints.length - 2) {
          const nextNext = allPoints[i + 2];
          const cpX = next.x;
          const cpY = next.y;
          const endX = (next.x + nextNext.x) / 2;
          const endY = (next.y + nextNext.y) / 2;
          ctx.quadraticCurveTo(cpX, cpY, endX, endY);
        } else {
          ctx.lineTo(next.x, next.y);
        }
      }
      
      ctx.stroke();

      points.forEach((point, i) => {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }
  };

  const handleMouseDown = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const pointIndex = points.findIndex(p => 
      Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2) < 12
    );

    if (pointIndex !== -1) {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      setDraggedPointIndex(pointIndex);
    }
  }, [points]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging || draggedPointIndex === null) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(LINE_X - 1, e.clientX - rect.left));
    const y = Math.max(LINE_TOP, Math.min(LINE_BOTTOM, e.clientY - rect.top));

    const newPoints = [...points];
    newPoints[draggedPointIndex] = { x, y };
    newPoints.sort((a, b) => a.y - b.y);

    setPoints(newPoints);
  }, [isDragging, draggedPointIndex, points]);

  const handleMouseUp = () => {
    if (isDragging) {
      setHistory(prev => [...prev, [...points]]);
    }
    setIsDragging(false);
    setDraggedPointIndex(null);
  };

  const handleRightClick = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const pointIndex = points.findIndex(p => 
      Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2) < 12
    );

    if (pointIndex !== -1) {
      setHistory(prev => [...prev, [...points]]);
      const newPoints = points.filter((_, i) => i !== pointIndex);
      setPoints(newPoints);
    }
  };

  const undo = () => {
    if (history.length === 0) return;
    const previousState = history[history.length - 1];
    setHistory(history.slice(0, -1));
    setPoints(previousState);
  };

  const clearPoints = () => {
    setHistory(prev => [...prev, [...points]]);
    setPoints([]);
    setLineSegments([]);
  };

  const approximateWithLines = () => {
    const allPoints = [
      { x: LINE_X, y: LINE_TOP },
      ...points,
      { x: LINE_X, y: LINE_BOTTOM }
    ];

    console.log('Approximating with points:', allPoints.length);

    const numSegments = Math.min(MAX_LINE_SEGMENTS, Math.max(10, allPoints.length * 6));
    const samples = [];

    for (let i = 0; i <= numSegments; i++) {
      const t = i / numSegments;
      const point = sampleCurve(allPoints, t);
      samples.push(point);
    }

    const segments = [];
    for (let i = 0; i < samples.length - 1; i++) {
      segments.push({
        x1: samples[i].x,
        y1: samples[i].y,
        x2: samples[i + 1].x,
        y2: samples[i + 1].y
      });
    }

    setLineSegments(segments);
    console.log('Created', segments.length, 'line segments');
  };

  const sampleCurve = (pts, t) => {
    const totalLength = pts.length - 1;
    const scaledT = t * totalLength;
    const index = Math.floor(scaledT);
    const localT = scaledT - index;

    if (index >= pts.length - 1) {
      return pts[pts.length - 1];
    }

    const p0 = pts[Math.max(0, index - 1)];
    const p1 = pts[index];
    const p2 = pts[Math.min(pts.length - 1, index + 1)];
    const p3 = pts[Math.min(pts.length - 1, index + 2)];

    const t2 = localT * localT;
    const t3 = t2 * localT;

    const x = 0.5 * (
      (2 * p1.x) +
      (-p0.x + p2.x) * localT +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
    );

    const y = 0.5 * (
      (2 * p1.y) +
      (-p0.y + p2.y) * localT +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
    );

    return { x, y };
  };

  return (
    <div>
      <h2>Mirror Curve Designer</h2>
      <div>
        <button onClick={undo} disabled={history.length === 0}>Undo</button>
        <button onClick={clearPoints} disabled={points.length === 0}>Clear</button>
      </div>
      <canvas 
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        onClick={(e) => {
          console.log('CLICK - Points:', points.length, '/', MAX_POINTS);
          
          if (isDragging) {
            console.log('Ignoring - dragging');
            return;
          }
          
          if (points.length >= MAX_POINTS) {
            console.log('BLOCKED - at maximum');
            return;
          }

          const canvas = canvasRef.current;
          const rect = canvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;

          if (x >= LINE_X) return;
          if (y < LINE_TOP || y > LINE_BOTTOM) return;

          const nearPoint = points.findIndex(p => 
            Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2) < 20
          );
          if (nearPoint !== -1) return;

          const newPoint = { x, y };
          const newPoints = [...points, newPoint].sort((a, b) => a.y - b.y);
          
          if (newPoints.length > MAX_POINTS) {
            console.log('BLOCKED - would exceed');
            return;
          }
          
          console.log('Adding point');
          setHistory(prev => [...prev, [...points]]);
          setPoints(newPoints);
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleRightClick}
        style={{ border: '1px solid black', cursor: 'crosshair' }}
      />
      <div>
        <p>Points: {points.length}/{MAX_POINTS} | Line segments: {lineSegments.length}/{MAX_LINE_SEGMENTS}</p>
        <p>Click to add | Drag to move | Right-click to delete</p>
      </div>
    </div>
  );
}