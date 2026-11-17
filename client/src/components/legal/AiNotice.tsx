import React from 'react';

/**
 * Says, where it happens, that something is sent to Google Gemini, with a link
 * to the details. Opens in a new tab so an open form or import isn't lost.
 */
const AiNotice: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <p className={`text-[11px] text-app-muted ${className}`}>
    {children}{' '}
    <a href="/privacy#gemini" target="_blank" rel="noopener noreferrer" className="text-primary font-semibold hover:brightness-125 whitespace-nowrap">
      How it's handled
    </a>
  </p>
);

export default AiNotice;
