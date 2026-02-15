import React, { useRef, useEffect } from 'react';

export default function MirrorVisualization({
  curveSegments, // Array of { yMin, yMax, z0, z1, z2 }
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
        return { a: 0, b: 0, c: z0, yMin, yMax };
      }
      
      // Bézier coefficients in t-space
      const a_t = z0 - 2.0 * z1 + z2;
      const b_t = 2.0 * (z1 - z0);
      const c_t = z0;
      
      // Convert to polynomial in y-space: z(y) = a·y² + b·y + c
      const a = a_t / (yRange * yRange);
      const b = b_t / yRange - 2.0 * a_t * yMin / (yRange * yRange);
      const c = c_t + a_t * yMin * yMin / (yRange * yRange) - b_t * yMin / yRange;
      
      return { a, b, c, yMin, yMax };
    };
    
    // Convert all curve segments to polynomial form
    const segments = curveSegments.map(seg => 
      bezierToPolynomial(seg.yMin, seg.yMax, seg.z0, seg.z1, seg.z2)
    );

    // Function to compute z-depth from y-coordinate (piecewise)
    const getMirrorZ = (y) => {
      // Find which segment this y belongs to
      for (const seg of segments) {
        if (y >= seg.yMin && y <= seg.yMax) {
          return seg.a * y * y + seg.b * y + seg.c + mirrorDist;
        }
      }
      // Fallback to first segment
      const seg = segments[0];
      return seg.a * y * y + seg.b * y + seg.c + mirrorDist;
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
    const mirrorLabel = toCanvas(mirrorDist + curveSegments[0].z0, mirrorHalfHeight + 0.3);
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

    // Colors for different segments
    const segmentColors = ['#FF6B6B', '#6B9FFF', '#FFB86B', '#9F6BFF', '#6BFFB8'];
    
    // Draw control points and polygons for all segments
    curveSegments.forEach((seg, idx) => {
      const color = segmentColors[idx % segmentColors.length];
      const yMid = (seg.yMin + seg.yMax) / 2;
      
      // Draw control points
      drawControlPoint(seg.yMin, seg.z0, `P₀ [${idx}]`, '#FFD700');
      drawControlPoint(yMid, seg.z1, `P₁ [${idx}]`, color);
      drawControlPoint(seg.yMax, seg.z2, `P₂ [${idx}]`, seg.yMax === mirrorHalfHeight || seg.yMax === 0 ? '#4CAF50' : '#FFD700');
      
      // Draw control polygon
      ctx.strokeStyle = color + '60';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      const p0 = toCanvas(seg.z0 + mirrorDist, seg.yMin);
      const p1 = toCanvas(seg.z1 + mirrorDist, yMid);
      const p2 = toCanvas(seg.z2 + mirrorDist, seg.yMax);
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    });
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

  }, [curveSegments, mirrorDist, mirrorHalfHeight, imagePlaneDist, imageSizeY, videoRef]);

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
        <div>{curveSegments.length} segment{curveSegments.length !== 1 ? 's' : ''} — piecewise quadratic Bézier curves</div>
      </div>
    </div>
  );
}
