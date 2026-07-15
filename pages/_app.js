import React from 'react';
import Head from 'next/head';
import { AuthProvider } from '@/contexts/AuthContext';
import '@/styles/global.css';

export default function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <Head><link rel="icon" href="/arkyv_logo.jpg" /></Head>
      <Component {...pageProps} />
    </AuthProvider>
  );
}

