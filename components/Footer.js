import React from 'react';

export default function Footer({ color = '#000000' }) {
  return (
    <footer className="border-t border-slate-800/70 py-8 text-center font-terminal text-sm" style={{ backgroundColor: color }}>
      <div className="text-gray-500">
        <p className="mb-2">&copy; {new Date().getFullYear()} Arkyv Engine</p>
        <p>
          Open Source &middot;{' '}
          <a href="https://github.com/SeloSlav/arkyv-engine" target="_blank" rel="noopener noreferrer" className="text-baby-blue hover:underline">
            View on GitHub
          </a>
          {' '}&middot; Built with Next.js &amp; AI
        </p>
      </div>
    </footer>
  );
}
