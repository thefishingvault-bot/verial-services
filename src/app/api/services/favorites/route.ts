export const runtime = "edge";

export async function POST() {
  return new Response("Deprecated. Use POST /api/favorites/toggle", { status: 410 });
}

export async function DELETE() {
  return new Response("Deprecated. Use POST /api/favorites/toggle", { status: 410 });
}
