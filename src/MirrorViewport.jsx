import ClassicMirrorViewport from './ClassicMirrorViewport';
import RayTracedMirror from './RayTracedMirror';

// Convert quadratic Bezier curves from MirrorCurveDesigner to RayTracedMirror format
const convertBezierCurvesToSegments = (curveData) => {
  console.log('[convertBezierCurvesToSegments] Input curveData:', curveData);
  
  // Check if we have the new quadratic Bezier data
  if (!curveData || !curveData.quadraticBeziers || curveData.quadraticBeziers.length === 0) {
    // Default to a flat mirror - normalized coordinates
    const defaultSegment = [{
      yMin: -0.4,  // Physical coordinates matching mirrorHalfHeight
      yMax: 0.4,
      z0: 0.0,     // At the mirror plane
      z1: 0.0,
      z2: 0.0
    }];
    console.log('[convertBezierCurvesToSegments] Using default flat mirror:', defaultSegment);
    return defaultSegment;
  }

  // Get bounds from curve data
  const bounds = curveData.bounds;
  const canvasHeight = bounds.yBottom - bounds.yTop;  // e.g., 550 - 50 = 500
  const canvasWidth = bounds.x;  // e.g., 400 (the centerline x position)
  
  // Physical dimensions for the shader (matching the mirror parameters)
  const physicalHalfHeight = 2.0;  // Make mirror much taller
  const physicalMaxDepth = 1.0;    // Increase max curve depth
  
  console.log('[convertBezierCurvesToSegments] Canvas bounds:', { 
    yTop: bounds.yTop, 
    yBottom: bounds.yBottom, 
    x: bounds.x,
    canvasHeight 
  });

  // Convert quadratic Bezier curves to raytracer format
  const result = curveData.quadraticBeziers.map(bezier => {
    // Convert y coordinates from canvas pixels to physical coordinates
    const yStartPhysical = ((bezier.start.y - bounds.yTop) / canvasHeight) * (2 * physicalHalfHeight) - physicalHalfHeight;
    const yEndPhysical = ((bezier.end.y - bounds.yTop) / canvasHeight) * (2 * physicalHalfHeight) - physicalHalfHeight;
    
    const yMin = Math.min(yStartPhysical, yEndPhysical);
    const yMax = Math.max(yStartPhysical, yEndPhysical);
    
    // Convert x (depth) coordinates from canvas pixels to physical depth
    // Pixels to the left of centerline (x < bounds.x) represent curve toward viewer (negative z)
    // Negate so curves toward viewer are negative (closer to camera)
    const z0 = -((bounds.x - bezier.start.x) / canvasWidth * physicalMaxDepth);
    const z1 = -((bounds.x - bezier.cp.x) / canvasWidth * physicalMaxDepth);  // Control point
    const z2 = -((bounds.x - bezier.end.x) / canvasWidth * physicalMaxDepth);
    
    return { yMin, yMax, z0, z1, z2 };
  });
  
  console.log('[convertBezierCurvesToSegments] Converted', result.length, 'quadratic Bezier curves to physical coordinates:', result);
  return result;
};

// Legacy converter - keeping for backwards compatibility with classic mode
const convertCurveDataToSegments = (curveData) => {
  // If we have Bezier curves, use the new converter
  if (curveData && curveData.quadraticBeziers && curveData.quadraticBeziers.length > 0) {
    return convertBezierCurvesToSegments(curveData);
  }
  
  console.log('[convertCurveDataToSegments] Input curveData:', curveData);
  
  if (!curveData || !curveData.lineSegments || curveData.lineSegments.length === 0) {
    // Default to a flat mirror - normalized coordinates
    const defaultSegment = [{
      yMin: -0.4,  // Physical coordinates matching mirrorHalfHeight
      yMax: 0.4,
      z0: 0.0,     // At the mirror plane
      z1: 0.0,
      z2: 0.0
    }];
    console.log('[convertCurveDataToSegments] Using default flat mirror:', defaultSegment);
    return defaultSegment;
  }

  // Get bounds from curve data
  const bounds = curveData.bounds;
  const canvasHeight = bounds.yBottom - bounds.yTop;  // e.g., 550 - 50 = 500
  const canvasWidth = bounds.x;  // e.g., 400 (the centerline x position)
  
  // Physical dimensions for the shader (matching the mirror parameters)
  const physicalHalfHeight = 2.0;  // Make mirror much taller
  const physicalMaxDepth = 1.0;    // Increase max curve depth
  
  console.log('[convertCurveDataToSegments] Canvas bounds:', { 
    yTop: bounds.yTop, 
    yBottom: bounds.yBottom, 
    x: bounds.x,
    canvasHeight 
  });

  // Convert line segments to Bezier curve segments with coordinate transformation
  const result = curveData.lineSegments.map(seg => {
    // Convert y coordinates from canvas pixels to physical coordinates [-0.4, 0.4]
    const y1Physical = ((seg.y1 - bounds.yTop) / canvasHeight) * (2 * physicalHalfHeight) - physicalHalfHeight;
    const y2Physical = ((seg.y2 - bounds.yTop) / canvasHeight) * (2 * physicalHalfHeight) - physicalHalfHeight;
    
    const yMin = Math.min(y1Physical, y2Physical);
    const yMax = Math.max(y1Physical, y2Physical);
    
    // Convert x coordinates from canvas pixels to physical depth
    // Pixels to the left of centerline (x < bounds.x) represent curve toward viewer (negative z)
    // Negate so curves toward viewer are negative (closer to camera)
    const x1Depth = -((bounds.x - seg.x1) / canvasWidth * physicalMaxDepth);
    const x2Depth = -((bounds.x - seg.x2) / canvasWidth * physicalMaxDepth);
    
    let z0, z2;
    // Handle orientation: ensure z0 corresponds to yMin and z2 to yMax
    if (y1Physical <= y2Physical) {
      z0 = x1Depth;
      z2 = x2Depth;
    } else {
      z0 = x2Depth;
      z2 = x1Depth;
    }
    
    // For linear segment, control point is the midpoint
    const z1 = (z0 + z2) / 2;
    
    return { yMin, yMax, z0, z1, z2 };
  });
  
  console.log('[convertCurveDataToSegments] Converted', result.length, 'segments to physical coordinates:', result);
  return result;
};

export default function MirrorViewport({ videoRef, curveData, rotation, isActive, useRayTracing }) {
  return (
    <div className="w-full h-full flex items-center justify-center">
      {useRayTracing ? (
        <RayTracedMirror
          videoRef={videoRef}
          curveSegments={convertCurveDataToSegments(curveData)}
          mirrorDist={3.5}
          mirrorHalfWidth={2.0}
          mirrorHalfHeight={2.0}
          imagePlaneDist={1.0}
          imageSizeX={8}
          imageSizeY={6}
          fov={60.0}
          width={640}
          height={480}
        />
      ) : (
        <ClassicMirrorViewport
          videoRef={videoRef}
          curveData={curveData}
          rotation={rotation}
          isActive={isActive}
        />
      )}
    </div>
  );
}
