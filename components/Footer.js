import React from 'react';

export default function Footer({ color = '#000000' }) {
  return (
    <footer 
      className="py-8 text-center font-terminal text-sm"
      style={{ backgroundColor: color }}
    >
      <div className="text-gray-500">
        <p className="mb-2">© {new Date().getFullYear()} Arkyv Engine</p>
        <p>
          Open Source •{' '}
          <a 
            href="https://github.com/SeloSlav/arkyv-engine" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-baby-blue hover:underline"
          >
            View on GitHub
          </a>
          {' '}• Built with Next.js & AI
        </p>
      </div>
    </footer>
  );
}

