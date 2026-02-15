import React from 'react';
import MirrorViewport from './MirrorViewport';

export default function FunhouseMirrorWebcam({ videoRef, curveData, rotation, isActive, useRayTracing }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center">
      {/* Hidden video element for camera feed */}
      <video ref={videoRef} autoPlay playsInline muted style={{display: 'none'}} />
      
      {/* Mirror Viewport */}
      <MirrorViewport
        videoRef={videoRef}
        curveData={curveData}
        rotation={rotation}
        isActive={isActive}
        useRayTracing={useRayTracing}
      />
    </div>
  );
}