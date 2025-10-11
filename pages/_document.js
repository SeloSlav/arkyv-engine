import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta name="description" content="Arkyv Engine - An open-source text-based multi-user dungeon (MUD) for collaborative storytelling and exploration" />
        <meta name="robots" content="index, follow" />
        <meta name="language" content="English" />
      </Head>
      <body style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif" }}>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}