import React from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import '@/styles/global.css';

export default function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <Component {...pageProps} />
    </AuthProvider>
  );
}

