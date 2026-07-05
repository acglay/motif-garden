'use client';

import dynamic from 'next/dynamic';

const Studio = dynamic(() => import('@/components/studio'), { ssr: false });

export default function Home() {
  return <Studio />;
}
