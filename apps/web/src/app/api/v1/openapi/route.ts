import { NextResponse } from 'next/server';

export async function GET() {
  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'UniVerse Institutional REST API',
      version: '1.0.0',
      description: 'Programmatic API for university management, SIS integration, and automated grading.',
    },
    servers: [{ url: '/api/v1' }],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'uv_live_...',
        },
      },
    },
    security: [{ BearerAuth: [] }],
    paths: {
      '/courses': {
        get: { summary: 'List academic courses', responses: { '200': { description: 'Success' } } },
        post: { summary: 'Create new course', responses: { '201': { description: 'Created' } } },
      },
      '/students': {
        get: { summary: 'List enrolled students', responses: { '200': { description: 'Success' } } },
      },
      '/grades': {
        get: { summary: 'List course grades', responses: { '200': { description: 'Success' } } },
      },
      '/attendance': {
        get: { summary: 'List attendance sessions', responses: { '200': { description: 'Success' } } },
      },
    },
  };

  return NextResponse.json(spec, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
