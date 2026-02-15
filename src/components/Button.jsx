import React from 'react';

export default function Button({ 
  children, 
  onClick, 
  className = '', 
  variant = 'primary',
  disabled = false,
  type = 'button',
  ...props 
}) {
  const baseClasses = `
    px-6 py-3 rounded-lg
    font-semibold text-base
    inline-flex items-center justify-center gap-2
    cursor-pointer border-2
    transition-all duration-200 ease-in-out
    select-none
    disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none
  `;

  const buttonStyle = {
    fontFamily: 'Cambria, serif'
  };
  
  const variantClasses = {
    primary: `
      bg-gradient-to-br from-red-500 to-red-700 text-white border-transparent
      shadow-md
      hover:shadow-lg hover:-translate-y-0.5
      active:translate-y-0 active:shadow-md
      focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-2
    `,
    secondary: `
      bg-gradient-to-br from-pink-400 via-pink-500 to-red-500 text-white border-transparent
      shadow-md
      hover:shadow-lg hover:-translate-y-0.5
      active:translate-y-0 active:shadow-md
      focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-500 focus-visible:outline-offset-2
    `,
    outline: `
      bg-transparent text-purple-500 border-purple-500
      hover:bg-purple-500 hover:text-white hover:-translate-y-0.5 hover:shadow-md
      active:translate-y-0
      focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-500 focus-visible:outline-offset-2
    `,
    ghost: `
      bg-white/10 text-white border-white/30 backdrop-blur-sm
      hover:bg-white/20 hover:border-white/50 hover:-translate-y-0.5
      active:translate-y-0 active:bg-white/15
      focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 focus-visible:outline-offset-2
    `
  };

  const variantClass = variantClasses[variant] || variantClasses.primary;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClass} ${className}`}
      style={buttonStyle}
      {...props}
    >
      {children}
    </button>
  );
}
