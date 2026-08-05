"use client";

import Script from "next/script";
import { useRef } from "react";

declare global {
  interface Window {
    SwaggerUIBundle?: {
      (config: Record<string, unknown>): unknown;
      presets: { apis: unknown };
    };
    SwaggerUIStandalonePreset?: unknown;
  }
}

const SWAGGER_UI_VERSION = "5";

export default function ApiDocsPage() {
  const loadedCount = useRef(0);

  function handleScriptLoad() {
    loadedCount.current += 1;
    if (loadedCount.current < 2) return;
    if (!window.SwaggerUIBundle || !window.SwaggerUIStandalonePreset) return;

    window.SwaggerUIBundle({
      url: "/api/openapi.yaml",
      dom_id: "#swagger-ui",
      presets: [window.SwaggerUIBundle.presets.apis, window.SwaggerUIStandalonePreset],
      layout: "StandaloneLayout",
    });
  }

  return (
    <>
      <link
        rel="stylesheet"
        href={`https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui.css`}
      />
      <Script
        src={`https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-bundle.js`}
        onLoad={handleScriptLoad}
      />
      <Script
        src={`https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-standalone-preset.js`}
        onLoad={handleScriptLoad}
      />
      <div id="swagger-ui" />
    </>
  );
}
