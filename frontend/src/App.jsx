import { useState } from "react";
import './App.css';

export default function App() {
  const [isDay, setIsDay] = useState(false);

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
            const cx = Math.random() * 1200;
            const cyBase = 50 + Math.random() * 250;
            const amplitude = 1 + Math.random();
            const duration = 2 + Math.random() * 3;
            const delay = Math.random() * 2;
            return (
              <circle key={i} cx={cx} cy={cyBase} r={1 + Math.random()} fill="white">
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
            const y = 100 + i * 60;
            const scale = 0.5 + Math.random() * 0.5;
            const numEllipses = 3 + Math.floor(Math.random() * 3);
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
                  const offsetX = -20 + Math.random() * 40;
                  const offsetY = -10 + Math.random() * 20;
                  const rx = 20 + Math.random() * 20;
                  const ry = 10 + Math.random() * 15;
                  const opacity = 0.6 + Math.random() * 0.2;
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
      </svg>

      {/* Floating Camera Box */}
      <div className="relative z-10 flex items-center justify-center min-h-screen">
        <div className="w-[600px] aspect-video bg-white rounded-3xl shadow-2xl border-8 border-red-500 rotate-[-2deg]">
          <div className="w-full h-full bg-black rounded-2xl flex items-center justify-center text-white">
            CAMERA FEED
          </div>
        </div>
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
