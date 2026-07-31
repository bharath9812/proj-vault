import React from 'react';
import { ProjectDetailsClient } from '@/components/projects/ProjectDetailsClient';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectPage({ params }: PageProps) {
  const resolvedParams = await params;
  const rawId = resolvedParams?.id || 'P-2408';
  const decodedId = decodeURIComponent(rawId);

  return <ProjectDetailsClient decodedId={decodedId} />;
}
