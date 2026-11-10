import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    // Imagens de heróis e itens (URLs vêm de /constants/* da OpenDota).
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.cloudflare.steamstatic.com",
        pathname: "/apps/dota2/images/dota_react/heroes/**",
      },
      {
        protocol: "https",
        hostname: "cdn.cloudflare.steamstatic.com",
        pathname: "/apps/dota2/images/dota_react/items/**",
      },
      {
        // Ícones dos cosméticos (image_path da OpenDota), v1.4.
        protocol: "https",
        hostname: "cdn.cloudflare.steamstatic.com",
        pathname: "/apps/570/icons/**",
      },
      {
        // Avatar da Steam no cabeçalho (players.avatar, vem da OpenDota), v2.0.
        protocol: "https",
        hostname: "avatars.steamstatic.com",
      },
    ],
  },
};

export default nextConfig;
