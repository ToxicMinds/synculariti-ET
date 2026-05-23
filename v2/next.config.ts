import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@synculariti/whatsapp-client'],
  async rewrites() {
    return [
      {
        source: "/ekasa-proxy/:match*",
        destination: "https://ekasa.financnasprava.sk/mdu/api/v1/opd/:match*",
      },
    ];
  },
};

export default nextConfig;
