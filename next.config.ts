import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  images: {
    /**
     * Uploaded product photos are served from Cloudinary, and `next/image`
     * refuses any host not listed here — which made every product with an
     * uploaded photo render a 500 while the seeded ones, using local SVGs,
     * worked fine.
     *
     * Scoped to this account's delivery path rather than the whole domain, so
     * another Cloudinary tenant cannot have images proxied through our
     * optimiser and billed to us.
     */
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/hva1f8dq/**",
      },
      // Google profile pictures, for accounts that signed in with Google.
      { protocol: "https", hostname: "lh3.googleusercontent.com", pathname: "/**" },
    ],
    // The seeded placeholders are SVGs; the CSP below is what makes serving them
    // safe, since an SVG can otherwise carry script.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default withNextIntl(nextConfig);
