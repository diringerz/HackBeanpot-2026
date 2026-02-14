import React, { useRef, useState, useEffect } from 'react';

export default function WebcamMirror({ curveData }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isActive, setIsActive] = useState(false);
  const animationIdRef = useRef(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Wait for video to be ready
        videoRef.current.onloadedmetadata = () => {
          console.log('Video metadata loaded');
          videoRef.current.play().then(() => {
            console.log('Video playing');
            setIsActive(true);
          });
        };
      }
      
      console.log('Camera stream obtained');
    } catch (err) {
      console.error('Camera error:', err);
      alert('Camera error: ' + err.message);
    }
  };

  const stopCamera = () => {
    console.log('Stop button clicked');
    
    // Stop all tracks
    const stream = videoRef.current?.srcObject;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    
    // Stop animation loop
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = null;
    }
    
    setIsActive(false);
    console.log('Camera stopped, isActive set to false');
  };

  useEffect(() => {
    if (!isActive) {
      console.log('Not active, stopping any existing animation');
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null;
      }
      return;
    }

    console.log('Starting render loop');
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    
    const render = () => {
      if (!isActive) {
        console.log('Stopping render - isActive is false');
        return;
      }

      if (video.readyState >= video.HAVE_CURRENT_DATA) {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            console.log('Canvas resized to:', canvas.width, 'x', canvas.height);
          }
          
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
      }
      
      animationIdRef.current = requestAnimationFrame(render);
    };
    
    render();
    
    return () => {
      console.log('Cleanup render loop');
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null;
      }
    };
  }, [isActive]);

  return (
    <div>
      <h2>Webcam Mirror</h2>
      <video ref={videoRef} autoPlay playsInline muted style={{display: 'none'}} />
      <canvas ref={canvasRef} width="640" height="480" style={{border: '1px solid black'}} />
      <div>
        <button onClick={startCamera} disabled={isActive}>Start Camera</button>
        <button onClick={stopCamera} disabled={!isActive}>Stop Camera</button>
      </div>
      <p>Camera: {isActive ? 'Active' : 'Stopped'}</p>
      <p>Curve: {curveData ? `${curveData.points?.length || 0} points` : 'None'}</p>
    </div>
  );
}