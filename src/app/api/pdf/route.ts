import { NextResponse, NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * API Route: GET /api/pdf?file=BIOphore.drawio.pdf
 * Serves actual PDF files from temp-project-data/ directory.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get('file');

    if (!fileName) {
      return NextResponse.json({ error: 'Missing "file" query parameter' }, { status: 400 });
    }

    // Sanitize: only allow .pdf extension, no path traversal
    const safeName = path.basename(fileName);
    if (!safeName.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), 'temp-project-data', safeName);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: `PDF file not found: ${safeName}` }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(fileBuffer.length),
        'Content-Disposition': `inline; filename="${safeName}"`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    console.error('PDF serve error:', err);
    return NextResponse.json({ error: 'Failed to serve PDF' }, { status: 500 });
  }
}
