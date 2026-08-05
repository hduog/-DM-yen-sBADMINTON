import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Phục vụ file openapi.yaml ở gốc repo dưới dạng response tĩnh — dùng cho trang /api-docs (Swagger UI).
export async function GET() {
  const filePath = path.join(process.cwd(), "openapi.yaml");
  const content = await readFile(filePath, "utf8");
  return new NextResponse(content, {
    headers: { "Content-Type": "application/yaml; charset=utf-8" },
  });
}
