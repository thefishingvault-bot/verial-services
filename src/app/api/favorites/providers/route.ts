export const runtime = "edge";

export async function GET() {
  return new Response("Provider favorites API is deprecated. Use /api/favorites/list.", {
    status: 410,
  });
}

export async function POST() {
  return new Response("Provider favorites API is deprecated. Use /api/favorites/toggle.", {
    status: 410,
  });
}
