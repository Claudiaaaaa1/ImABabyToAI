import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 确保环境变量在服务端可用
  env: {
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    DEFAULT_MODEL: process.env.DEFAULT_MODEL,
  },
};

export default nextConfig;
