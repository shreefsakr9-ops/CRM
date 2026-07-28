import type { NextRequest } from 'next/server';
import { globalSearch } from '@/server/services/search';
import { apiError, ok } from '@/lib/api';

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q') ?? '';
    const groups = await globalSearch(q);
    return ok({ groups });
  } catch (error) {
    return apiError(error);
  }
}
