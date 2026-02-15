import React, { useState } from 'react';
import Mirror from "./MirrorCurveDesigner";
import './App.css';
import FunhouseMirrorWebcam from './FunhouseMirrorWebcam';

export default function App() {
  const [isDay, setIsDay] = useState(false);
  const [mirrorCurve, setMirrorCurve] = useState(null);
  const [isDone, setIsDone] = useState(false);

  const handleCurveChange = (curveData) => {
    console.log('App received curve data:', curveData);
    setMirrorCurve(curveData);
  };

  return (
    <div className="relative min-h-screen overflow-hidden text-white">

      {/* Toggle Button */}
      <button
        onClick={() => setIsDay(!isDay)}
        className="absolute z-20 top-5 right-5 bg-white/80 text-black px-4 py-2 rounded-lg shadow-md hover:bg-white"
      >
        {isDay ? "Switch to Night" : "Switch to Day"}
      </button>

      {/* Background SVG */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <radialGradient id="lightGlow">
            <stop offset="0%" stopColor="#fff176" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>

          <linearGradient id="tentStripe" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="50%" stopColor="#fcd34d" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>

        {/* Sky Gradient */}
        {!isDay ? (
          // Night Sky
          <linearGradient id="skyNight" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0f1237" />
            <stop offset="100%" stopColor="#000000" />
          </linearGradient>
        ) : (
          // Day Sky - nicer carnival gradient
          <linearGradient id="skyDay" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffe6c0" />    {/* soft peach */}
            <stop offset="40%" stopColor="#92fbff" />    {/* light pink */}
            <stop offset="100%" stopColor="#42c9ff" />   {/* sky blue */}
          </linearGradient>
        )}

        <rect width="1200" height="800" fill={isDay ? "url(#skyDay)" : "url(#skyNight)"} />

        {/* Stars (only night) */}
        {!isDay &&
          [...Array(25)].map((_, i) => {
            // Use seeded values to prevent stars from jumping on re-render
            const seed = 98765 + i * 500;
            const random = (offset) => {
              const x = Math.sin((seed + offset) * 12.9898) * 43758.5453;
              return x - Math.floor(x);
            };
            
            const cx = random(0) * 1200;
            const cyBase = 50 + random(1) * 250;
            const amplitude = 1 + random(2);
            const duration = 2 + random(3) * 3;
            const delay = random(4) * 2;
            const radius = 1 + random(5);
            
            return (
              <circle key={i} cx={cx} cy={cyBase} r={radius} fill="white">
                <animate
                  attributeName="cy"
                  values={`${cyBase - amplitude};${cyBase + amplitude};${cyBase - amplitude}`}
                  dur={`${duration}s`}
                  repeatCount="indefinite"
                  begin={`${delay}s`}
                />
                <animate
                  attributeName="opacity"
                  values="1;0.3;1"
                  dur={`${duration}s`}
                  repeatCount="indefinite"
                  begin={`${delay}s`}
                />
              </circle>
            );
          })}

        {/* Clouds (only day) */}
        {isDay &&
          [...Array(6)].map((_, i) => {
            const seed = 13579 + i * 300;
            const random = (offset) => {
              const x = Math.sin((seed + offset) * 12.9898) * 43758.5453;
              return x - Math.floor(x);
            };
            
            const y = 100 + i * 60;
            const scale = 0.5 + random(0) * 0.5;
            const numEllipses = 3 + Math.floor(random(1) * 3);
            const duration = 40 + i * 10;
            const xStart = -300 - i * 200;

            return (
              <g key={i}>
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  from={`${xStart} ${y}`}
                  to={`${1200 + 300} ${y}`}
                  dur={`${duration}s`}
                  repeatCount="indefinite"
                  begin="0s"
                />
                {[...Array(numEllipses)].map((_, j) => {
                  const ellipseSeed = seed + j * 100;
                  const ellipseRandom = (offset) => {
                    const x = Math.sin((ellipseSeed + offset) * 12.9898) * 43758.5453;
                    return x - Math.floor(x);
                  };
                  
                  const offsetX = -20 + ellipseRandom(0) * 40;
                  const offsetY = -10 + ellipseRandom(1) * 20;
                  const rx = 20 + ellipseRandom(2) * 20;
                  const ry = 10 + ellipseRandom(3) * 15;
                  const opacity = 0.6 + ellipseRandom(4) * 0.2;
                  
                  return (
                    <ellipse
                      key={j}
                      cx={offsetX}
                      cy={offsetY}
                      rx={rx * scale}
                      ry={ry * scale}
                      fill="white"
                      opacity={opacity}
                    />
                  );
                })}
              </g>
            );
          })}

        {/* Tents */}
        <polygon points="900,800 1050,400 1200,800" fill="url(#tentStripe)" />
        <polygon points="850,800 1000,350 1150,800" fill="url(#tentStripe)" opacity="0.7" />

        {/* Ferris Wheel */}
        <g transform="translate(300,550)">
          <circle r="150" stroke="#fbbf24" strokeWidth="6" fill="none" />

          <g>
            <line x1="0" y1="-150" x2="0" y2="150" stroke="#fbbf24" />
            <line x1="-150" y1="0" x2="150" y2="0" stroke="#fbbf24" />
            <line x1="-110" y1="-110" x2="110" y2="110" stroke="#fbbf24" />
            <line x1="110" y1="-110" x2="-110" y2="110" stroke="#fbbf24" />

            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0"
              to="360"
              dur="50s"
              repeatCount="indefinite"
            />

            {/* Gondolas */}
            {[...Array(8)].map((_, i) => {
              const angle = (i * 360) / 8;
              const rad = (angle * Math.PI) / 180;
              const x = 150 * Math.cos(rad);
              const y = 150 * Math.sin(rad);
              return (
                <g key={i} transform={`translate(${x},${y})`}>
                  <rect x="-12" y="-8" width="24" height="16" rx="3" ry="3" fill="#f87171">
                    <animateTransform
                      attributeName="transform"
                      type="rotate"
                      values="-10;10;-10"
                      dur="2s"
                      repeatCount="indefinite"
                      additive="sum"
                    />
                    <animateTransform
                      attributeName="transform"
                      type="rotate"
                      from="0"
                      to="-360"
                      dur="50s"
                      repeatCount="indefinite"
                    />
                  </rect>
                </g>
              );
            })}
          </g>
        </g>

        {/* Carnival Lights */}
        {[...Array(15)].map((_, i) => (
          <circle
            key={i}
            cx={100 + i * 70}
            cy="120"
            r="12"
            fill="url(#lightGlow)"
          >
            <animate
              attributeName="opacity"
              values="1;0.3;1"
              dur="3s"
              begin={`${i * 0.15}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}

        {/* Floating Balloons */}
        {[...Array(8)].map((_, i) => {
          // Use seeded values instead of Math.random() to prevent re-calculation on re-render
          const seed = 54321 + i * 1000;
          const random = (offset) => {
            const x = Math.sin((seed + offset) * 12.9898) * 43758.5453;
            return x - Math.floor(x);
          };
          
          const cx = 150 + i * 130 + random(0) * 50;
          const duration = 8 + random(1) * 4;
          const delay = i * 1.5;
          const wobbleAmount = 15 + random(2) * 10;
          const wobbleDuration = 2 + random(3) * 2;
          const wobbleDelay = random(4) * 2;
          const colors = ['#ef4444', '#f97316', '#fbbf24', '#a855f7', '#ec4899', '#06b6d4'];
          const color = colors[i % colors.length];
          
          return (
            <g key={i}>
              {/* Balloon string */}
              <line 
                x1={cx} 
                y1="900" 
                x2={cx} 
                y2="930" 
                stroke="#64748b" 
                strokeWidth="1.5"
              >
                <animate
                  attributeName="y1"
                  from="900"
                  to="-150"
                  dur={`${duration}s`}
                  begin={`${delay}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="y2"
                  from="930"
                  to="-120"
                  dur={`${duration}s`}
                  begin={`${delay}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="x1"
                  values={`${cx};${cx + wobbleAmount};${cx - wobbleAmount};${cx}`}
                  dur={`${wobbleDuration}s`}
                  begin={`${wobbleDelay}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="x2"
                  values={`${cx};${cx + wobbleAmount};${cx - wobbleAmount};${cx}`}
                  dur={`${wobbleDuration}s`}
                  begin={`${wobbleDelay}s`}
                  repeatCount="indefinite"
                />
              </line>
              
              {/* Balloon */}
              <ellipse 
                cx={cx} 
                cy="900" 
                rx="20" 
                ry="25" 
                fill={color}
                opacity="0.9"
              >
                <animate
                  attributeName="cy"
                  from="900"
                  to="-150"
                  dur={`${duration}s`}
                  begin={`${delay}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="cx"
                  values={`${cx};${cx + wobbleAmount};${cx - wobbleAmount};${cx}`}
                  dur={`${wobbleDuration}s`}
                  begin={`${wobbleDelay}s`}
                  repeatCount="indefinite"
                />
              </ellipse>
              
              {/* Balloon highlight */}
              <ellipse 
                cx={cx - 6} 
                cy="895" 
                rx="6" 
                ry="8" 
                fill="rgba(255, 255, 255, 0.5)"
              >
                <animate
                  attributeName="cy"
                  from="895"
                  to="-155"
                  dur={`${duration}s`}
                  begin={`${delay}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="cx"
                  values={`${cx - 6};${cx + wobbleAmount - 6};${cx - wobbleAmount - 6};${cx - 6}`}
                  dur={`${wobbleDuration}s`}
                  begin={`${wobbleDelay}s`}
                  repeatCount="indefinite"
                />
              </ellipse>
            </g>
          );
        })}
      </svg>

      {/* Floating Camera Box */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen gap-6 py-32">
        <div className="w-[400px] aspect-video bg-white rounded-3xl shadow-2xl border-8 border-red-500">
          <div className="w-full h-full bg-black rounded-2xl flex items-center justify-center text-white relative">
            {!isDone ? (
              <>
                <Mirror onCurveChange={handleCurveChange}/>
                <button
                  onClick={() => setIsDone(true)}
                  className="absolute bottom-4 right-4 bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-lg font-bold shadow-lg z-30"
                >
                  Done
                </button>
              </>
            ) : (
              <FunhouseMirrorWebcam curveData={mirrorCurve} />
            )}
          </div>
        </div>
        
        {/* Back button outside the box when in webcam mode */}
        {isDone && (
          <button
            onClick={() => setIsDone(false)}
            className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-3 rounded-lg font-bold shadow-lg text-lg"
          >
            ← Back to Designer
          </button>
        )}
      </div>

      {/* Header */}
      <div className="absolute top-10 w-full text-center z-10">
        <h1
          className={`text-6xl tracking-[0.4em] font-Circus text-shadow-lg ${
            isDay ? "text-pink-600 drop-shadow-[0_0_25px_rgba(255,255,200,0.8)]"
                    : "text-yellow-300 drop-shadow-[0_0_25px_rgba(255,200,0,0.8)]"
          }`}
        >
          MIRROROR
        </h1>
        <p
          className={`mt-2 tracking-wide text-2xl font-Circus text-shadow-lg ${
            isDay ? "text-pink-400 drop-shadow-[0_0_20px_rgba(255,255,200,0.7)] text-shadow-lg"
                    : "text-yellow-100 text-shadow-lg drop-shadow-[0_0_25px_rgba(255,200,0,0.8)]"
          }`}
        >
          STEP RIGHT UP
        </p>
      </div>
    </div>
  );
}