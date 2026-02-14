import React, { useState } from 'react';
import MirrorCurveDesigner from './MirrorCurveDesigner';
import FunhouseMirrorWebcam from './funhouseMirror';

function App() {
  const [mirrorCurve, setMirrorCurve] = useState(null);

  const handleCurveChange = (curveData) => {
    console.log('App received curve data:', curveData);
    setMirrorCurve(curveData);
  };

  console.log('App render - mirrorCurve:', mirrorCurve);

  return (
    <div style={{ padding: '20px' }}>
      <h1>Funhouse Mirror Application</h1>
      
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: '20px',
        marginTop: '20px'
      }}>
        {/* Left side - Curve Designer */}
        <div>
          <MirrorCurveDesigner onCurveChange={handleCurveChange} />
        </div>

        {/* Right side - Webcam with Mirror Effect */}
        <div>
          <FunhouseMirrorWebcam curveData={mirrorCurve} />
        </div>
      </div>

      {/* Debug Info */}
      <div style={{ marginTop: '20px', padding: '10px', background: '#f0f0f0' }}>
        <h3>Debug Info:</h3>
        <p>Curve defined: {mirrorCurve ? 'Yes' : 'No'}</p>
        {mirrorCurve && (
          <>
            <p>Control points: {mirrorCurve.points?.length || 0}</p>
            <p>Line segments: {mirrorCurve.lineSegments?.length || 0}</p>
          </>
        )}
      </div>
    </div>
  );
}

export default App;