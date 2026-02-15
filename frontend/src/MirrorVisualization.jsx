import React, { useRef, useEffect } from 'react';

export default function MirrorVisualization({
  bottomZ0,
  bottomZ1,
  bottomZ2,
  topZ0,
  topZ1,
  topZ2,
  mirrorDist,
  mirrorHalfHeight,
  imagePlaneDist,
  imageSizeY,
  videoRef
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Set up coordinate system
    // Center vertically, with camera at left side
    const scale = 80; // pixels per unit
    const originX = 100; // camera position
    const originY = height / 2;

    // Helper function to convert world coords to canvas coords
    const toCanvas = (z, y) => ({
      x: originX + z * scale,
      y: originY - y * scale
    });

    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let i = -5; i <= 10; i++) {
      const pos = toCanvas(i, 0);
      ctx.beginPath();
      ctx.moveTo(pos.x, 0);
      ctx.lineTo(pos.x, height);
      ctx.stroke();
    }
    for (let i = -5; i <= 5; i++) {
      const pos = toCanvas(0, i);
      ctx.beginPath();
      ctx.moveTo(0, pos.y);
      ctx.lineTo(width, pos.y);
      ctx.stroke();
    }

    // Draw axes
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    // Z-axis (horizontal)
    ctx.beginPath();
    ctx.moveTo(0, originY);
    ctx.lineTo(width, originY);
    ctx.stroke();
    // Y-axis (vertical)
    ctx.beginPath();
    ctx.moveTo(originX, 0);
    ctx.lineTo(originX, height);
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#999';
    ctx.font = '12px monospace';
    ctx.fillText('Z', width - 20, originY - 10);
    ctx.fillText('Y', originX + 10, 20);

    // Draw image plane (behind camera at z = -imagePlaneDist)
    const imgZ = -imagePlaneDist;
    const imgHalfY = imageSizeY / 2;
    const imgTop = toCanvas(imgZ, imgHalfY);
    const imgBottom = toCanvas(imgZ, -imgHalfY);

    // Draw webcam feed as image on the image plane if available
    const video = videoRef?.current;
    if (video && video.videoWidth > 0) {
      ctx.save();
      const imgWidth = 5; // visual thickness of image plane
      ctx.translate(imgTop.x - imgWidth/2, imgTop.y);
      const imgHeight = imgBottom.y - imgTop.y;
      ctx.drawImage(video, 0, 0, imgWidth, imgHeight);
      ctx.restore();
    }

    // Draw image plane rectangle
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(imgTop.x, imgTop.y);
    ctx.lineTo(imgBottom.x, imgBottom.y);
    ctx.stroke();

    ctx.fillStyle = '#4CAF50';
    ctx.font = '11px monospace';
    ctx.fillText('Image Plane', imgTop.x - 70, imgTop.y - 5);
    ctx.fillText('(webcam)', imgTop.x - 70, imgTop.y + 10);

    // Draw camera
    const camPos = toCanvas(0, 0);
    ctx.fillStyle = '#2196F3';
    ctx.beginPath();
    ctx.arc(camPos.x, camPos.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2196F3';
    ctx.font = '12px monospace';
    ctx.fillText('Camera', camPos.x - 30, camPos.y - 15);

    // Draw camera FOV cone (simplified)
    ctx.strokeStyle = '#2196F380';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(camPos.x, camPos.y);
    const fovAngle = Math.PI / 6; // approx 30 degrees
    const fovLength = mirrorDist + 0.5;
    ctx.lineTo(
      camPos.x + fovLength * scale,
      camPos.y - Math.tan(fovAngle) * fovLength * scale
    );
    ctx.moveTo(camPos.x, camPos.y);
    ctx.lineTo(
      camPos.x + fovLength * scale,
      camPos.y + Math.tan(fovAngle) * fovLength * scale
    );
    ctx.stroke();

    // Calculate mirror curve using piecewise Bézier parameterization
    // Helper function to convert Bezier segment to polynomial coefficients
    const bezierToPolynomial = (yMin, yMax, z0, z1, z2) => {
      const yRange = yMax - yMin;
      
      if (yRange === 0) {
        return { a: 0, b: 0, c: z0 };
      }
      
      // Bézier coefficients in t-space
      const a_t = z0 - 2.0 * z1 + z2;
      const b_t = 2.0 * (z1 - z0);
      const c_t = z0;
      
      // Convert to polynomial in y-space: z(y) = a·y² + b·y + c
      const a = a_t / (yRange * yRange);
      const b = b_t / yRange - 2.0 * a_t * yMin / (yRange * yRange);
      const c = c_t + a_t * yMin * yMin / (yRange * yRange) - b_t * yMin / yRange;
      
      return { a, b, c };
    };
    
    // Bottom segment: y ∈ [-mirrorHalfHeight, 0]
    const bottomSegment = bezierToPolynomial(-mirrorHalfHeight, 0, bottomZ0, bottomZ1, bottomZ2);
    
    // Top segment: y ∈ [0, +mirrorHalfHeight]
    const topSegment = bezierToPolynomial(0, mirrorHalfHeight, topZ0, topZ1, topZ2);

    // Function to compute z-depth from y-coordinate (piecewise)
    const getMirrorZ = (y) => {
      if (y < 0) {
        // Bottom segment
        return bottomSegment.a * y * y + bottomSegment.b * y + bottomSegment.c + mirrorDist;
      } else {
        // Top segment
        return topSegment.a * y * y + topSegment.b * y + topSegment.c + mirrorDist;
      }
    };

    // Draw mirror curve
    ctx.strokeStyle = '#FF9800';
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    const steps = 100;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = -mirrorHalfHeight + t * (2 * mirrorHalfHeight);
      const z = getMirrorZ(y);
      const pos = toCanvas(z, y);
      
      if (i === 0) {
        ctx.moveTo(pos.x, pos.y);
      } else {
        ctx.lineTo(pos.x, pos.y);
      }
    }
    ctx.stroke();

    ctx.fillStyle = '#FF9800';
    ctx.font = '12px monospace';
    const mirrorLabel = toCanvas(mirrorDist + bottomZ0, mirrorHalfHeight + 0.3);
    ctx.fillText('Mirror', mirrorLabel.x - 10, mirrorLabel.y);

    // Draw Bézier control points
    const drawControlPoint = (y, z, label, color) => {
      const worldZ = z + mirrorDist;  // Use the actual control point z position
      const pos = toCanvas(worldZ, y);
      
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.fillStyle = color;
      ctx.font = '10px monospace';
      ctx.fillText(label, pos.x + 12, pos.y + 4);
    };

    // Bottom segment control points
    drawControlPoint(-mirrorHalfHeight, bottomZ0, 'P₀ (bottom)', '#FFD700');
    drawControlPoint(-mirrorHalfHeight / 2, bottomZ1, 'P₁ (bottom)', '#FF6B6B');
    drawControlPoint(0, bottomZ2, 'P₂ (center)', '#4CAF50');
    
    // Top segment control points
    drawControlPoint(0, topZ0, 'P₀ (center)', '#4CAF50');
    drawControlPoint(mirrorHalfHeight / 2, topZ1, 'P₁ (top)', '#6B9FFF');
    drawControlPoint(mirrorHalfHeight, topZ2, 'P₂ (top)', '#FFD700');

    // Draw control polygons
    // Bottom segment control polygon
    ctx.strokeStyle = '#FF6B6B60';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    const bottomP0 = toCanvas(bottomZ0 + mirrorDist, -mirrorHalfHeight);
    const bottomP1 = toCanvas(bottomZ1 + mirrorDist, -mirrorHalfHeight / 2);
    const bottomP2 = toCanvas(bottomZ2 + mirrorDist, 0);
    ctx.moveTo(bottomP0.x, bottomP0.y);
    ctx.lineTo(bottomP1.x, bottomP1.y);
    ctx.lineTo(bottomP2.x, bottomP2.y);
    ctx.stroke();
    
    // Top segment control polygon
    ctx.strokeStyle = '#6B9FFF60';
    ctx.beginPath();
    const topP0 = toCanvas(topZ0 + mirrorDist, 0);
    const topP1 = toCanvas(topZ1 + mirrorDist, mirrorHalfHeight / 2);
    const topP2 = toCanvas(topZ2 + mirrorDist, mirrorHalfHeight);
    ctx.moveTo(topP0.x, topP0.y);
    ctx.lineTo(topP1.x, topP1.y);
    ctx.lineTo(topP2.x, topP2.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw distance annotations
    ctx.strokeStyle = '#888';
    ctx.fillStyle = '#888';
    ctx.lineWidth = 1;
    ctx.font = '10px monospace';
    
    // Mirror distance
    const annotY = originY + 180;
    ctx.beginPath();
    ctx.moveTo(originX, annotY);
    ctx.lineTo(toCanvas(mirrorDist, 0).x, annotY);
    ctx.stroke();
    ctx.fillText(`${mirrorDist.toFixed(2)}`, (originX + toCanvas(mirrorDist, 0).x) / 2 - 15, annotY - 5);

  }, [bottomZ0, bottomZ1, bottomZ2, topZ0, topZ1, topZ2, mirrorDist, mirrorHalfHeight, imagePlaneDist, imageSizeY, videoRef]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <h3>Mirror Profile Visualization (Side View)</h3>
      <canvas 
        ref={canvasRef}
        width={800}
        height={500}
        style={{ border: '2px solid #ccc', borderRadius: '8px', backgroundColor: '#1a1a1a' }}
      />
      <div style={{ marginTop: '10px', fontSize: '11px', color: '#999', textAlign: 'center' }}>
        <div>Camera (blue) at origin • Image plane (green) behind camera • Mirror (orange) piecewise curve</div>
        <div>Control points: Bottom segment (red) • Center (green) • Top segment (blue) — piecewise quadratic Bézier</div>
      </div>
    </div>
  );
}
